/** @jsxImportSource @opentui/react */
// @covers MenuBarExtra.Props.title
// @covers MenuBarExtra.Props.tooltip
// @covers MenuBarExtra.Props.isLoading
// @covers MenuBarExtra.Item.Props.onAction
// @covers MenuBarExtra.Item.Props.shortcut
// @covers MenuBarExtra.ActionEvent
// @covers MenuBarExtra.ActionEvent.type
// @covers MenuBarExtra.Section.Props.title
// @covers MenuBarExtra.Submenu.Props.title
import { expect, test } from "bun:test";
import { act } from "react";
import { testRender } from "@opentui/react/test-utils";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HandlerRef, SceneNode, SceneMessage } from "@blastlauncher/protocol";
import type { Session } from "@blastlauncher/host";
import { App } from "./app.tsx";
import { menuRows } from "./menu-bar.tsx";
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

function node(
  id: string,
  type: string,
  props: SceneNode["props"] = {},
  children: SceneNode[] = [],
): SceneNode {
  return { id, type, props, children };
}

test("menuRows flattens the level at path, marking disabled items", () => {
  const action = { $handler: "click" } satisfies HandlerRef;
  const menu = node("menu", "MenuBarExtra", { title: "Ready", tooltip: "Status" }, [
    node("s", "MenuBarExtra.Section", { title: "Tools" }, [
      node("sub", "MenuBarExtra.Submenu", { title: "More" }, [
        node("click", "MenuBarExtra.Item", { title: "Click", onAction: action }),
      ]),
      node("off", "MenuBarExtra.Item", { title: "Disabled" }),
    ]),
    node("sep", "MenuBarExtra.Separator"),
    node("solo", "MenuBarExtra.Item", { title: "Solo", onAction: action }),
  ]);
  const root = menuRows(menu, []);
  expect(root.map((row) => row.text)).toEqual(["Tools", "More ›", "Disabled", "Solo"]);
  expect(root.map((row) => row.item)).toEqual([false, true, true, true]);
  expect(root.map((row) => row.disabled)).toEqual([true, false, true, false]);
  expect(menuRows(menu, ["sub"]).map((row) => row.text)).toEqual(["Click"]);
  expect(menuRows(node("m", "MenuBarExtra", {}, []), [])).toEqual([]);
  expect(menuRows(node("l", "List", {}, []), [])).toEqual([]);
});

test("terminal drives menu-bar: open the Submenu, run the item's onAction", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "blast-tui-menu-"));
  const opened = await openCommand(
    new URL("../../../fixtures/extensions/menu-bar", import.meta.url).pathname,
    "index",
    { dataDir },
  );
  await waitScene(opened.session, (scene) => JSON.stringify(scene).includes("More"));
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
    { width: 80, height: 12, exitOnCtrlC: false },
  );
  try {
    // The MenuBarExtra title heads the window, Sections are headers.
    await terminal.waitForFrame((frame) => frame.includes("Ready") && frame.includes("Tools"));
    await terminal.waitForFrame((frame) => frame.includes("› More"));
    // → opens the Submenu level; its Items are selectable.
    await act(async () => terminal.mockInput.pressArrow("right"));
    await terminal.waitForFrame((frame) => frame.includes("Click") && !frame.includes("More"));
    // Enter runs onAction with the event argument; the action renames the title.
    await act(async () => {
      const changed = waitScene(opened.session, (scene) =>
        JSON.stringify(scene).includes('"title":"left-click"'),
      );
      terminal.mockInput.pressEnter();
      await changed;
    });
    await terminal.waitForFrame((frame) => frame.includes("left-click"));
    // ← closes the level again; Esc then quits the TUI.
    await act(async () => terminal.mockInput.pressArrow("left"));
    await terminal.waitForFrame((frame) => frame.includes("More") && frame.includes("left-click"));
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
