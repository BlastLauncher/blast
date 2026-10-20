import { createHeadlessHandlers } from "../../packages/cli/src/index.ts";
// Entry point for `bun run corpus:tui-smoke`. Fetches the curated extensions
// in budget-sized batches with the task-0011 fetch script (task 0051), then
// renders every manifest command of each curated extension in the TUI `App`
// (task 0052+) through OpenTUI's test renderer at a fixed size, on the same
// deny-all broker and manifest preference defaults as the headless smoke
// (`smoke-run.ts`), and finally presses ↓, Ctrl-K and Esc. Writes
// `compat/tui-smoke.json` and `compat/TUI-SMOKE.md`. Failures are the report's
// data, not errors: nothing here fixes Blast, and extension files are never
// modified.
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { format } from "oxfmt";
import type { SceneMessage } from "../../packages/protocol/src/index.ts";
import {
  bundleCommand,
  createBroker,
  MissingDependencyError,
  startCommand,
  type BundledCommand,
  type Session,
} from "../../packages/host/src/index.ts";
import { App } from "../../packages/tui/src/app.tsx";
import { act, createElement, testRender } from "../../packages/tui/src/testing.ts";
import { fetchBatch } from "./batch.ts";
import { batchSize, CORPUS_DIR, maxMbFromEnv, megabytes, readPin } from "./corpus.ts";
import {
  commandMode,
  compactLine,
  compactLines,
  countNodes,
  exitProbe,
  launchInputs,
  manifestCommands,
  sanitizePath,
  type Manifest,
  type PlaceholderKind,
  type ProbeResult,
} from "./smoke.ts";
import {
  buildTuiReport,
  buildTuiResult,
  consoleError,
  renderTuiJson,
  renderTuiMarkdown,
  type FrameProbe,
  type TuiProbe,
  type TuiResult,
} from "./tui-smoke.ts";

/** The committed reports. */
const JSON_PATH = "compat/tui-smoke.json";
const MARKDOWN_PATH = "compat/TUI-SMOKE.md";
/** Frame size: a frame is only meaningful when it is captured at a fixed size. */
const WIDTH = 100;
const HEIGHT = 30;
/** How long one command may take to publish its first scene, or to exit. */
const SCENE_TIMEOUT_MS = 5000;
/** Render passes that let React commit a scene and the renderer draw it. */
const DRAW_PASSES = 3;
/** Warnings kept per command, after deduplication. */
const MAX_WARNINGS = 5;
/** Error-level log lines kept for a crash. */
const MAX_ERROR_LOGS = 3;

type Terminal = Awaited<ReturnType<typeof testRender>>;

/** What the wait for a command's first drawable state ended on. */
type FirstScene =
  | { kind: "scene"; scene: SceneMessage }
  | { kind: "exit"; probe: ProbeResult }
  | { kind: "timeout" };

/** The keys pressed once a frame exists, in the order the report describes. */
const KEYS = [
  (input: Terminal["mockInput"]) => input.pressArrow("down"),
  (input: Terminal["mockInput"]) => input.pressKey("k", { ctrl: true }),
  (input: Terminal["mockInput"]) => input.pressEscape(),
] as const;

/**
 * The runtime's first scene, its exit, or a timeout. Like the headless smoke,
 * this subscribes rather than reading `latestScene`: a command publishes
 * several revisions, and the one that matters is the first with a root (its
 * list, detail or form), not whatever the latest revision happens to be. A
 * snapshot with no root is a result only for a menu-bar command, which Raycast
 * shows as an empty menu bar; any other mode that published one drew nothing.
 */
function firstSceneOrExit(session: Session, mode: string, timeoutMs: number): Promise<FirstScene> {
  const accepts = (scene: SceneMessage | undefined): boolean =>
    scene !== undefined && (!!scene.root || mode === "menu-bar");
  const current = session.latestScene;
  if (current !== undefined && accepts(current))
    return Promise.resolve({ kind: "scene", scene: current });
  return new Promise((resolve) => {
    let settled = false;
    let unsubscribe: (() => void) | undefined;
    const finish = (value: FirstScene): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe?.();
      resolve(value);
    };
    const timer = setTimeout(() => finish({ kind: "timeout" }), timeoutMs);
    // `session.scenes` replays the latest snapshot synchronously, so the scene
    // checked above is skipped here and only a later one can settle.
    unsubscribe = session.scenes((scene) => {
      if (accepts(scene)) finish({ kind: "scene", scene });
    });
    void session.exited.then((exit) => finish({ kind: "exit", probe: exitProbe(exit) }));
  });
}

/**
 * Let React commit the scene and the renderer draw it, then read the frame.
 * The scene reaches the App through its subscription, which runs outside
 * `act`, so the flush is what makes the frame the command's.
 */
async function draw(terminal: Terminal, passes = DRAW_PASSES): Promise<string> {
  for (let pass = 0; pass < passes; pass++) {
    await act(async () => {});
    await terminal.renderOnce();
  }
  return terminal.captureCharFrame();
}

/**
 * `console.error` for one command. The TUI's own exceptions (a render error
 * React catches, a key handler OpenTUI catches) are logged there with the
 * `Error`, so they are read back out; anything else the run logs there — React's
 * act warnings for the scene updates and the unmount, renderer chatter — is
 * dropped so that a 200-command run stays readable.
 */
function captureClientErrors(into: string[]): () => void {
  const original = console.error;
  console.error = (...args: unknown[]) => {
    const message = consoleError(args);
    if (message !== undefined) into.push(message);
  };
  return () => {
    console.error = original;
  };
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

/** Bundle, open, render and drive one command; always cleans up what it created. */
async function runOne(
  extension: string,
  extensionDir: string,
  manifest: Manifest,
  commandName: string,
  clean: (text: string) => string,
): Promise<TuiResult> {
  const mode = commandMode(manifest, commandName) ?? "view";
  let placeholders: PlaceholderKind | undefined;
  const build = (probe: TuiProbe, warnings?: string[], errorLogs?: string[]): TuiResult =>
    buildTuiResult({
      extension,
      command: commandName,
      mode,
      probe,
      warnings,
      errorLogs,
      placeholders,
    });
  let bundled: BundledCommand;
  try {
    // Allowlist-only, like corpus:smoke, so reports stay comparable (decision 0008).
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
  const scratchRoot = join(process.cwd(), ".cache/smoke-data");
  await mkdir(scratchRoot, { recursive: true });
  const scratchDir = await mkdtemp(join(scratchRoot, "command-"));
  const inputs = launchInputs(manifest, commandName, scratchDir);
  placeholders = inputs.placeholders;
  let session: Session | undefined;
  let terminal: Terminal | undefined;
  // Installed for the whole command, teardown included: React logs the act
  // warnings of its unmount to `console.error` too, and the report only wants
  // the TUI's own exceptions out of it.
  const errors: string[] = [];
  const restore = captureClientErrors(errors);
  let frame: FrameProbe = { kind: "frame", frame: "" };
  try {
    if (inputs.unsupplied.length)
      return build({ kind: "missing-arguments", names: inputs.unsupplied });
    for (const directory of inputs.directories) await mkdir(directory, { recursive: true });
    try {
      session = await startCommand({
        ...bundled,
        // Deny-all apart from Blast's headless read-only defaults, exactly as
        // the CLI smoke opens a command (task 0026).
        broker: createBroker(createHeadlessHandlers()),
        preferences: inputs.preferences,
        argumentValues: inputs.argumentValues,
      });
    } catch (error) {
      // Startup failures (handshake, exit before ready) are crashes too.
      const code = (error as { code?: unknown }).code;
      return build({
        kind: "exit",
        code: null,
        signal: null,
        error: {
          message: clean(error instanceof Error ? error.message : String(error)),
          ...(typeof code === "string" ? { code } : {}),
        },
      });
    }
    const running = session;
    const warnings = (): string[] => logLines(running, "warn", clean);
    const errorLogs = (): string[] => logLines(running, "error", clean);
    try {
      const screen = await testRender(createElement(App, { session: running, onQuit: () => {} }), {
        width: WIDTH,
        height: HEIGHT,
        exitOnCtrlC: false,
      });
      terminal = screen;
      const first = await firstSceneOrExit(running, mode, SCENE_TIMEOUT_MS);
      if (first.kind !== "scene") {
        // No frame: the headless smoke's outcome for this command is the whole
        // answer, because the TUI never drew the command's own scene.
        return build(
          first.kind === "timeout" ? { kind: "timeout", timeoutMs: SCENE_TIMEOUT_MS } : first.probe,
          warnings(),
          errorLogs(),
        );
      }
      const sceneFrame = await draw(screen);
      // The scene's own size, like the headless report: the App may already be
      // drawing a later revision, which would make the count depend on timing.
      const root = first.scene.root;
      frame = {
        kind: "frame",
        frame: sceneFrame,
        lastFrame: sceneFrame,
        nodes: root ? countNodes(root) : undefined,
        rootType: root?.type,
      };
      // With a scene on screen, drive the keys the report describes; a frame
      // that never appeared has nothing to drive.
      for (const press of KEYS) {
        try {
          await act(async () => press(screen.mockInput));
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error));
        }
        await screen.renderOnce();
        frame.lastFrame = screen.captureCharFrame();
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
    const [message] = errors;
    if (message !== undefined) frame.error = clean(message);
    return build(frame, warnings(), errorLogs());
  } finally {
    await terminal?.dispose().catch(() => undefined);
    restore();
    await session?.shutdown({ timeoutMs: 250 });
    await rm(outDir, { recursive: true, force: true });
    await rm(scratchDir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const root = process.cwd();
  const pin = readPin(root);
  const maxMb = maxMbFromEnv(process.env);
  const size = batchSize(maxMb);
  const curated = [...pin.curated].toSorted();
  console.log(
    `corpus:tui-smoke: ${curated.length} curated extensions in batches of ${size}, ${WIDTH}×${HEIGHT}`,
  );

  // Path prefixes that must never appear in a committed report.
  const clean = (text: string): string =>
    compactLine(
      sanitizePath(text, [
        [root, "<repo>"],
        [tmpdir(), "<tmp>"],
        [homedir(), "<home>"],
      ]),
    );
  const results: TuiResult[] = [];
  const extensionFailures: { extension: string; error: string }[] = [];
  let peakBytes = 0;
  try {
    for (let offset = 0; offset < curated.length; offset += size) {
      const batch = curated.slice(offset, offset + size);
      peakBytes = Math.max(peakBytes, fetchBatch(batch, root));
      console.log(`corpus:tui-smoke: batch .cache is ${megabytes(peakBytes)} MB (peak so far)`);
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
          process.stdout.write(`corpus:tui-smoke: ${extension}/${commandName}: `);
          const result = await runOne(extension, extensionDir, manifest, commandName, clean);
          console.log(result.outcome);
          results.push(result);
        }
      }
    }
  } finally {
    // Leave the checkout minimal: every extension dropped from the sparse set
    // once the run is over.
    fetchBatch([], root);
  }

  const report = buildTuiReport(pin.commit, results, WIDTH, HEIGHT, extensionFailures);
  await writeFile(join(root, JSON_PATH), renderTuiJson(report));
  // Formatted like every generated file in `compat/` (see
  // `scripts/compat/generate-enums.ts`), so the committed report is exactly
  // what this run writes.
  const markdown = await format(MARKDOWN_PATH, renderTuiMarkdown(report), { printWidth: 100 });
  if (markdown.errors.length > 0) throw new Error(`Cannot format ${MARKDOWN_PATH}`);
  await writeFile(join(root, MARKDOWN_PATH), markdown.code);
  const totals = Object.entries(report.totals)
    .map(([outcome, count]) => `${outcome} ${count}`)
    .join(", ");
  console.log(
    `corpus:tui-smoke: wrote ${JSON_PATH} and ${MARKDOWN_PATH} (${totals}), peak .cache ${megabytes(peakBytes)} MB`,
  );
}

try {
  await main();
} catch (error) {
  console.error(`corpus:tui-smoke: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
