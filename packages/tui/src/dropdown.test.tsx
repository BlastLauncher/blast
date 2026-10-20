/** @jsxImportSource @opentui/react */
import { expect, test } from "bun:test";
import { act } from "react";
import { testRender } from "@opentui/react/test-utils";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { App } from "./app.tsx";
import { openCommand } from "./session.ts";
import { frameEventually, waitForFrame, waitScene } from "./test-support.ts";

test("terminal List dropdown accessory: open, filter, choose, Esc", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "blast-tui-dropdown-"));
  const opened = await openCommand(
    new URL("../../../fixtures/extensions/list-extras", import.meta.url).pathname,
    "index",
    { dataDir },
  );
  await waitScene(opened.session, (scene) => JSON.stringify(scene).includes("beer"));
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
    { width: 90, height: 20, exitOnCtrlC: false },
  );
  try {
    await waitForFrame(terminal, (frame) => frame.includes("▾ water"));
    // Ctrl-P opens the dropdown's filterable option list.
    await act(async () => terminal.mockInput.pressKey("p", { ctrl: true }));
    await frameEventually(terminal, (frame) => frame.includes("Filter options"));
    expect(terminal.captureCharFrame()).toContain("Drinks");
    // Typing filters the options; "wat" leaves water chosen.
    await act(async () => {
      await terminal.mockInput.typeText("wat");
    });
    await frameEventually(terminal, (frame) => frame.includes("› water"));
    // Esc closes the open dropdown without picking a new value.
    await new Promise((resolve) => setTimeout(resolve, 100));
    await act(async () => terminal.mockInput.pressEscape());
    await frameEventually(terminal, (frame) => !frame.includes("╭─Drink"));
    expect(terminal.captureCharFrame()).toContain("▾ water");
    // Reopen and pick the first option (beer) with the keyboard alone.
    await act(async () => terminal.mockInput.pressKey("p", { ctrl: true }));
    await frameEventually(terminal, (frame) => frame.includes("Filter options"));
    await act(async () => {
      const changed = waitScene(opened.session, (scene) =>
        JSON.stringify(scene).includes('"navigationTitle":"drink beer"'),
      );
      terminal.mockInput.pressEnter();
      await changed;
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    await frameEventually(terminal, (frame) => frame.includes("drink beer"));
    // Once more through the filter: type "wat", pick water.
    await act(async () => terminal.mockInput.pressKey("p", { ctrl: true }));
    await frameEventually(terminal, (frame) => frame.includes("Filter options"));
    await act(async () => {
      await terminal.mockInput.typeText("wat");
    });
    await frameEventually(terminal, (frame) => frame.includes("› water"));
    await act(async () => {
      const changed = waitScene(opened.session, (scene) =>
        JSON.stringify(scene).includes('"navigationTitle":"drink water"'),
      );
      terminal.mockInput.pressEnter();
      await changed;
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    await frameEventually(terminal, (frame) => frame.includes("drink water"));
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
}, 30_000);
