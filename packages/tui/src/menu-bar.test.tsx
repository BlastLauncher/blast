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
import type { SceneMessage } from "@blastlauncher/protocol";
import type { Session } from "@blastlauncher/host";
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
