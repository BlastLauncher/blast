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
          // The dropdown accessory always lists "beer"; wait for the cleared query.
          const changed = waitScene(opened.session, (scene) =>
            JSON.stringify(scene).includes('"searchText":""'),
          );
          terminal.mockInput.pressKey("e", { ctrl: true });
          for (let i = 0; i < "deleted wine".length; i++) terminal.mockInput.pressBackspace();
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

for (const fixture of ["actions-variants", "host-session", "feedback"]) {
  test(`terminal overlays and navigation: ${fixture}`, async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "blast-tui-feedback-"));
    const opened = await openCommand(
      new URL(`../../../fixtures/extensions/${fixture}`, import.meta.url).pathname,
      fixture === "host-session" ? "navigation" : "index",
      { dataDir },
    );
    await waitScene(opened.session, () => true);
    const terminal = await testRender(<App session={opened.session} onQuit={() => {}} />, {
      width: 100,
      height: 30,
      exitOnCtrlC: false,
    });
    const key = async (name: string, ctrl = false) => {
      await act(async () => {
        if (name === "return") terminal.mockInput.pressEnter();
        else if (name === "escape") terminal.mockInput.pressEscape();
        else terminal.mockInput.pressKey(name, { ctrl });
      });
    };
    try {
      if (fixture === "feedback") {
        await terminal.waitForFrame(
          (frame) => frame.includes("Continue?") && frame.includes("Enter OK"),
        );
        await act(async () => {
          const changed = waitScene(opened.session, (scene) =>
            JSON.stringify(scene).includes("Finished"),
          );
          terminal.mockInput.pressEnter();
          await changed;
        });
        await terminal.waitForFrame(
          (frame) => frame.includes("Confirmed") && frame.includes("Finished"),
        );
      } else {
        await terminal.waitForFrame((frame) =>
          frame.includes(fixture === "host-session" ? "Navigation" : "Everything"),
        );
        await key("k", true);
        await terminal.waitForFrame((frame) => frame.includes("Filter actions"));
        if (fixture === "actions-variants") {
          await key("return");
          await terminal.waitForFrame((frame) => frame.includes("Colors") && frame.includes("Red"));
          await key("escape");
          await terminal.waitForFrame((frame) => frame.includes("Open Target"));
          await key("return");
          await act(async () => terminal.mockInput.typeText("red"));
          await terminal.waitForFrame((frame) => frame.includes("Red") && !frame.includes("Plain"));
          await act(async () => {
            const changed = waitScene(opened.session, (scene) =>
              JSON.stringify(scene).includes("picked Red"),
            );
            terminal.mockInput.pressEnter();
            await changed;
          });
          await terminal.waitForFrame((frame) => frame.includes("picked Red"));
        } else {
          await act(async () => terminal.mockInput.typeText("details"));
          await act(async () => {
            const changed = waitScene(opened.session, (scene) =>
              JSON.stringify(scene).includes("pushed detail"),
            );
            terminal.mockInput.pressEnter();
            await changed;
          });
          await terminal.waitForFrame(
            (frame) => frame.includes("pushed detail") && !frame.includes("Navigation"),
          );
          await act(async () => {
            const changed = waitScene(opened.session, (scene) =>
              JSON.stringify(scene).includes("popped true"),
            );
            terminal.mockInput.pressEscape();
            await changed;
          });
          await terminal.waitForFrame((frame) => frame.includes("popped true"));
        }
      }
    } finally {
      await act(async () => terminal.dispose());
      await opened.close();
      await rm(dataDir, { recursive: true, force: true });
    }
  });
}

test("no-view feedback command shows its HUD and the TUI exits 0", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "blast-tui-noview-"));
  const opened = await openCommand(
    new URL("../../../fixtures/extensions/feedback", import.meta.url).pathname,
    "index",
    { dataDir },
  );
  await waitScene(opened.session, (scene) => JSON.stringify(scene).includes("Continue?"));
  let closed: Promise<void> | undefined;
  let quit!: () => void;
  const quitting = new Promise<void>((resolve) => {
    quit = resolve;
  });
  const terminal = await testRender(
    <App
      session={opened.session}
      hudDurationMs={100}
      onQuit={() => {
        closed = opened.close();
        quit();
      }}
    />,
    { width: 90, height: 15, exitOnCtrlC: false },
  );
  try {
    await terminal.waitForFrame((frame) => frame.includes("Continue?"));
    await act(async () => {
      const changed = waitScene(opened.session, (scene) =>
        JSON.stringify(scene).includes("Finished"),
      );
      terminal.mockInput.pressEnter();
      await changed;
    });
    await terminal.waitForFrame(
      (frame) => frame.includes("Confirmed") && frame.includes("Finished"),
    );
    // The runtime exits 0 on its own; the TUI quits once the HUD has shown.
    await act(async () => {
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

test("a failed runtime shows the error and waits for Esc", async () => {
  let quit!: () => void;
  const quitting = new Promise<void>((resolve) => {
    quit = resolve;
  });
  let quitCount = 0;
  const session = {
    latestScene: {
      type: "scene",
      revision: 1,
      root: {
        type: "List",
        id: "list",
        props: {},
        children: [{ type: "List.Item", id: "a", props: { id: "a", title: "a" }, children: [] }],
      },
    } satisfies SceneMessage,
    logs: [],
    exited: Promise.resolve({ code: 1, signal: null }),
    scenes: () => () => {},
    sendProvider: () => {},
    shutdown: async () => ({ code: 1, signal: null }),
    sendEvent: () => {},
  } satisfies Session;
  const terminal = await testRender(
    <App
      session={session}
      onQuit={() => {
        quitCount++;
        quit();
      }}
    />,
    { width: 70, height: 10, exitOnCtrlC: false },
  );
  try {
    await terminal.waitForFrame((frame) => frame.includes("Runtime exited: 1"));
    // Other keys wait; only Esc (or Ctrl-C) quits.
    await act(async () => terminal.mockInput.pressArrow("down"));
    expect(quitCount).toBe(0);
    await act(async () => {
      terminal.mockInput.pressEscape();
      await quitting;
    });
    expect(quitCount).toBe(1);
  } finally {
    await act(async () => terminal.dispose());
  }
});

test("Detail metadata and toast actions render from scene props", async () => {
  const events: string[] = [];
  const scene: SceneMessage = {
    type: "scene",
    revision: 1,
    root: {
      id: "nav",
      type: "Navigation",
      props: {},
      children: [
        {
          id: "entry",
          type: "Navigation.Entry",
          props: { active: true },
          children: [
            {
              id: "detail",
              type: "Detail",
              props: { markdown: "# Notes\nHello" },
              children: [
                {
                  id: "metadata",
                  type: "Detail.Metadata",
                  props: {},
                  children: [
                    {
                      id: "author",
                      type: "Detail.Metadata.Label",
                      props: { title: "Author", text: "Ada" },
                      children: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          id: "toast",
          type: "Toast",
          props: { title: "Saved", message: "Ready", style: "success" },
          children: [
            {
              id: "undo",
              type: "Toast.Action",
              props: { name: "primaryAction", title: "Undo", onAction: { $handler: "undo" } },
              children: [],
            },
          ],
        },
      ],
    },
  };
  const session = {
    latestScene: scene,
    scenes: () => () => {},
    sendEvent: (_node, name) => {
      events.push(name);
    },
    logs: [],
    exited: Promise.resolve({ code: 0, signal: null }),
    sendProvider: () => {},
    shutdown: async () => ({ code: 0, signal: null }),
  } satisfies Session;
  const terminal = await testRender(<App session={session} onQuit={() => {}} />, {
    width: 80,
    height: 15,
  });
  try {
    await terminal.waitForFrame(
      (frame) =>
        frame.includes("Hello") &&
        frame.includes("Author: Ada") &&
        frame.includes("success · Saved · Ready"),
    );
    await act(async () => terminal.mockInput.pressKey("t", { ctrl: true }));
    expect(events).toEqual(["undo"]);
  } finally {
    await act(async () => terminal.dispose());
  }
});
