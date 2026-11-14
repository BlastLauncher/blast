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
  createSessionBroker,
  MissingDependencyError,
  NativeModuleError,
  runtimeEnvironment,
  startCommand,
  type Broker,
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
/** A scene that stays loading is settled after this quiet period, if revisions stop. */
const SCENE_QUIET_MS = 150;
/** A responsive action gets a short observation window; a hung command gets a timeout. */
const ACTION_TIMEOUT_MS = 1000;
/** Give an exit-first action event a bounded chance to publish its scene. */
const ACTION_QUIET_MS = 50;
/** Warnings kept per command, after deduplication. */
const MAX_WARNINGS = 5;
/** Error-level log lines kept for a crash. */
const MAX_ERROR_LOGS = 3;

export type DependencyMode = {
  /** `false` is the allowlist-only resolution of `corpus:smoke` (decision 0002). */
  installedDependencies: boolean;
  /** Where `blast deps` installed the extension, when `installedDependencies` is on. */
  dataDir?: string;
  /** Optional build output directory, used by the sandbox sweep parent. */
  outDir?: string;
};

/**
 * The session broker a sweep command runs with: Blast's headless read-only
 * defaults plus the storage and OAuth handlers an embedder gets
 * (`packages/host/src/client.ts`). Their files live in the command's own scratch
 * directory, which `launchOne` deletes when the command ends, so commands never
 * share state and nothing outlives the run. Machine-changing capabilities such
 * as `open.url` stay denied (task 0097).
 */
export function createSweepBroker(extensionName: string, scratchDir: string): Broker {
  return createSessionBroker(
    { extensionName, dataDir: join(scratchDir, "host-data") },
    { handlers: createHeadlessHandlers() },
  );
}

/**
 * First non-null scene, first empty menu bar, exit, or timeout — whichever comes
 * first. A menu-bar command that renders `null` publishes a scene with no root,
 * which Raycast shows as an empty menu bar (task 0033); every other mode keeps
 * waiting for a root. The probe keeps raw messages; sanitation happens once,
 * when the result is built.
 */
type FirstScene = { probe: ProbeResult; scene?: SceneMessage; loading?: boolean };

function sceneView(scene: SceneMessage) {
  const controller = createController({ platform: "macOS" });
  controller.scene(scene);
  return controller.view();
}

function sceneLoading(scene: SceneMessage): boolean {
  return sceneView(scene).loading;
}

/** A menu-bar command that rendered no menu is an empty menu bar, not content.
 * The runtime wraps every mode in Navigation, so the old `root === null` check
 * no longer sees it. */
function emptyMenuBar(scene: SceneMessage): boolean {
  const view = sceneView(scene);
  return !view.loading && view.menuBar === null;
}

export function firstSceneOrExit(
  session: Session,
  timeoutMs: number,
  mode: string,
): Promise<FirstScene> {
  return new Promise((resolve) => {
    let settled = false;
    let unsubscribe: (() => void) | undefined;
    let quietTimer: ReturnType<typeof setTimeout> | undefined;
    let loadingScene: SceneMessage | undefined;
    const finish = (probe: ProbeResult, scene?: SceneMessage, loading = false): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (quietTimer !== undefined) clearTimeout(quietTimer);
      unsubscribe?.();
      resolve({
        probe,
        ...(scene === undefined ? {} : { scene }),
        ...(scene === undefined || !loading ? {} : { loading: true }),
      });
    };
    const settleLoading = () => {
      if (loadingScene)
        finish(
          {
            kind: "scene",
            nodeCount: countNodes(loadingScene.root!),
            rootType: loadingScene.root!.type,
          },
          loadingScene,
          true,
        );
    };
    const timer = setTimeout(() => {
      if (loadingScene) settleLoading();
      else finish({ kind: "timeout", timeoutMs });
    }, timeoutMs);
    unsubscribe = session.scenes((scene) => {
      if (scene.root) {
        if (!sceneLoading(scene)) {
          if (mode === "menu-bar" && emptyMenuBar(scene)) {
            finish({ kind: "empty-menu-bar" }, scene);
            return;
          }
          finish(
            { kind: "scene", nodeCount: countNodes(scene.root), rootType: scene.root.type },
            scene,
          );
          return;
        }
        loadingScene = scene;
        if (quietTimer !== undefined) clearTimeout(quietTimer);
        quietTimer = setTimeout(settleLoading, SCENE_QUIET_MS);
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

export async function probePrimaryAction(
  session: Session,
  first: SceneMessage,
  clean: (text: string) => string,
  initiallyLoading = false,
): Promise<PrimaryActionResult> {
  const started = performance.now();
  const controller: Controller = createController({ platform: "macOS" });
  controller.scene(first);
  const before = controller.view();
  const hasContent =
    before.rows.some((row) => row.kind === "item") ||
    before.grid?.some((row) => row.cells.length > 0) === true ||
    before.detail.length > 0 ||
    before.kind === "detail";
  if (initiallyLoading || before.loading)
    return { outcome: "still-loading", dispatched: false, elapsedMs: performance.now() - started };
  if (!before.primary.enabled)
    return {
      ...classifyPrimaryAction({ primary: false, events: 0, hasContent }),
      dispatched: false,
      elapsedMs: performance.now() - started,
    };
  const dispatched = controller.input({ type: "primary" });
  const panelOpened = controller.view().actions.open !== before.actions.open;
  if (dispatched.events.length === 0) {
    const result = classifyPrimaryAction({
      primary: true,
      events: 0,
      panelOpened,
    });
    return { ...result, dispatched: false, elapsedMs: performance.now() - started };
  }

  return await new Promise((resolve) => {
    let settled = false;
    let unsubscribe: (() => void) | undefined;
    let unsubscribeLog: (() => void) | undefined;
    let latestScene: SceneMessage | undefined;
    let latestLoading = false;
    let exit: Awaited<Session["exited"]> | undefined;
    let quietTimer: ReturnType<typeof setTimeout> | undefined;
    const baselineKey = JSON.stringify(first.root);
    const finish = (observation: Parameters<typeof classifyPrimaryAction>[0]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (quietTimer !== undefined) clearTimeout(quietTimer);
      unsubscribe?.();
      unsubscribeLog?.();
      const result = classifyPrimaryAction(observation);
      resolve({
        ...result,
        dispatched: true,
        ...(result.error === undefined && observation.exit?.error
          ? { error: clean(observation.exit.error) }
          : {}),
        elapsedMs: performance.now() - started,
      });
    };
    const settleObserved = () => {
      if (settled) return;
      const sceneChanged =
        latestScene !== undefined && JSON.stringify(latestScene.root) !== baselineKey;
      const navigated =
        sceneChanged && navigationKey(first.root) !== navigationKey(latestScene?.root ?? null);
      if (sceneChanged) {
        finish({ primary: true, events: dispatched.events.length, sceneChanged, navigated });
        return;
      }
      if (exit) {
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
      }
    };
    const armQuiet = () => {
      if (quietTimer !== undefined) clearTimeout(quietTimer);
      quietTimer = setTimeout(() => {
        if (!latestLoading) settleObserved();
      }, ACTION_QUIET_MS);
    };
    const timer = setTimeout(() => {
      if (latestLoading) {
        finish({ primary: true, events: dispatched.events.length, stillLoading: true });
      } else {
        settleObserved();
        if (!settled) finish({ primary: true, events: dispatched.events.length, timedOut: true });
      }
    }, ACTION_TIMEOUT_MS);
    unsubscribe = session.scenes((scene) => {
      if (scene.revision === first.revision) return;
      latestScene = scene;
      latestLoading = scene.root === null ? false : sceneLoading(scene);
      if (!latestLoading) {
        armQuiet();
        settleObserved();
      } else {
        armQuiet();
      }
    });
    unsubscribeLog = session.onLog((log) => {
      const capability = capabilityDenied(log.message.replace(/^EVENT_ERROR: /, ""));
      if (capability) finish({ primary: true, events: dispatched.events.length, capability });
    });
    for (const event of dispatched.events) session.sendEvent(event.node, event.handler, event.args);
    void session.exited.then((value) => {
      exit = value;
      armQuiet();
      settleObserved();
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
    if (error instanceof NativeModuleError) {
      return { ok: false, probe: { kind: "native-module", modules: error.modules, bundleMs } };
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
        // Headless read-only defaults plus per-command storage and OAuth state
        // under this command's scratch; machine effects stay denied.
        broker: createSweepBroker(extension, scratchDir),
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
      result.action = await probePrimaryAction(session, observed.scene, clean, observed.loading);
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
