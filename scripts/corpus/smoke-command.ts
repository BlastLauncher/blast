// The impure per-command step the smoke runners share (`smoke-run.ts`,
// `smoke-deps-run.ts`): bundle one manifest command, start it through the
// task-0013 host with Blast's headless broker, and observe its first scene or
// exit. The runners differ only in how dependencies resolve, so that is a
// parameter; classification stays in `smoke.ts`.
import { createHeadlessHandlers } from "../../packages/cli/src/index.ts";
import { rm } from "node:fs/promises";
import { dirname } from "node:path";
import {
  bundleCommand,
  createBroker,
  MissingDependencyError,
  startCommand,
  type BundledCommand,
  type Session,
} from "../../packages/host/src/index.ts";
import {
  buildResult,
  compactLines,
  commandMode,
  countNodes,
  exitProbe,
  extractPreferenceDefaults,
  requiredArguments,
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

export type DependencyMode = {
  /** `false` is the allowlist-only resolution of `corpus:smoke` (decision 0008). */
  installedDependencies: boolean;
  /** Where `blast deps` installed the extension, when `installedDependencies` is on. */
  dataDir?: string;
};

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
      finish(exitProbe(exit));
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

export type BundleOutcome =
  | { ok: true; bundled: BundledCommand }
  | { ok: false; probe: ProbeResult };

export async function bundleOne(
  extensionDir: string,
  commandName: string,
  dependencies: DependencyMode,
  clean: (text: string) => string,
): Promise<BundleOutcome> {
  try {
    const bundled = await bundleCommand({
      extensionDir,
      command: commandName,
      installedDependencies: dependencies.installedDependencies,
      ...(dependencies.dataDir === undefined ? {} : { dataDir: dependencies.dataDir }),
    });
    return { ok: true, bundled };
  } catch (error) {
    if (error instanceof MissingDependencyError) {
      return { ok: false, probe: { kind: "bundle-failed", missing: error.packages } };
    }
    return {
      ok: false,
      probe: {
        kind: "bundle-failed",
        error: clean(error instanceof Error ? error.message : String(error)),
      },
    };
  }
}

/** Start and observe one bundled command; always removes its build output. */
export async function launchOne(
  extension: string,
  manifest: Manifest,
  commandName: string,
  bundled: BundledCommand,
  clean: (text: string) => string,
): Promise<CommandResult> {
  const mode = commandMode(manifest, commandName) ?? "view";
  const build = (probe: ProbeResult, warnings?: string[], errorLogs?: string[]): CommandResult =>
    buildResult({ extension, command: commandName, mode, probe, warnings, errorLogs });
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

/** Bundle, start and observe one command; always cleans up what it created. */
export async function runOne(
  extension: string,
  extensionDir: string,
  manifest: Manifest,
  commandName: string,
  clean: (text: string) => string,
  dependencies: DependencyMode = { installedDependencies: false },
): Promise<CommandResult> {
  const mode = commandMode(manifest, commandName) ?? "view";
  const build = (probe: ProbeResult): CommandResult =>
    buildResult({ extension, command: commandName, mode, probe });
  const names = requiredArguments(manifest, commandName);
  if (names.length) return build({ kind: "missing-arguments", names });
  const bundle = await bundleOne(extensionDir, commandName, dependencies, clean);
  if (!bundle.ok) return build(bundle.probe);
  return launchOne(extension, manifest, commandName, bundle.bundled, clean);
}
