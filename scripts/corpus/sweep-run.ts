// Entry point for `bun run corpus:sweep`. Fetching is the only networked step;
// every bundle and runtime is delegated to sweep-command.ts under Seatbelt.
import { existsSync, readdirSync, statfsSync } from "node:fs";
import { appendFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { fetchBatch } from "./batch.ts";
import {
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
  type CommandResult,
  type Manifest,
} from "./smoke.ts";
import {
  buildSweepReport,
  parseSweepArgs,
  parseSweepLog,
  renderSweepJson,
  renderSweepMarkdown,
  resultKey,
  selectExtensions,
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
    probe: { kind: "exit", code: 1, signal: null, error: { message } },
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

async function runOneSandboxed(
  root: string,
  extension: string,
  command: string,
  scratch: string,
  unsandboxed: boolean,
): Promise<CommandResult> {
  const extensionDir = join(root, CORPUS_DIR, "extensions", extension);
  const outcome = await runSandboxed({
    script: "scripts/corpus/sweep-command.ts",
    args: [extension, extensionDir, command, scratch],
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
        );
        await onResult({ extension: task.extension, command: task.command, result });
      } finally {
        await rm(scratch, { recursive: true, force: true });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(jobs, Math.max(1, tasks.length)) }, worker));
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
  let resumedCount = 0;
  try {
    ensureDisk(root, maxMb);
    // Manifests are cheap and let us select deterministically before checking
    // out any extension source. Source batches are fetched only after this.
    peakBytes = Math.max(peakBytes, fetchBatch([], root));
    const allNames = await readManifests(root);
    selected = selectExtensions(allNames, options.limit, options.seed);
    const fullPopulation = allNames.length;
    console.log(
      `corpus:sweep: ${selected.length}/${fullPopulation} extensions, ${options.jobs} jobs`,
    );
    const batchSize = Math.max(1, Math.min(20, Math.floor(maxMb / 15) || 1));
    for (let offset = 0; offset < selected.length; offset += batchSize) {
      if (interrupted) throw new Error("sweep interrupted");
      ensureDisk(root, maxMb);
      const batch = selected.slice(offset, offset + batchSize);
      peakBytes = Math.max(peakBytes, fetchBatch(batch, root));
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
      await runTasks(root, tasks, options.jobs, options.unsandboxed, async (entry) => {
        await appendFile(logPath, `${JSON.stringify(entry)}\n`);
        previous.set(resultKey(entry.extension, entry.command), entry);
      });
      if (interrupted) throw new Error("sweep interrupted");
      peakBytes = Math.max(peakBytes, directoryBytes(join(root, ".cache")));
      // The next sparse checkout drops this batch's source and build output;
      // each command's scratch was removed by runTasks already.
    }
  } finally {
    if (existsSync(join(root, CORPUS_DIR))) {
      try {
        fetchBatch([], root);
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
    fullPopulation: 1939,
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
