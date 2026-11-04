/** @jsxImportSource @opentui/react */
import { expect, test } from "bun:test";
import { act } from "react";
import { testRender } from "@opentui/react/test-utils";
import type { SceneMessage } from "@blastlauncher/protocol";
import type { Session } from "@blastlauncher/host";
import { App } from "./app.tsx";
import { frameEventually, waitForFrame } from "./test-support.ts";

function session(scene: SceneMessage): Session {
  const listeners = new Set<(next: SceneMessage) => void>();
  return {
    latestScene: scene,
    logs: [],
    onLog: () => () => {},
    exited: new Promise(() => {}),
    scenes: (listener) => {
      listeners.add(listener);
      listener(scene);
      return () => listeners.delete(listener);
    },
    sendProvider: () => {},
    sendEvent: () => {},
    shutdown: async () => ({ code: 0, signal: null }),
  } satisfies Session;
}

const listScene = (): SceneMessage => ({
  type: "scene",
  revision: 1,
  root: {
    type: "List",
    id: "list",
    props: {},
    children: ["one", "two"].map((id) => ({
      type: "List.Item",
      id,
      props: { id, title: id },
      children: [],
    })),
  },
});

const gridScene = (): SceneMessage => ({
  type: "scene",
  revision: 1,
  root: {
    type: "Grid",
    id: "grid",
    props: {},
    children: ["one", "two"].map((id) => ({
      type: "Grid.Item",
      id,
      props: { id, title: id, content: id },
      children: [],
    })),
  },
});

const detailScene = (): SceneMessage => ({
  type: "scene",
  revision: 1,
  root: { type: "Detail", id: "detail", props: { markdown: "# Notes\nKeep me" }, children: [] },
});

const formScene = (): SceneMessage => ({
  type: "scene",
  revision: 1,
  root: {
    type: "Form",
    id: "form",
    props: {},
    children: [
      {
        type: "Form.TextField",
        id: "name",
        props: { title: "Name", value: "" },
        children: [],
      },
    ],
  },
});

test("terminal resize relays out List, Grid, Detail and Form without losing state", async () => {
  const cases: Array<{
    name: string;
    scene: () => SceneMessage;
    beforeResize: (terminal: Awaited<ReturnType<typeof testRender>>) => Promise<void>;
    after: (frame: string) => void;
  }> = [
    {
      name: "List",
      scene: listScene,
      beforeResize: async (terminal) => {
        await act(async () => terminal.mockInput.pressArrow("down"));
      },
      after: (frame) => expect(frame).toContain("› two"),
    },
    {
      name: "Grid",
      scene: gridScene,
      beforeResize: async (terminal) => {
        await act(async () => terminal.mockInput.pressArrow("right"));
      },
      after: (frame) => expect(frame).toContain("two"),
    },
    {
      name: "Detail",
      scene: detailScene,
      beforeResize: async () => {},
      after: (frame) => expect(frame).toContain("Keep me"),
    },
    {
      name: "Form",
      scene: formScene,
      beforeResize: async (terminal) => {
        await act(async () => terminal.mockInput.typeText("Ada"));
      },
      after: (frame) => expect(frame).toContain("Ada"),
    },
  ];

  for (const item of cases) {
    const terminal = await testRender(<App session={session(item.scene())} onQuit={() => {}} />, {
      width: 80,
      height: 20,
      exitOnCtrlC: false,
    });
    try {
      await frameEventually(terminal, (frame) =>
        frame.includes(item.name === "Detail" ? "Notes" : item.name === "Form" ? "Name" : "one"),
      );
      await item.beforeResize(terminal);
      await act(async () => terminal.resize(42, 10));
      await waitForFrame(terminal, (frame) => {
        item.after(frame);
        return terminal.captureSpans().cols === 42 && terminal.captureSpans().rows === 10;
      });
      expect(terminal.captureSpans().cols).toBe(42);
      expect(terminal.captureSpans().rows).toBe(10);
    } finally {
      await act(async () => terminal.dispose());
    }
  }
});
