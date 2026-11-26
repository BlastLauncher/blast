/** @jsxImportSource @opentui/react */
import { expect, test } from "bun:test";
import { act } from "react";
import { testRender } from "@opentui/react/test-utils";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CommandSession } from "./launcher.tsx";
import { settle } from "./test-support.ts";

type Terminal = Awaited<ReturnType<typeof testRender>>;

/** Temp copies of fixtures under one parent, with a data dir beside them. */
async function workspace(...names: string[]) {
  const parent = await mkdtemp(join(tmpdir(), "blast-tui-popup-"));
  const dirs = await Promise.all(
    names.map(async (name) => {
      const dir = join(parent, name);
      await cp(new URL(`../../../fixtures/extensions/${name}`, import.meta.url).pathname, dir, {
        recursive: true,
      });
      return dir;
    }),
  );
  return { dirs, dataDir: join(parent, "data"), remove: () => rm(parent, { recursive: true }) };
}

async function session(names: string[], popup: boolean) {
  const space = await workspace(...names);
  const exits: boolean[] = [];
  const terminal = await testRender(
    <CommandSession
      extensionDir={space.dirs}
      popup={popup}
      dataDir={space.dataDir}
      hudDurationMs={1_000}
      onExit={(crashed) => exits.push(crashed)}
    />,
    { width: 100, height: 20, exitOnCtrlC: false },
  );
  return {
    terminal,
    exits,
    async dispose() {
      await act(async () => terminal.dispose());
      await space.remove();
    },
  };
}

const key = (terminal: Terminal, press: (input: Terminal["mockInput"]) => unknown) =>
  act(async () => {
    await press(terminal.mockInput);
  });

/** Selects the root row whose line contains `text` by searching for it. */
async function launch(terminal: Terminal, search: string, row: string) {
  await key(terminal, (input) => input.typeText(search));
  await settle(terminal, (frame) => frame.includes(`› ${row}`));
  await key(terminal, (input) => input.pressEnter());
}

test("one root lists every extension's commands; without --popup Esc returns to it", async () => {
  const { terminal, exits, dispose } = await session(["hello-list", "feedback"], false);
  try {
    const frame = await settle(
      terminal,
      (current) => current.includes("hello-list") && current.includes("feedback"),
    );
    expect(frame.match(/index/g)?.length).toBe(2);
    await launch(terminal, "hello", "index");
    await settle(terminal, (current) => current.includes("apple"));
    await key(terminal, (input) => input.pressEscape());
    await settle(terminal, (current) => current.includes("feedback"));
    expect(exits).toEqual([]);
    // A no-view command finishing returns to the root too.
    await launch(terminal, "feedback", "index");
    await settle(terminal, (current) => current.includes("Continue?"));
    await key(terminal, (input) => input.pressEnter());
    await settle(terminal, (current) => current.includes("Confirmed"));
    await settle(terminal, (current) => current.includes("Search commands…"));
    expect(exits).toEqual([]);
    await key(terminal, (input) => input.pressEscape());
    await settle(terminal, () => exits.length > 0);
    expect(exits).toEqual([false]);
  } finally {
    await dispose();
  }
}, 30_000);

test("--popup quits when a view command calls closeMainWindow", async () => {
  const { terminal, exits, dispose } = await session(["hello-list", "launch"], true);
  try {
    await settle(terminal, (current) => current.includes("launch"));
    await launch(terminal, "launch", "index");
    await settle(terminal, (current) => current.includes("Set up index"));
    await key(terminal, (input) => input.typeText("x"));
    await key(terminal, (input) => input.pressEnter());
    await settle(terminal, (current) => current.includes("launch x one"));
    // Esc inside the command still goes back; only the window close quits.
    await key(terminal, (input) => input.pressKey("a", { ctrl: true }));
    await key(terminal, (input) => input.typeText("Close"));
    await settle(terminal, (current) => current.includes("› Close"));
    await key(terminal, (input) => input.pressEnter());
    await settle(terminal, () => exits.length > 0);
    expect(exits).toEqual([false]);
  } finally {
    await dispose();
  }
}, 30_000);

test("--popup quits after a no-view command's HUD", async () => {
  const { terminal, exits, dispose } = await session(["hello-list", "feedback"], true);
  try {
    await settle(terminal, (current) => current.includes("feedback"));
    await launch(terminal, "feedback", "index");
    await settle(terminal, (current) => current.includes("Continue?"));
    await key(terminal, (input) => input.pressEnter());
    await settle(terminal, (current) => current.includes("Finished"));
    expect(exits).toEqual([]);
    await settle(terminal, () => exits.length > 0);
    expect(exits).toEqual([false]);
  } finally {
    await dispose();
  }
}, 30_000);

test("--popup: Esc in a command returns to the root, Esc at the root quits", async () => {
  const { terminal, exits, dispose } = await session(["hello-list", "feedback"], true);
  try {
    await settle(terminal, (current) => current.includes("hello-list"));
    await launch(terminal, "hello", "index");
    await settle(terminal, (current) => current.includes("apple"));
    await key(terminal, (input) => input.pressEscape());
    await settle(terminal, (current) => current.includes("Search commands…"));
    expect(exits).toEqual([]);
    await key(terminal, (input) => input.pressEscape());
    await settle(terminal, () => exits.length > 0);
    expect(exits).toEqual([false]);
  } finally {
    await dispose();
  }
}, 30_000);

test("daemon mode detaches and resets to a clean root instead of exiting", async () => {
  const space = await workspace("hello-list", "launch");
  const exits: boolean[] = [];
  let detaches = 0;
  let reset: (() => void) | undefined;
  const terminal = await testRender(
    <CommandSession
      extensionDir={space.dirs}
      popup
      dataDir={space.dataDir}
      hudDurationMs={1_000}
      onExit={(crashed) => exits.push(crashed)}
      onDetach={() => {
        detaches += 1;
      }}
      onRegisterReset={(fn) => {
        reset = fn;
      }}
    />,
    { width: 100, height: 20, exitOnCtrlC: false },
  );
  try {
    await settle(
      terminal,
      (current) => current.includes("hello-list") && current.includes("launch"),
    );
    // Typing and pressing Esc detaches and clears the search bar without exiting.
    await key(terminal, (input) => input.typeText("hello"));
    await settle(terminal, (current) => !current.includes("launch"));
    await key(terminal, (input) => input.pressEscape());
    await settle(terminal, (current) => detaches === 1 && current.includes("launch"));
    expect(exits).toEqual([]);

    // Launching a command and calling closeMainWindow detaches and resets back to root.
    await launch(terminal, "launch", "index");
    await settle(terminal, (current) => current.includes("Set up index"));
    await key(terminal, (input) => input.typeText("x"));
    await key(terminal, (input) => input.pressEnter());
    await settle(terminal, (current) => current.includes("launch x one"));
    await key(terminal, (input) => input.pressKey("a", { ctrl: true }));
    await key(terminal, (input) => input.typeText("Close"));
    await settle(terminal, (current) => current.includes("› Close"));
    await key(terminal, (input) => input.pressEnter());
    await settle(
      terminal,
      (current) => detaches === 2 && current.includes("hello-list") && current.includes("launch"),
    );
    expect(exits).toEqual([]);

    // An external reset (SIGUSR1) cancels an open command and restores clean root.
    await launch(terminal, "hello", "index");
    await settle(terminal, (current) => current.includes("apple"));
    await act(async () => {
      reset?.();
    });
    await settle(
      terminal,
      (current) =>
        current.includes("Search commands…") &&
        current.includes("hello-list") &&
        current.includes("launch"),
    );
    expect(exits).toEqual([]);
  } finally {
    await act(async () => terminal.dispose());
    await space.remove();
  }
}, 30_000);
