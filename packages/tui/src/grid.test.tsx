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

test("terminal drives grid: one row of cells, 2-D movement, empty view and dropdown", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "blast-tui-grid-"));
  const opened = await openCommand(
    new URL("../../../fixtures/extensions/grid", import.meta.url).pathname,
    "index",
    { dataDir },
  );
  await waitScene(opened.session, (scene) => JSON.stringify(scene).includes("beer.png"));
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
    // Three cells in one row under their section header.
    await waitForFrame(terminal, (frame) =>
      ["Drinks — Still or sparkling", "beer.png", "wine.png", "water.png"].every((cell) =>
        frame.includes(cell),
      ),
    );
    // The selected cell's action shows in the footer (cells highlight, no marker).
    expect(terminal.captureCharFrame()).toContain("Delete beer ↵");
    // The dropdown accessory shows the runtime-owned value next to the search bar.
    await waitForFrame(terminal, (frame) => frame.includes("▾ water"));
    // Ctrl-P opens the filterable option list; pick "water" by filtering.
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
    // Esc closes the dropdown without picking a new value.
    await act(async () => terminal.mockInput.pressEscape());
    await frameEventually(terminal, (frame) => !frame.includes("╭─Drink"));
    // → moves to the second cell; Enter runs its action.
    await act(async () => terminal.mockInput.pressArrow("right"));
    await frameEventually(terminal, (frame) => frame.includes("Delete wine ↵"));
    await act(async () => {
      const changed = waitScene(opened.session, (scene) =>
        JSON.stringify(scene).includes("deleted wine"),
      );
      terminal.mockInput.pressEnter();
      await changed;
    });
    // Filtering to nothing (the action sets the search text) shows the empty view.
    await new Promise((resolve) => setTimeout(resolve, 200));
    await frameEventually(
      terminal,
      (frame) => frame.includes("deleted wine") && frame.includes("Nothing"),
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
}, 30_000);
