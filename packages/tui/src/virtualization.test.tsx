/** @jsxImportSource @opentui/react */
import { expect, test } from "bun:test";
import { act } from "react";
import { testRender } from "@opentui/react/test-utils";
import type { SceneMessage } from "@blastlauncher/protocol";
import type { Session } from "@blastlauncher/host";
import { App } from "./app.tsx";
import { frameEventually } from "./test-support.ts";

test("a 10,000-item List mounts only a viewport window and keeps selection visible", async () => {
  const scene: SceneMessage = {
    type: "scene",
    revision: 1,
    root: {
      type: "List",
      id: "large-list",
      props: { selectedItemId: "item-9999" },
      children: Array.from({ length: 10_000 }, (_, index) => ({
        type: "List.Item",
        id: `item-${index}`,
        props: { id: `item-${index}`, title: `Item ${index}` },
        children: [],
      })),
    },
  };
  const session = {
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
  const terminal = await testRender(<App session={session} onQuit={() => {}} />, {
    width: 80,
    height: 10,
    exitOnCtrlC: false,
  });
  try {
    await frameEventually(terminal, (frame) => frame.includes("Item 9999"));
    const frame = terminal.captureCharFrame();
    expect(frame).toContain("Item 9999");
    expect(frame).not.toContain("Item 0");
    await act(async () => terminal.resize(80, 24));
    await frameEventually(terminal, (next) => next.includes("Item 9999"));
    expect(terminal.captureCharFrame()).not.toContain("Item 0");
  } finally {
    await act(async () => terminal.dispose());
  }
}, 30_000);
