// Entry point for `bun run corpus:smoke`. Fetches the curated extensions with
// the task-0011 fetch script, then bundles and runs every manifest command of
// each curated extension through the task-0013 host — deny-all broker,
// manifest-declared preference defaults — waiting for the first scene, the
// exit, or a timeout. Writes `compat/smoke.json` and `compat/SMOKE.md`.
// Failures are the report's data, not errors: nothing here fixes Blast, and
// extension files are never modified.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  bundleCommand,
  createBroker,
  MissingDependencyError,
  startCommand,
  type BundledCommand,
  type Session,
} from "../../packages/host/src/index.ts";
import { CORPUS_DIR, directoryBytes, megabytes, readPin } from "./corpus.ts";
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
 * First non-null scene, exit, or timeout — whichever comes first. The probe
 * keeps raw messages; sanitation happens once, when the result is built.
 */
function firstSceneOrExit(session: Session, timeoutMs: number): Promise<ProbeResult> {
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
  if (mode !== "view" && mode !== "no-view") {
    // The runtime rejects menu-bar outright; do not bother bundling.
    return build({ kind: "unsupported-mode", reason: `command mode "${mode}" is not supported` });
  }
  let bundled: BundledCommand;
  try {
    bundled = await bundleCommand({ extensionDir, command: commandName });
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
        broker: createBroker({}),
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
    const probe = await firstSceneOrExit(session, SCENE_TIMEOUT_MS);
    const warnings = logLines(session, "warn", clean);
    const errorLogs = logLines(session, "error", clean);
    return build(probe, warnings, errorLogs);
  } finally {
    await session?.shutdown({ timeoutMs: 250 });
    await rm(outDir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const root = process.cwd();
  const pin = readPin(root);
  const fetch = spawnSync("bun", ["scripts/corpus/fetch.ts", "--curated"], { stdio: "inherit" });
  if (fetch.status !== 0) throw new Error("curated fetch failed; see output above");
  const cacheMb = megabytes(directoryBytes(join(root, ".cache")));
  console.log(`corpus:smoke: .cache is ${cacheMb} MB after fetch`);

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
  for (const extension of [...pin.curated].toSorted()) {
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

  const report = buildReport(pin.commit, results, extensionFailures);
  await writeFile(join(root, "compat/smoke.json"), renderJsonReport(report));
  await writeFile(join(root, "compat/SMOKE.md"), renderMarkdownReport(report));
  const totals = Object.entries(report.totals)
    .map(([outcome, count]) => `${outcome} ${count}`)
    .join(", ");
  console.log(`corpus:smoke: wrote compat/smoke.json and compat/SMOKE.md (${totals})`);
}

try {
  await main();
} catch (error) {
  console.error(`corpus:smoke: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
