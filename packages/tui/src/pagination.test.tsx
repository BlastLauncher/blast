/** @jsxImportSource @opentui/react */
// @covers List.Props.pagination
// @covers List.Props.pagination.hasMore
// @covers List.Props.pagination.onLoadMore
// @covers List.Props.pagination.pageSize
// @covers Grid.Props.pagination
// @covers Grid.Props.pagination.hasMore
// @covers Grid.Props.pagination.onLoadMore
// @covers Grid.Props.pagination.pageSize
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

// Synthetic sessions count the `onLoadMore` events; the fixture proves the
// same behaviour through the real runtime.

function mockSession(scene: SceneMessage) {
  const events: [string, unknown[]][] = [];
  const listeners = new Set<(scene: SceneMessage) => void>();
  let latest = scene;
  return {
    events,
    session: {
      latestScene: scene,
      logs: [],
      onLog: () => () => {},
      exited: new Promise(() => {}),
      scenes(callback: (scene: SceneMessage) => void) {
        listeners.add(callback);
        callback(latest);
        return () => {
          listeners.delete(callback);
        };
      },
      sendProvider: () => {},
      shutdown: async () => ({ code: 0, signal: null }),
      sendEvent: (_node, handler, args) => {
        events.push([handler, args]);
      },
    } satisfies Session,
    push(next: SceneMessage) {
      latest = next;
      for (const listener of listeners) listener(next);
    },
  };
}

let revisions = 0;
function paged(type: "List" | "Grid", ids: string[], hasMore: boolean): SceneMessage {
  return {
    type: "scene",
    revision: revisions++,
    root: {
      type,
      id: "view",
      props: {
        ...(type === "Grid" ? { columns: 3 } : {}),
        pagination: { pageSize: 3, hasMore, onLoadMore: { $handler: "more" } },
      },
      children: ids.map((id) => ({
        type: `${type}.Item`,
        id,
        props: type === "Grid" ? { id, title: id, content: `${id}.png` } : { id, title: id },
        children: [],
      })),
    },
  };
}

const loads = (mock: ReturnType<typeof mockSession>) =>
  mock.events.filter(([handler]) => handler === "more").map(([, args]) => args);

for (const type of ["List", "Grid"] as const) {
  test(`${type} pagination loads each page once when the selection reaches the end`, async () => {
    const mock = mockSession(paged(type, ["a", "b", "c"], true));
    const terminal = await testRender(<App session={mock.session} onQuit={() => {}} />, {
      width: 60,
      height: 14,
      exitOnCtrlC: false,
    });
    const press = async (name: "up" | "down" | "left" | "right", times = 1) => {
      for (let i = 0; i < times; i++) await act(async () => terminal.mockInput.pressArrow(name));
    };
    try {
      await terminal.waitForFrame((frame) => frame.includes("a"));
      // Two moves reach the last loaded item/row; one load, not one per move.
      await press(type === "Grid" ? "right" : "down");
      expect(loads(mock)).toEqual([]);
      await press(type === "Grid" ? "right" : "down");
      await terminal.waitForFrame(() => true);
      expect(loads(mock)).toEqual([[]]);
      // Already at the end: no resend until the item count changes.
      await press(type === "Grid" ? "right" : "down");
      await terminal.waitForFrame(() => true);
      expect(loads(mock)).toEqual([[]]);
      // The next page arrives with more items; reaching its end loads again.
      await act(async () => {
        mock.push(paged(type, ["a", "b", "c", "d", "e", "f"], true));
      });
      await terminal.waitForFrame((frame) => frame.includes("  f") || frame.includes("f.png"));
      expect(loads(mock)).toEqual([[]]);
      await press("down", type === "Grid" ? 1 : 3);
      await terminal.waitForFrame(() => true);
      expect(loads(mock)).toEqual([[], []]);
      // `hasMore: false` never loads, even at the end.
      await act(async () => {
        mock.push(paged(type, ["a", "b", "c"], false));
      });
      await terminal.waitForFrame((frame) => !frame.includes("f.png") && !frame.includes("  f"));
      await press(type === "Grid" ? "right" : "down", 2);
      await terminal.waitForFrame(() => true);
      expect(loads(mock)).toEqual([[], []]);
    } finally {
      await act(async () => {
        await terminal.dispose();
      });
    }
  });
}

function waitFixture(session: Session, wanted: (scene: SceneMessage) => boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      stop?.();
      reject(new Error("scene timeout"));
    }, 3000);
    let stop: (() => void) | undefined;
    stop = session.scenes((scene) => {
      if (wanted(scene)) {
        clearTimeout(timer);
        queueMicrotask(() => stop?.());
        resolve();
      }
    });
  });
}

test("terminal paginates the fixture List and Grid through the runtime", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "blast-tui-paginate-"));
  const opened = await openCommand(
    new URL("../../../fixtures/extensions/pagination", import.meta.url).pathname,
    "index",
    { dataDir },
  );
  await waitFixture(opened.session, () => true);
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
    { width: 70, height: 12, exitOnCtrlC: false },
  );
  try {
    // The single page-1 item is the end of the loaded list: one load brings
    // page 2, and nothing re-loads after it settles.
    await act(async () => {
      await waitFixture(opened.session, (next) => JSON.stringify(next).includes("list page 2"));
    });
    await terminal.waitForFrame((frame) => frame.includes("list page 2"));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(terminal.captureCharFrame()).toContain("list item 2");
    expect(terminal.captureCharFrame()).not.toContain("list item 3");
    // Push to the paginated Grid; it loads its second page the same way.
    await act(async () => {
      const pushed = waitFixture(opened.session, (scene) =>
        JSON.stringify(scene).includes("grid page 1"),
      );
      terminal.mockInput.pressEnter();
      await pushed;
    });
    await act(async () => {
      await waitFixture(opened.session, (next) => JSON.stringify(next).includes("grid page 2"));
    });
    await terminal.waitForFrame((frame) => frame.includes("grid page 2"));
    expect(terminal.captureCharFrame()).toContain("grid item 2");
    // Esc pops back to the List, then quits.
    await act(async () => {
      const popped = waitFixture(
        opened.session,
        (next) => !JSON.stringify(next).includes("grid page"),
      );
      terminal.mockInput.pressEscape();
      await popped;
    });
    await terminal.waitForFrame((frame) => frame.includes("list page 2"));
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
