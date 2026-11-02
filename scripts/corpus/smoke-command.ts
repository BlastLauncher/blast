// The impure per-command step the smoke runners share (`smoke-run.ts`,
// `smoke-deps-run.ts`): bundle one manifest command, start it through the
// task-0013 host with Blast's headless broker, and observe its first scene or
// exit. The runners differ only in how dependencies resolve, so that is a
// parameter; classification stays in `smoke.ts`.
import { createHeadlessHandlers } from "../../packages/cli/src/index.ts";
import { createController, type Controller } from "../../packages/client-core/src/index.ts";
import type { SceneMessage, SceneNode } from "../../packages/protocol/src/index.ts";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  bundleCommand,
  BundleTimeoutError,
  createBroker,
  MissingDependencyError,
  runtimeEnvironment,
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
  launchInputs,
  isSandboxDeniedMessage,
  type CommandResult,
  type Manifest,
  type PrimaryActionResult,
  classifyPrimaryAction,
  type ProbeResult,
} from "./smoke.ts";

/** How long one command may take to publish its first scene (or exit). */
const SCENE_TIMEOUT_MS = 5000;
/** A responsive action gets a short observation window; a hung command gets a timeout. */
const ACTION_TIMEOUT_MS = 1000;
/** Warnings kept per command, after deduplication. */
const MAX_WARNINGS = 5;
/** Error-level log lines kept for a crash. */
const MAX_ERROR_LOGS = 3;

export type DependencyMode = {
  /** `false` is the allowlist-only resolution of `corpus:smoke` (decision 0008). */
  installedDependencies: boolean;
  /** Where `blast deps` installed the extension, when `installedDependencies` is on. */
  dataDir?: string;
  /** Optional build output directory, used by the sandbox sweep parent. */
  outDir?: string;
};

/**
 * First non-null scene, first empty menu bar, exit, or timeout — whichever comes
 * first. A menu-bar command that renders `null` publishes a scene with no root,
 * which Raycast shows as an empty menu bar (task 0033); every other mode keeps
 * waiting for a root. The probe keeps raw messages; sanitation happens once,
 * when the result is built.
 */
type FirstScene = { probe: ProbeResult; scene?: SceneMessage };

function firstSceneOrExit(session: Session, timeoutMs: number, mode: string): Promise<FirstScene> {
  return new Promise((resolve) => {
    let settled = false;
    let unsubscribe: (() => void) | undefined;
    const finish = (probe: ProbeResult, scene?: SceneMessage): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe?.();
      unsubscribeLog?.();
      resolve({ probe, ...(scene === undefined ? {} : { scene }) });
    };
    const timer = setTimeout(() => finish({ kind: "timeout", timeoutMs }), timeoutMs);
    unsubscribe = session.scenes((scene) => {
      if (scene.root) {
        finish(
          {
            kind: "scene",
            nodeCount: countNodes(scene.root),
            rootType: scene.root.type,
          },
          scene,
        );
      } else if (mode === "menu-bar") {
        finish({ kind: "empty-menu-bar" }, scene);
      }
    });
    void session.exited.then((exit) => {
      finish(exitProbe(exit));
    });
  });
}

function navigationKey(root: SceneNode | null): string {
  if (!root || root.type !== "Navigation") return "";
  const entries = root.children
    .filter((child) => child.type === "Navigation.Entry")
    .map((child) => `${child.id}:${child.props.active === true ? "active" : "inactive"}`)
    .join("|");
  return `${root.id}/${entries}`;
}

function capabilityDenied(error: string | undefined): string | undefined {
  return /^Capability denied: (.+)$/.exec(error ?? "")?.[1];
}

async function probePrimaryAction(
  session: Session,
  first: SceneMessage,
  clean: (text: string) => string,
): Promise<PrimaryActionResult> {
  const started = performance.now();
  const controller: Controller = createController({ platform: "macOS" });
  controller.scene(first);
  const before = controller.view();
  if (!before.primary.enabled)
    return { outcome: "no-primary-action", elapsedMs: performance.now() - started };
  const dispatched = controller.input({ type: "primary" });
  const panelOpened = controller.view().actions.open !== before.actions.open;
  if (dispatched.events.length === 0) {
    const result = classifyPrimaryAction({
      primary: true,
      events: 0,
      panelOpened,
    });
    return { ...result, elapsedMs: performance.now() - started };
  }

  return await new Promise((resolve) => {
    let settled = false;
    let unsubscribe: (() => void) | undefined;
    let unsubscribeLog: (() => void) | undefined;
    const finish = (observation: Parameters<typeof classifyPrimaryAction>[0]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe?.();
      const result = classifyPrimaryAction(observation);
      resolve({
        ...result,
        ...(result.error === undefined && observation.exit?.error
          ? { error: clean(observation.exit.error) }
          : {}),
        elapsedMs: performance.now() - started,
      });
    };
    const timer = setTimeout(
      () => finish({ primary: true, events: dispatched.events.length, timedOut: true }),
      ACTION_TIMEOUT_MS,
    );
    const initialRevision = first.revision;
    unsubscribe = session.scenes((scene) => {
      if (scene.revision === initialRevision || !scene.root) return;
      const beforeNavigation = navigationKey(first.root);
      const afterNavigation = navigationKey(scene.root);
      finish({
        primary: true,
        events: dispatched.events.length,
        sceneChanged: true,
        navigated: beforeNavigation !== afterNavigation,
      });
    });
    unsubscribeLog = session.onLog((log) => {
      const capability = capabilityDenied(log.message.replace(/^EVENT_ERROR: /, ""));
      if (capability) finish({ primary: true, events: dispatched.events.length, capability });
    });
    for (const event of dispatched.events) session.sendEvent(event.node, event.handler, event.args);
    void session.exited.then((exit) => {
      const capability = capabilityDenied(exit.error?.message);
      finish({
        primary: true,
        events: dispatched.events.length,
        ...(capability === undefined ? {} : { capability }),
        exit: {
          code: exit.code,
          signal: exit.signal,
          ...(exit.error === undefined ? {} : { error: exit.error.message }),
        },
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

export type BundleOutcome =
  | { ok: true; bundled: BundledCommand }
  | { ok: false; probe: ProbeResult };

export async function bundleOne(
  extensionDir: string,
  commandName: string,
  dependencies: DependencyMode,
  clean: (text: string) => string,
): Promise<BundleOutcome> {
  const started = performance.now();
  try {
    const bundled = await bundleCommand({
      extensionDir,
      command: commandName,
      installedDependencies: dependencies.installedDependencies,
      ...(dependencies.dataDir === undefined ? {} : { dataDir: dependencies.dataDir }),
      ...(dependencies.outDir === undefined ? {} : { outDir: dependencies.outDir }),
    });
    return { ok: true, bundled };
  } catch (error) {
    const bundleMs = performance.now() - started;
    if (error instanceof BundleTimeoutError)
      return { ok: false, probe: { kind: "bundle-timeout", timeoutMs: error.timeoutMs, bundleMs } };
    if (error instanceof MissingDependencyError) {
      return { ok: false, probe: { kind: "bundle-failed", missing: error.packages, bundleMs } };
    }
    if (isSandboxDeniedMessage(error instanceof Error ? error.message : String(error))) {
      return {
        ok: false,
        probe: {
          kind: "sandbox-denied",
          bundleMs,
          error: clean(error instanceof Error ? error.message : String(error)),
        },
      };
    }
    return {
      ok: false,
      probe: {
        kind: "bundle-failed",
        bundleMs,
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
  options: { probeActions?: boolean } = {},
): Promise<CommandResult> {
  const mode = commandMode(manifest, commandName) ?? "view";
  const outDir = dirname(bundled.entry);
  const scratchRoot = process.env.BLAST_SWEEP_SCRATCH ?? join(process.cwd(), ".cache/smoke-data");
  await mkdir(scratchRoot, { recursive: true });
  const scratchDir = await mkdtemp(join(scratchRoot, "command-"));
  const inputs = launchInputs(manifest, commandName, scratchDir);
  const build = (probe: ProbeResult, warnings?: string[], errorLogs?: string[]): CommandResult =>
    buildResult({
      extension,
      command: commandName,
      mode,
      probe,
      warnings,
      errorLogs,
      placeholders: inputs.placeholders,
      bundleMs: bundled.bundleMs,
    });
  let session: Session | undefined;
  try {
    if (inputs.unsupplied.length > 0)
      return build({ kind: "missing-arguments", names: inputs.unsupplied });
    for (const directory of inputs.directories) await mkdir(directory, { recursive: true });
    try {
      const runtimeEnv =
        process.env.BLAST_SWEEP_SCRATCH === undefined
          ? undefined
          : {
              ...runtimeEnvironment(),
              ...Object.fromEntries(
                ["XDG_CACHE_HOME", "XDG_CONFIG_HOME", "XDG_DATA_HOME"].flatMap((name) =>
                  process.env[name] === undefined ? [] : [[name, process.env[name] as string]],
                ),
              ),
            };
      session = await startCommand({
        ...bundled,
        // Deny-all apart from Blast's headless read-only defaults, so a command
        // that only reads applications, the clipboard or its preferences still
        // renders; the report header records the policy.
        broker: createBroker(createHeadlessHandlers()),
        preferences: inputs.preferences,
        ...(Object.keys(inputs.argumentValues).length > 0
          ? { argumentValues: inputs.argumentValues }
          : {}),
        ...(runtimeEnv === undefined ? {} : { env: runtimeEnv }),
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
    const observed = await firstSceneOrExit(session, SCENE_TIMEOUT_MS, mode);
    const probe = observed.probe;
    const warnings = logLines(session, "warn", clean);
    const errorLogs = logLines(session, "error", clean);
    const result = build(probe, warnings, errorLogs);
    if (options.probeActions && observed.scene && probe.kind === "scene") {
      result.action = await probePrimaryAction(session, observed.scene, clean);
    }
    return result;
  } finally {
    await session?.shutdown({ timeoutMs: 250 });
    await rm(outDir, { recursive: true, force: true });
    await rm(scratchDir, { recursive: true, force: true });
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
  options: { probeActions?: boolean } = {},
): Promise<CommandResult> {
  const mode = commandMode(manifest, commandName) ?? "view";
  const bundle = await bundleOne(extensionDir, commandName, dependencies, clean);
  if (!bundle.ok)
    return buildResult({ extension, command: commandName, mode, probe: bundle.probe });
  return launchOne(extension, manifest, commandName, bundle.bundled, clean, options);
}
