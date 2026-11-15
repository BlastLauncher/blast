/**
 * Small local benchmark for the terminal client. It uses the OpenTUI test
 * renderer, so it never opens a real terminal, clipboard, app, or network.
 * This is intentionally outside `verify`: it reports machine-dependent timing.
 *
 * Start-up (the popup path) runs each sample in a fresh process, so module
 * loading counts: cold uses an empty data dir, warm reuses the cold one.
 */
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { act, createElement, testRender } from "../packages/tui/src/testing.ts";
import type { Session } from "../packages/host/src/index.ts";
import type { SceneMessage } from "../packages/protocol/src/index.ts";
import { App } from "../packages/tui/src/app.tsx";
import { CommandSession } from "../packages/tui/src/launcher.tsx";
import { openCommand } from "../packages/tui/src/session.ts";

const root = resolve(import.meta.dirname, "..");

function listScene(count: number): SceneMessage {
  return {
    type: "scene",
    revision: 1,
    root: {
      type: "List",
      id: "benchmark-list",
      props: {},
      children: Array.from({ length: count }, (_, index) => ({
        type: "List.Item",
        id: `item-${index}`,
        props: { id: `item-${index}`, title: `Item ${index}` },
        children: [],
      })),
    },
  };
}

function fakeSession(scene: SceneMessage): Session {
  return {
    latestScene: scene,
    logs: [],
    onLog: () => () => {},
    exited: new Promise(() => {}),
    scenes: (listener) => {
      listener(scene);
      return () => {};
    },
    sendProvider: () => {},
    sendEvent: () => {},
    shutdown: async () => ({ code: 0, signal: null }),
  } satisfies Session;
}

async function helloListFirstFrameMs(): Promise<number> {
  const dataDir = await mkdtemp(join(tmpdir(), "blast-tui-benchmark-"));
  const started = performance.now();
  const opened = await openCommand(resolve(root, "fixtures/extensions/hello-list"), "index", {
    dataDir,
  });
  let terminal!: Awaited<ReturnType<typeof testRender>>;
  await act(async () => {
    terminal = await testRender(createElement(App, { session: opened.session, onQuit: () => {} }), {
      width: 80,
      height: 24,
      exitOnCtrlC: false,
    });
  });
  try {
    await terminal.waitForFrame((frame) => frame.includes("apple"), { maxPasses: 500 });
    return performance.now() - started;
  } finally {
    await act(async () => terminal.dispose());
    await opened.close();
    await rm(dataDir, { recursive: true, force: true });
  }
}

async function listKeyLatencyMs(samples = 20): Promise<number> {
  const scene = listScene(10_000);
  let terminal!: Awaited<ReturnType<typeof testRender>>;
  await act(async () => {
    terminal = await testRender(
      createElement(App, { session: fakeSession(scene), onQuit: () => {} }),
      { width: 80, height: 24, exitOnCtrlC: false },
    );
  });
  try {
    await terminal.waitForFrame((frame) => frame.includes("Item 0"), { maxPasses: 500 });
    const timings: number[] = [];
    for (let index = 1; index <= samples; index++) {
      const started = performance.now();
      await act(async () => terminal.mockInput.pressArrow("down"));
      await terminal.waitForFrame((frame) => frame.includes(`Item ${index}`), { maxPasses: 500 });
      timings.push(performance.now() - started);
    }
    return timings.reduce((sum, value) => sum + value, 0) / timings.length;
  } finally {
    await act(async () => terminal.dispose());
  }
}

/**
 * One start-up sample in this process: milliseconds since process start to
 * the root's first frame and to the launched `hello-list` command's.
 */
async function startupSample(dataDir: string): Promise<{ root: number; command: number }> {
  const extensions = ["hello-list", "feedback"].map((name) =>
    resolve(root, "fixtures/extensions", name),
  );
  let terminal!: Awaited<ReturnType<typeof testRender>>;
  await act(async () => {
    terminal = await testRender(
      createElement(CommandSession, { extensionDir: extensions, dataDir, popup: true }),
      { width: 80, height: 24, exitOnCtrlC: false },
    );
  });
  try {
    await terminal.waitForFrame((frame) => frame.includes("› index"), { maxPasses: 500 });
    const rootMs = performance.now();
    await act(async () => terminal.mockInput.pressEnter());
    for (;;) {
      // Launching spans a bundle and a child process: poll, not render passes.
      let frame = "";
      await act(async () => {
        await new Promise((done) => setTimeout(done, 1));
        try {
          frame = terminal.captureCharFrame();
        } catch (error) {
          // A render tick can still hold the buffer lease; poll again.
          if (!(error instanceof Error && error.message.includes("OutputBusy"))) throw error;
        }
      });
      if (frame.includes("apple")) break;
    }
    return { root: rootMs, command: performance.now() };
  } finally {
    await act(async () => terminal.dispose());
  }
}

function startup(dataDir: string): { root: number; command: number } {
  const child = spawnSync(process.execPath, [import.meta.filename, "--startup-sample", dataDir], {
    encoding: "utf8",
  });
  if (child.status !== 0) throw new Error(`start-up sample failed:\n${child.stderr}`);
  return JSON.parse(child.stdout.trim().split("\n").at(-1)!);
}

const median = (values: number[]) => values.toSorted((a, b) => a - b)[values.length >> 1]!;

if (process.argv[2] === "--startup-sample") {
  console.log(JSON.stringify(await startupSample(process.argv[3]!)));
  process.exit(0);
}

const samples = 5;
const cold: { root: number; command: number }[] = [];
const warm: { root: number; command: number }[] = [];
for (let index = 0; index < samples; index++) {
  const dataDir = await mkdtemp(join(tmpdir(), "blast-tui-startup-"));
  try {
    cold.push(startup(dataDir));
    warm.push(startup(dataDir));
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
}
for (const [name, runs] of [
  ["cold", cold],
  ["warm", warm],
] as const) {
  const rootMs = median(runs.map((run) => run.root));
  const commandMs = median(runs.map((run) => run.command));
  console.log(
    `${name} start-up (median of ${samples}): root ${rootMs.toFixed(0)} ms, ` +
      `hello-list command ${commandMs.toFixed(0)} ms`,
  );
}

const firstFrame = await helloListFirstFrameMs();
const keyLatency = await listKeyLatencyMs();
console.log(`hello-list time to first frame: ${firstFrame.toFixed(2)} ms`);
console.log(`10,000-item list mean keystroke latency: ${keyLatency.toFixed(2)} ms`);
