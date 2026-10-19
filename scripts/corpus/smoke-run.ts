// Entry point for `bun run corpus:smoke`. Fetches the curated extensions in
// budget-sized batches with the task-0011 fetch script (task 0051), then
// bundles and runs every manifest command of each curated extension through
// the task-0013 host — deny-all broker plus the headless read-only defaults
// (task 0026), manifest-declared preference defaults — waiting for the first
// scene, the exit, or a timeout. Writes `compat/smoke.json` and
// `compat/SMOKE.md`. Failures are the report's data, not errors: nothing
// here fixes Blast, and extension files are never modified.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  bundleCommand,
  createBroker,
  createHeadlessHandlers,
  MissingDependencyError,
  startCommand,
  type BundledCommand,
  type Session,
} from "../../packages/host/src/index.ts";
import {
  batchSize,
  CORPUS_DIR,
  directoryBytes,
  maxMbFromEnv,
  megabytes,
  readPin,
} from "./corpus.ts";
import {
  buildReport,
  buildResult,
  compactLine,
  compactLines,
  commandMode,
  countNodes,
  extractPreferenceDefaults,
  manifestCommands,
  renderJsonReport,
  renderMarkdownReport,
  requiredArguments,
  sanitizePath,
  type CommandResult,
  type Manifest,
  type ProbeResult,
} from "./smoke.ts";

/** How long one command may take to publish its first scene (or exit). */
const SCENE_TIMEOUT_MS = 5000;
/** Warnings kept per command, after deduplication. */
const MAX_WARNINGS = 5;
/** Error-level log lines kept for a crash. */
const MAX_ERROR_LOGS = 3;

/**
 * First non-null scene, first empty menu bar, exit, or timeout — whichever comes
 * first. A menu-bar command that renders `null` publishes a scene with no root,
 * which Raycast shows as an empty menu bar (task 0033); every other mode keeps
 * waiting for a root. The probe keeps raw messages; sanitation happens once,
 * when the result is built.
 */
function firstSceneOrExit(session: Session, timeoutMs: number, mode: string): Promise<ProbeResult> {
  return new Promise((resolve) => {
    let settled = false;
    let unsubscribe: (() => void) | undefined;
    const finish = (probe: ProbeResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe?.();
      resolve(probe);
    };
    const timer = setTimeout(() => finish({ kind: "timeout", timeoutMs }), timeoutMs);
    unsubscribe = session.scenes((scene) => {
      if (scene.root) {
        finish({
          kind: "scene",
          nodeCount: countNodes(scene.root),
          rootType: scene.root.type,
        });
      } else if (mode === "menu-bar") {
        finish({ kind: "empty-menu-bar" });
      }
    });
    void session.exited.then((exit) => {
      const code = (exit.error as { code?: unknown } | undefined)?.code;
      finish({
        kind: "exit",
        code: exit.code,
        signal: exit.signal,
        ...(exit.error
          ? {
              error: {
                message: exit.error.message,
                ...(typeof code === "string" ? { code } : {}),
              },
            }
          : {}),
      });
    });
  });
}

function logLines(
  session: Session,
  level: "warn" | "error",
  clean: (text: string) => string,
): string[] {
  const messages = session.logs.filter((log) => log.level === level).map((log) => log.message);
  if (level === "warn") return [...new Set(messages)].slice(0, MAX_WARNINGS).map(clean);
  return (compactLines(messages, MAX_ERROR_LOGS) ?? []).map(clean);
}

/** Bundle, start and observe one command; always cleans up what it created. */
async function runOne(
  extension: string,
  extensionDir: string,
  manifest: Manifest,
  commandName: string,
  clean: (text: string) => string,
): Promise<CommandResult> {
  const mode = commandMode(manifest, commandName) ?? "view";
  const build = (probe: ProbeResult, warnings?: string[], errorLogs?: string[]): CommandResult =>
    buildResult({ extension, command: commandName, mode, probe, warnings, errorLogs });
  const names = requiredArguments(manifest, commandName);
  if (names.length) return build({ kind: "missing-arguments", names });
  let bundled: BundledCommand;
  try {
    bundled = await bundleCommand({
      extensionDir,
      command: commandName,
      installedDependencies: false,
    });
  } catch (error) {
    if (error instanceof MissingDependencyError) {
      return build({ kind: "bundle-failed", missing: error.packages });
    }
    return build({
      kind: "bundle-failed",
      error: clean(error instanceof Error ? error.message : String(error)),
    });
  }
  const outDir = dirname(bundled.entry);
  let session: Session | undefined;
  try {
    try {
      session = await startCommand({
        ...bundled,
        // Deny-all apart from Blast's headless read-only defaults, so a command
        // that only reads applications, the clipboard or its preferences still
        // renders; the report header records the policy.
        broker: createBroker(createHeadlessHandlers()),
        preferences: extractPreferenceDefaults(manifest, commandName),
      });
    } catch (error) {
      // Startup failures (handshake, exit before ready) are crashes too.
      const code = (error as { code?: unknown }).code;
      return build(
        {
          kind: "exit",
          code: null,
          signal: null,
          error: {
            message: error instanceof Error ? error.message : String(error),
            ...(typeof code === "string" ? { code } : {}),
          },
        },
        [],
        [],
      );
    }
    const probe = await firstSceneOrExit(session, SCENE_TIMEOUT_MS, mode);
    const warnings = logLines(session, "warn", clean);
    const errorLogs = logLines(session, "error", clean);
    return build(probe, warnings, errorLogs);
  } finally {
    await session?.shutdown({ timeoutMs: 250 });
    await rm(outDir, { recursive: true, force: true });
  }
}

/**
 * Narrow the corpus checkout to exactly these extensions (empty means
 * manifest-only) via `corpus:fetch`, the one script allowed to run git for
 * the corpus. `sparse-checkout set` drops every extension not listed from
 * the working tree, so calling this with the next batch is how the previous
 * batch's checkout gets dropped before it starts.
 */
function fetchBatch(extensions: string[], root: string): number {
  const args = ["scripts/corpus/fetch.ts", ...extensions.flatMap((name) => ["--extension", name])];
  const fetch = spawnSync("bun", args, { stdio: "inherit" });
  if (fetch.status !== 0) throw new Error("corpus fetch failed; see output above");
  return directoryBytes(join(root, ".cache"));
}

async function main(): Promise<void> {
  const root = process.cwd();
  const pin = readPin(root);
  const maxMb = maxMbFromEnv(process.env);
  const size = batchSize(maxMb);
  const curated = [...pin.curated].toSorted();
  console.log(`corpus:smoke: ${curated.length} curated extensions in batches of ${size}`);

  // Path prefixes that must never appear in a committed report.
  const clean = (text: string): string =>
    compactLine(
      sanitizePath(text, [
        [root, "<repo>"],
        [tmpdir(), "<tmp>"],
      ]),
    );
  const results: CommandResult[] = [];
  const extensionFailures: { extension: string; error: string }[] = [];
  let peakBytes = 0;
  try {
    for (let offset = 0; offset < curated.length; offset += size) {
      const batch = curated.slice(offset, offset + size);
      peakBytes = Math.max(peakBytes, fetchBatch(batch, root));
      console.log(`corpus:smoke: batch .cache is ${megabytes(peakBytes)} MB (peak so far)`);
      for (const extension of batch) {
        const extensionDir = join(root, CORPUS_DIR, "extensions", extension);
        const manifestPath = join(extensionDir, "package.json");
        if (!existsSync(manifestPath)) {
          extensionFailures.push({ extension, error: "manifest missing from the checkout" });
          continue;
        }
        let manifest: Manifest;
        try {
          manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;
        } catch (error) {
          extensionFailures.push({
            extension,
            error: clean(error instanceof Error ? error.message : String(error)),
          });
          continue;
        }
        const commands = manifestCommands(manifest);
        if (commands.length === 0) {
          extensionFailures.push({ extension, error: "manifest declares no commands" });
          continue;
        }
        for (const commandName of commands) {
          process.stdout.write(`corpus:smoke: ${extension}/${commandName}: `);
          const result = await runOne(extension, extensionDir, manifest, commandName, clean);
          console.log(result.outcome);
          results.push(result);
        }
      }
    }
  } finally {
    // Leave the checkout minimal: every extension dropped from the sparse
    // set once its batch is done.
    fetchBatch([], root);
  }

  const report = buildReport(pin.commit, results, extensionFailures);
  await writeFile(join(root, "compat/smoke.json"), renderJsonReport(report));
  await writeFile(join(root, "compat/SMOKE.md"), renderMarkdownReport(report));
  const totals = Object.entries(report.totals)
    .map(([outcome, count]) => `${outcome} ${count}`)
    .join(", ");
  console.log(
    `corpus:smoke: wrote compat/smoke.json and compat/SMOKE.md (${totals}), peak .cache ${megabytes(peakBytes)} MB`,
  );
}

try {
  await main();
} catch (error) {
  console.error(`corpus:smoke: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
