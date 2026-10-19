/** @jsxImportSource @opentui/react */
import { expect, test } from "bun:test";
import { act } from "react";
import { testRender } from "@opentui/react/test-utils";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CommandPicker, CommandSession } from "./picker.tsx";

/** Fixtures are never modified in place: every test drives a temp copy. */
async function copyFixture(name: string): Promise<string> {
  const parent = await mkdtemp(join(tmpdir(), "blast-tui-picker-"));
  const dir = join(parent, name);
  await cp(new URL(`../../../fixtures/extensions/${name}`, import.meta.url).pathname, dir, {
    recursive: true,
  });
  return dir;
}

/**
 * Manifest reads, fs.watch and bundling run on real timers the test
 * renderer's scheduler does not know about, so polling happens in real time
 * inside act and asserts on captured frames.
 */
async function settle(
  terminal: { captureCharFrame(): string },
  predicate: (frame: string) => boolean,
  ms = 3000,
): Promise<string> {
  const deadline = Date.now() + ms;
  for (;;) {
    let frame = "";
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      frame = terminal.captureCharFrame();
    });
    if (predicate(frame)) return frame;
    if (Date.now() > deadline) throw new Error(`settle timeout\n${frame}`);
  }
}

const press = async (
  terminal: { mockInput: { pressEnter(): void; pressEscape(): void; pressCtrlC(): void } },
  key: "enter" | "escape" | "ctrl-c",
) => {
  await act(async () => {
    if (key === "enter") terminal.mockInput.pressEnter();
    else if (key === "escape") terminal.mockInput.pressEscape();
    else terminal.mockInput.pressCtrlC();
  });
};

const type = async (
  terminal: { mockInput: { typeText(value: string): Promise<void> } },
  value: string,
) => {
  await act(async () => {
    await terminal.mockInput.typeText(value);
  });
};

test("picker lists a manifest's commands with modes and filters by typed text", async () => {
  const dir = await copyFixture("host-session");
  const terminal = await testRender(
    <CommandPicker extensionDir={dir} onLaunch={() => {}} onQuit={() => {}} />,
    { width: 80, height: 20, exitOnCtrlC: false },
  );
  try {
    await settle(terminal, (frame) => frame.includes("› navigation  [view]"));
    let frame = terminal.captureCharFrame();
    expect(frame).toContain("› navigation  [view]");
    expect(frame).toContain("session  [view]");
    expect(frame).toContain("env  [no-view]");
    await type(terminal, "env");
    frame = await settle(
      terminal,
      (current) => current.includes("› env  [no-view]") && !current.includes("navigation"),
    );
    expect(frame).not.toContain("session  [view]");
  } finally {
    await act(async () => terminal.dispose());
    await rm(join(dir, ".."), { recursive: true, force: true });
  }
});

test("rewriting the manifest updates the list; invalid JSON keeps the last list", async () => {
  const dir = await copyFixture("feedback");
  const terminal = await testRender(
    <CommandPicker extensionDir={dir} onLaunch={() => {}} onQuit={() => {}} />,
    { width: 80, height: 20, exitOnCtrlC: false },
  );
  try {
    await settle(terminal, (frame) => frame.includes("feedback") && frame.includes("index"));
    const manifestPath = join(dir, "package.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.commands.push({ name: "extra", title: "Extra One", mode: "view" });
    await act(async () => {
      await writeFile(manifestPath, JSON.stringify(manifest));
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    await settle(terminal, (frame) => frame.includes("Extra One"));
    await act(async () => {
      await writeFile(manifestPath, "{ not json");
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    const frame = await settle(
      terminal,
      (current) => current.includes("Manifest:") && current.includes("Extra One"),
    );
    expect(frame).toContain("› index  [no-view]");
  } finally {
    await act(async () => terminal.dispose());
    await rm(join(dir, ".."), { recursive: true, force: true });
  }
});

test("Enter launches a command and Esc returns to the picker with the selection kept", async () => {
  const dir = await copyFixture("host-session");
  const exits: boolean[] = [];
  const dataDir = await mkdtemp(join(tmpdir(), "blast-tui-picker-run-"));
  const terminal = await testRender(
    <CommandSession
      extensionDir={dir}
      dataDir={dataDir}
      hudDurationMs={100}
      onExit={(crashed) => exits.push(crashed)}
    />,
    { width: 90, height: 20, exitOnCtrlC: false },
  );
  try {
    await settle(terminal, (frame) => frame.includes("› navigation  [view]"));
    await act(async () => terminal.mockInput.pressArrow("down"));
    await settle(terminal, (frame) => frame.includes("› session  [view]"));
    await press(terminal, "enter");
    // The session command renders its List inside the picker session.
    await settle(terminal, (frame) => frame.includes("Item") && frame.includes("Increment"));
    await press(terminal, "escape");
    await settle(terminal, (frame) => frame.includes("› session  [view]"));
    await press(terminal, "ctrl-c");
    await settle(terminal, () => exits.length > 0);
    expect(exits).toEqual([false]);
  } finally {
    await act(async () => terminal.dispose());
    await rm(dataDir, { recursive: true, force: true });
    await rm(join(dir, ".."), { recursive: true, force: true });
  }
});

test("a required argument blocks launch until filled, then reaches the command", async () => {
  const dir = await copyFixture("launch");
  const exits: boolean[] = [];
  const dataDir = await mkdtemp(join(tmpdir(), "blast-tui-picker-args-"));
  const terminal = await testRender(
    <CommandSession
      extensionDir={dir}
      dataDir={dataDir}
      hudDurationMs={100}
      onExit={(crashed) => exits.push(crashed)}
    />,
    { width: 90, height: 20, exitOnCtrlC: false },
  );
  try {
    await settle(terminal, (frame) => frame.includes("› index  [view]"));
    await press(terminal, "enter");
    // The argument form opens instead of launching; the dropdown starts on One.
    const form = await settle(terminal, (frame) => frame.includes("Launch index"));
    expect(form).toContain("query *");
    expect(form).toContain("option ‹ One ›");
    // Enter without the required text stays on the form.
    await press(terminal, "enter");
    await settle(terminal, (frame) => frame.includes("Required: query"));
    await type(terminal, "hello");
    await settle(terminal, (frame) => !frame.includes("Required: query"));
    await press(terminal, "enter");
    // The command renders its arguments in the navigation title.
    await settle(
      terminal,
      (current) => current.includes("launch hello one") && current.includes("Launched"),
    );
    await press(terminal, "escape");
    await settle(terminal, (frame) => frame.includes("› index  [view]"));
    await press(terminal, "ctrl-c");
    await settle(terminal, () => exits.length > 0);
    expect(exits).toEqual([false]);
  } finally {
    await act(async () => terminal.dispose());
    await rm(dataDir, { recursive: true, force: true });
    await rm(join(dir, ".."), { recursive: true, force: true });
  }
});

test("a no-view command finishes, shows its HUD and returns to the picker", async () => {
  const dir = await copyFixture("feedback");
  const dataDir = await mkdtemp(join(tmpdir(), "blast-tui-picker-noview-"));
  const terminal = await testRender(
    <CommandSession extensionDir={dir} dataDir={dataDir} hudDurationMs={100} />,
    { width: 90, height: 20, exitOnCtrlC: false },
  );
  try {
    await settle(terminal, (frame) => frame.includes("› index  [no-view]"));
    await press(terminal, "enter");
    await settle(terminal, (frame) => frame.includes("Continue?"));
    await press(terminal, "enter");
    await settle(terminal, (frame) => frame.includes("Confirmed"));
    // The runtime exits 0 on its own; the picker comes back after the HUD.
    await settle(terminal, (frame) => frame.includes("› index  [no-view]"));
  } finally {
    await act(async () => terminal.dispose());
    await rm(dataDir, { recursive: true, force: true });
    await rm(join(dir, ".."), { recursive: true, force: true });
  }
});

test("a crashed command returns to the picker and quitting then exits 1", async () => {
  const dir = await copyFixture("host-session");
  const exits: boolean[] = [];
  const dataDir = await mkdtemp(join(tmpdir(), "blast-tui-picker-crash-"));
  const terminal = await testRender(
    <CommandSession
      extensionDir={dir}
      dataDir={dataDir}
      hudDurationMs={100}
      onExit={(crashed) => exits.push(crashed)}
    />,
    { width: 90, height: 20, exitOnCtrlC: false },
  );
  try {
    await settle(terminal, (frame) => frame.includes("› navigation  [view]"));
    await type(terminal, "inv");
    await settle(terminal, (frame) => frame.includes("› invalid  [no-view]"));
    await press(terminal, "enter");
    // The invalid command crashes at startup; the error screen waits for Esc.
    await settle(terminal, (frame) => frame.includes("Error"));
    await press(terminal, "escape");
    await settle(terminal, (frame) => frame.includes("› invalid  [no-view]"));
    await press(terminal, "ctrl-c");
    await settle(terminal, () => exits.length > 0);
    expect(exits).toEqual([true]);
  } finally {
    await act(async () => terminal.dispose());
    await rm(dataDir, { recursive: true, force: true });
    await rm(join(dir, ".."), { recursive: true, force: true });
  }
});

test("a launch failure (missing dependency) stays on the picker with an error line", async () => {
  const dir = await copyFixture("missing-dependency");
  const terminal = await testRender(<CommandSession extensionDir={dir} />, {
    width: 90,
    height: 20,
    exitOnCtrlC: false,
  });
  try {
    await settle(terminal, (frame) => frame.includes("› index"));
    await press(terminal, "enter");
    const frame = await settle(terminal, (current) => current.includes("Launch failed:"));
    expect(frame).toContain("Search commands…");
  } finally {
    await act(async () => terminal.dispose());
    await rm(join(dir, ".."), { recursive: true, force: true });
  }
});
