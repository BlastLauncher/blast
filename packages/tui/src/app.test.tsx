/** @jsxImportSource @opentui/react */
import { expect, test } from "bun:test";
import { act } from "react";
import { testRender } from "@opentui/react/test-utils";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Session } from "@blastlauncher/host";
import type { SceneMessage } from "@blastlauncher/protocol";
import { App } from "./app.tsx";
import { openCommand } from "./session.ts";

function waitScene(session: Session, predicate: (scene: SceneMessage) => boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      stop?.();
      reject(new Error("scene timeout"));
    }, 3000);
    let stop: (() => void) | undefined;
    stop = session.scenes((scene) => {
      if (predicate(scene)) {
        clearTimeout(timer);
        queueMicrotask(() => stop?.());
        resolve();
      }
    });
  });
}

for (const fixture of ["hello-list", "list-extras"]) {
  test(`terminal drives ${fixture}: frames, search, selection, primary action and shutdown`, async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "blast-tui-test-"));
    const copies: unknown[] = [];
    const opened = await openCommand(
      new URL(`../../../fixtures/extensions/${fixture}`, import.meta.url).pathname,
      "index",
      {
        dataDir,
        handlers: {
          "clipboard.copy": (params) => {
            copies.push(params);
          },
        },
      },
    );
    await waitScene(opened.session, (scene) =>
      JSON.stringify(scene).includes(fixture === "hello-list" ? "apple" : "beer"),
    );
    let closed: Promise<void> | undefined;
    let quit!: () => void;
    const quitting = new Promise<void>((resolve) => {
      quit = resolve;
    });
    const terminal = await testRender(
      <App
        session={opened.session}
        onQuit={() => {
          closed = opened.close();
          quit();
        }}
      />,
      { width: 90, height: 15, exitOnCtrlC: false },
    );
    try {
      const initial = fixture === "hello-list" ? "apple" : "beer";
      const next = fixture === "hello-list" ? "banana" : "wine";
      await terminal.waitForFrame((frame) => frame.includes(initial));
      if (fixture === "list-extras") {
        expect(terminal.captureCharFrame()).toContain("Germany");
        expect(terminal.captureCharFrame()).toContain("1970");
      }
      await act(async () => terminal.mockInput.pressArrow("down"));
      await terminal.waitForFrame((frame) => frame.includes(`› ${next}`));
      await act(async () => {
        const changed = waitScene(opened.session, (scene) =>
          JSON.stringify(scene).includes(
            fixture === "hello-list" ? "copied banana" : "deleted wine",
          ),
        );
        terminal.mockInput.pressEnter();
        await changed;
      });
      if (fixture === "hello-list") {
        await terminal.waitForFrame((frame) => frame.includes("copied banana"));
        expect(copies).toEqual([{ text: "banana" }]);
      } else await terminal.waitForFrame((frame) => frame.includes("No results"));
      // Start a fresh query through the focused input, not a synthetic scene event.
      if (fixture === "list-extras") {
        await act(async () => {
          const changed = waitScene(opened.session, (scene) =>
            JSON.stringify(scene).includes('"title":"beer"'),
          );
          terminal.mockInput.pressKey("a", { ctrl: true });
          terminal.mockInput.pressKey("k", { ctrl: true });
          await changed;
        });
        await terminal.waitForFrame((frame) => frame.includes("beer"));
      }
      await act(async () => {
        const query = fixture === "hello-list" ? "cher" : "wat";
        const changed = waitScene(opened.session, (scene) =>
          JSON.stringify(scene).includes(`"searchText":"${query}"`),
        );
        await terminal.mockInput.typeText(query);
        await changed;
      });
      await terminal.waitForFrame(
        (frame) =>
          frame.includes(fixture === "hello-list" ? "cherry" : "water") && !frame.includes(initial),
      );
      await act(async () => {
        terminal.mockInput.pressEscape();
        await quitting;
      });
      expect(closed).toBeDefined();
      await closed;
      expect((await opened.session.exited).code).toBe(0);
    } finally {
      await act(async () => {
        await terminal.dispose();
      });
      await opened.close();
      await rm(dataDir, { recursive: true, force: true });
    }
  });
}

test("search coalesces throttled events, selection notifies, and Ctrl-C quits", async () => {
  const events: unknown[] = [];
  let searched!: () => void;
  const searchSent = new Promise<void>((resolve) => {
    searched = resolve;
  });
  let quit = false;
  const scene: SceneMessage = {
    type: "scene",
    revision: 1,
    root: {
      type: "List",
      id: "list",
      props: {
        throttle: true,
        selectedItemId: "a",
        onSearchTextChange: { $handler: "search" },
        onSelectionChange: { $handler: "select" },
      },
      children: ["a", "b"].map((id) => ({
        type: "List.Item",
        id,
        props: { id, title: id },
        children: [],
      })),
    },
  };
  const session = {
    latestScene: scene,
    logs: [],
    exited: Promise.resolve({ code: 0, signal: null }),
    scenes: () => () => {},
    sendProvider: () => {},
    shutdown: async () => ({ code: 0, signal: null }),
    sendEvent: (_node, handler, args) => {
      events.push([handler, args]);
      if (handler === "search") searched();
    },
  } satisfies Session;
  const terminal = await testRender(
    <App
      session={session}
      onQuit={() => {
        quit = true;
      }}
    />,
    { width: 70, height: 10, exitOnCtrlC: false },
  );
  try {
    await act(async () => terminal.mockInput.pressArrow("down"));
    expect(events).toEqual([
      ["select", ["a"]],
      ["select", ["b"]],
    ]);
    await act(async () => {
      await terminal.mockInput.typeText("abc");
      await searchSent;
    });
    expect(events.filter((event) => (event as unknown[])[0] === "search")).toEqual([
      ["search", ["abc"]],
    ]);
    await act(async () => terminal.mockInput.pressCtrlC());
    expect(quit).toBe(true);
  } finally {
    await act(async () => terminal.dispose());
  }
});
