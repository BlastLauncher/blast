/**
 * Small local benchmark for the terminal client. It uses the OpenTUI test
 * renderer, so it never opens a real terminal, clipboard, app, or network.
 * This is intentionally outside `verify`: it reports machine-dependent timing.
 */
import { performance } from "node:perf_hooks";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { act, createElement, testRender } from "../packages/tui/src/testing.ts";
import type { Session } from "../packages/host/src/index.ts";
import type { SceneMessage } from "../packages/protocol/src/index.ts";
import { App } from "../packages/tui/src/app.tsx";
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

const firstFrame = await helloListFirstFrameMs();
const keyLatency = await listKeyLatencyMs();
console.log(`hello-list time to first frame: ${firstFrame.toFixed(2)} ms`);
console.log(`10,000-item list mean keystroke latency: ${keyLatency.toFixed(2)} ms`);
