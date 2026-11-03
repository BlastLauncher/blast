// Entry point for `bun run corpus:sweep`. Fetching is the only networked step;
// every bundle and runtime is delegated to sweep-command.ts under Seatbelt.
import { existsSync, readdirSync, readFileSync, statfsSync } from "node:fs";
import { appendFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { fetchBatch } from "./batch.ts";
import {
  batchSize,
  checkDiskBudget,
  CORPUS_DIR,
  directoryBytes,
  maxMbFromEnv,
  megabytes,
  readPin,
} from "./corpus.ts";
import {
  buildResult,
  compactLine,
  manifestCommands,
  sanitizeReportText,
  type CommandResult,
  type Manifest,
} from "./smoke.ts";
import { bundleOne } from "./smoke-command.ts";
import {
  buildSweepReport,
  parseSweepArgs,
  parseSweepLog,
  renderSweepJson,
  renderSweepMarkdown,
  resultKey,
  selectSatisfiedExtensions,
  SWEEP_JSON,
  SWEEP_LOG,
  SWEEP_MD,
  type SweepLogEntry,
} from "./sweep.ts";
import { runSandboxed, sandboxAvailable } from "./sandbox.ts";

const FREE_SPACE_FLOOR = 20 * 1024 ** 3;
const LOG_DIR = ".cache/sweep";
const SCRATCH_DIR = `${LOG_DIR}/scratch`;
let interrupted = false;
process.on("SIGINT", () => {
  interrupted = true;
});
process.on("SIGTERM", () => {
  interrupted = true;
});

function freeBytes(path: string): number {
  const stats = statfsSync(path);
  return Number(stats.bavail) * Number(stats.bsize);
}

function ensureDisk(root: string, maxMb: number): void {
  const free = freeBytes(root);
  if (free < FREE_SPACE_FLOOR)
    throw new Error(`free space ${megabytes(free)} MB is below the 20 GB sweep floor`);
  const over = checkDiskBudget(directoryBytes(join(root, ".cache")), maxMb);
  if (over !== undefined) throw new Error(over);
}

function parseResult(stdout: string): CommandResult | undefined {
  const lines = stdout.split("\n").filter((line) => line.startsWith("SWEEP_RESULT "));
  const line = lines.at(-1);
  if (!line) return undefined;
  try {
    return JSON.parse(line.slice("SWEEP_RESULT ".length)) as CommandResult;
  } catch {
    return undefined;
  }
}

function failedResult(extension: string, command: string, message: string): CommandResult {
  return buildResult({
    extension,
    command,
    mode: "view",
    probe: {
      kind: "exit",
      code: 1,
      signal: null,
      error: { message: sanitizeReportText(message) },
    },
  });
}

async function readManifests(root: string): Promise<string[]> {
  const extensionsDir = join(root, CORPUS_DIR, "extensions");
  return readdirSync(extensionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => existsSync(join(extensionsDir, entry.name, "package.json")))
    .map((entry) => entry.name)
    .toSorted();
}

async function satisfiedNames(root: string, allNames: readonly string[]): Promise<string[]> {
  const value = JSON.parse(await readFile(join(root, "compat/dependencies.json"), "utf8")) as {
    shared?: { satisfiedExtensions?: unknown };
  };
  if (!Array.isArray(value.shared?.satisfiedExtensions))
    throw new Error(
      "compat/dependencies.json is missing shared.satisfiedExtensions; rerun corpus:scan",
    );
  const known = new Set(
    value.shared.satisfiedExtensions.filter((name): name is string => typeof name === "string"),
  );
  return allNames.filter((name) => known.has(name));
}

async function runOneSandboxed(
  root: string,
  extension: string,
  command: string,
  scratch: string,
  unsandboxed: boolean,
  probeActions: boolean,
): Promise<CommandResult> {
  const extensionDir = join(root, CORPUS_DIR, "extensions", extension);
  const manifest = JSON.parse(
    await readFile(join(extensionDir, "package.json"), "utf8"),
  ) as Manifest;
  const clean = (text: string): string =>
    compactLine(
      sanitizeReportText(
        text,
        [
          [root, "<repo>"],
          [scratch, "<scratch>"],
        ],
        homedir(),
      ),
    );
  // esbuild's native helper is a toolchain binary, not extension code. Build
  // it outside Seatbelt into this command's scratch, then launch only the
  // bundled extension under the strict Bun/Node process-exec allowlist.
  const bundle = await bundleOne(
    extensionDir,
    command,
    {
      installedDependencies: false,
      outDir: join(scratch, "bundle"),
    },
    clean,
  );
  if (!bundle.ok)
    return buildResult({
      extension,
      command,
      mode: manifest.commands?.find((item) => item.name === command)?.mode ?? "view",
      probe: bundle.probe,
    });
  const bundlePath = join(scratch, "bundle.json");
  await writeFile(bundlePath, JSON.stringify(bundle.bundled));
  const outcome = await runSandboxed({
    script: "scripts/corpus/sweep-command.ts",
    args: [
      extension,
      extensionDir,
      command,
      scratch,
      bundlePath,
      ...(probeActions ? ["--probe-actions"] : []),
    ],
    scratch,
    root,
    unsandboxed,
    bun: process.execPath,
  });
  const result = parseResult(outcome.stdout);
  if (result) return result;
  const detail = compactLine(
    `sandbox child exited ${outcome.signal ? `with ${outcome.signal}` : `with code ${outcome.code}`}: ${outcome.stderr || outcome.stdout}`,
  );
  return failedResult(extension, command, detail || "sandbox child produced no result");
}

async function runTasks(
  root: string,
  tasks: Array<{ extension: string; command: string }>,
  jobs: number,
  unsandboxed: boolean,
  probeActions: boolean,
  onResult: (entry: SweepLogEntry) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < tasks.length) {
      const task = tasks[cursor++];
      if (!task) return;
      const scratch = await mkdtemp(join(root, `${SCRATCH_DIR}/unit-`));
      try {
        const result = await runOneSandboxed(
          root,
          task.extension,
          task.command,
          scratch,
          unsandboxed,
          probeActions,
        );
        await onResult({ extension: task.extension, command: task.command, result });
      } finally {
        await rm(scratch, { recursive: true, force: true });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(jobs, Math.max(1, tasks.length)) }, worker));
}

/** Manifest commands of one extension from the checkout, or none if unreadable. */
function manifestCommandsOf(root: string, extension: string): string[] {
  try {
    const path = join(root, CORPUS_DIR, "extensions", extension, "package.json");
    return manifestCommands(JSON.parse(readFileSync(path, "utf8")) as Manifest);
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  const root = process.cwd();
  const options = parseSweepArgs(process.argv.slice(2));
  if (!sandboxAvailable() && !options.unsandboxed)
    throw new Error("corpus:sweep refuses to run outside macOS without --unsandboxed");
  const pin = readPin(root);
  const maxMb = maxMbFromEnv(process.env);
  await mkdir(join(root, SCRATCH_DIR), { recursive: true });
  await mkdir(join(root, LOG_DIR), { recursive: true });
  const logPath = join(root, SWEEP_LOG);
  const previous =
    options.resume && existsSync(logPath)
      ? parseSweepLog(await readFile(logPath, "utf8"))
      : new Map();
  if (!options.resume)
    await writeFile(
      logPath,
      `${JSON.stringify({ type: "meta", seed: options.seed, commit: pin.commit })}\n`,
    );
  const initial = directoryBytes(join(root, ".cache"));
  let peakBytes = initial;
  const started = performance.now();
  let selected: string[] = [];
  let fullPopulation = 0;
  let resumedCount = 0;
  try {
    ensureDisk(root, maxMb);
    // Manifests are cheap and let us select deterministically before checking
    // out any extension source. Source batches are fetched only after this.
    peakBytes = Math.max(peakBytes, await fetchBatch([], root));
    const allNames = await readManifests(root);
    const satisfied = await satisfiedNames(root, allNames);
    fullPopulation = satisfied.length;
    selected = selectSatisfiedExtensions(allNames, satisfied, options.limit, options.seed);
    console.log(
      `corpus:sweep: ${selected.length}/${fullPopulation} extensions, ${options.jobs} jobs`,
    );
    const size = batchSize(maxMb);
    for (let offset = 0; offset < selected.length; offset += size) {
      if (interrupted) throw new Error("sweep interrupted");
      ensureDisk(root, maxMb);
      const batch = selected.slice(offset, offset + size);
      // Decide from the manifest-only checkout what is left before fetching
      // sources: a resumed run must not re-download batches it already finished
      // (fetched blobs stay in the partial clone, so that only grows .cache).
      const pending = batch.filter((extension) =>
        manifestCommandsOf(root, extension).some(
          (command) => !previous.has(resultKey(extension, command)),
        ),
      );
      if (pending.length === 0) {
        for (const extension of batch) resumedCount += manifestCommandsOf(root, extension).length;
        continue;
      }
      peakBytes = Math.max(peakBytes, await fetchBatch(batch, root));
      ensureDisk(root, maxMb);
      const tasks: Array<{ extension: string; command: string }> = [];
      for (const extension of batch) {
        const manifestPath = join(root, CORPUS_DIR, "extensions", extension, "package.json");
        let manifest: Manifest;
        try {
          manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;
        } catch {
          continue;
        }
        for (const command of manifestCommands(manifest)) {
          if (previous.has(resultKey(extension, command))) resumedCount += 1;
          else tasks.push({ extension, command });
        }
      }
      await runTasks(
        root,
        tasks,
        options.jobs,
        options.unsandboxed,
        options.probeActions,
        async (entry) => {
          await appendFile(logPath, `${JSON.stringify(entry)}\n`);
          previous.set(resultKey(entry.extension, entry.command), entry);
        },
      );
      if (interrupted) throw new Error("sweep interrupted");
      peakBytes = Math.max(peakBytes, directoryBytes(join(root, ".cache")));
      // The next sparse checkout drops this batch's source and build output;
      // each command's scratch was removed by runTasks already.
    }
  } finally {
    if (existsSync(join(root, CORPUS_DIR))) {
      try {
        await fetchBatch([], root);
      } catch {
        // Preserve the original failure; the final cleanup below still runs.
      }
      await rm(join(root, CORPUS_DIR), { recursive: true, force: true });
    }
    await rm(join(root, SCRATCH_DIR), { recursive: true, force: true });
  }
  ensureDisk(root, maxMb);
  const entries = [...previous.values()].filter((entry) => selected.includes(entry.extension));
  const report = buildSweepReport({
    commit: pin.commit,
    seed: options.seed,
    selectedExtensions: selected.length,
    results: entries.map((entry) => entry.result),
    peakBytes,
    wallMs: performance.now() - started,
    resumed: resumedCount,
    fullPopulation,
    probeActions: options.probeActions,
  });
  await writeFile(join(root, SWEEP_JSON), renderSweepJson(report));
  await writeFile(join(root, SWEEP_MD), renderSweepMarkdown(report));
  console.log(
    `corpus:sweep: wrote ${SWEEP_JSON} and ${SWEEP_MD}; peak .cache ${megabytes(peakBytes)} MB`,
  );
}

try {
  await main();
} catch (error) {
  console.error(`corpus:sweep: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
