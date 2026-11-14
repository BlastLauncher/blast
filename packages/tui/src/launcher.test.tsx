/** @jsxImportSource @opentui/react */
import { expect, test } from "bun:test";
import { act } from "react";
import { testRender } from "@opentui/react/test-utils";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CommandSession } from "./launcher.tsx";
import { settle } from "./test-support.ts";
import {
  createEngine,
  type DebounceScheduler,
  type ExtensionWatcherFactory,
} from "@blastlauncher/host";

function deterministicEngine(
  dataDir: string,
  installer?: import("@blastlauncher/host").DependencyInstaller,
) {
  // The root and the session's error line each watch the extension.
  const listeners = new Set<(event: string, file: string) => void>();
  const pending = new Set<() => void>();
  const watcher: ExtensionWatcherFactory = (_path, next) => {
    listeners.add(next);
    const handle = {
      on: (_event: "error", _listener: (error: Error) => void) => handle,
      close: () => {
        listeners.delete(next);
      },
    };
    return handle;
  };
  const debounce: DebounceScheduler = {
    schedule: (callback) => (pending.add(callback), callback),
    cancel: (handle) => pending.delete(handle as () => void),
  };
  const engine = createEngine({
    dataDir,
    watcher,
    debounce,
    ...(installer ? { installer } : {}),
  });
  return {
    engine,
    emit(file: string) {
      for (const listener of listeners) listener("change", file);
      for (const callback of pending) {
        pending.delete(callback);
        callback();
      }
    },
  };
}

/** Fixtures are never modified in place: every test drives a temp copy. */
async function copyFixture(name: string): Promise<string> {
  const parent = await mkdtemp(join(tmpdir(), "blast-tui-picker-"));
  const dir = join(parent, name);
  await cp(new URL(`../../../fixtures/extensions/${name}`, import.meta.url).pathname, dir, {
    recursive: true,
  });
  return dir;
}

const press = async (
  terminal: {
    mockInput: {
      pressEnter(): void;
      pressEscape(): void;
      pressCtrlC(): void;
      pressKey(key: string): void;
      pressArrow(dir: "down" | "up" | "left" | "right"): void;
    };
  },
  key: "enter" | "escape" | "ctrl-c" | "r" | "down" | "up",
) => {
  await act(async () => {
    if (key === "enter") terminal.mockInput.pressEnter();
    else if (key === "escape") terminal.mockInput.pressEscape();
    else if (key === "r") terminal.mockInput.pressKey("r");
    else if (key === "down") terminal.mockInput.pressArrow("down");
    else if (key === "up") terminal.mockInput.pressArrow("up");
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

const paste = async (
  terminal: { mockInput: { pasteBracketedText(value: string): Promise<void> } },
  value: string,
) => {
  await act(async () => {
    await terminal.mockInput.pasteBracketedText(value);
  });
};

test("the root lists the extension's commands with modes and filters by typed text", async () => {
  const dir = await copyFixture("host-session");
  const terminal = await testRender(
    <CommandSession extensionDir={dir} dataDir={join(dir, "../data")} />,
    { width: 80, height: 20, exitOnCtrlC: false },
  );
  try {
    await settle(terminal, (frame) => frame.includes("› navigation"));
    let frame = terminal.captureCharFrame();
    expect(frame).toContain("› navigation");
    expect(frame).toContain("  session");
    expect(frame).toContain("env");
    await type(terminal, "env");
    frame = await settle(
      terminal,
      (current) => current.includes("› env") && !current.includes("navigation"),
    );
    expect(frame).not.toContain("  session");
  } finally {
    await act(async () => terminal.dispose());
    await rm(join(dir, ".."), { recursive: true, force: true });
  }
}, 30_000);

test("rewriting the manifest updates the list; invalid JSON keeps the last list", async () => {
  const dir = await copyFixture("feedback");
  const supplied = deterministicEngine(join(dir, "../data"));
  const terminal = await testRender(
    <CommandSession extensionDir={dir} engine={supplied.engine} />,
    { width: 80, height: 20, exitOnCtrlC: false },
  );
  try {
    await settle(terminal, (frame) => frame.includes("feedback") && frame.includes("index"));
    const manifestPath = join(dir, "package.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.commands.push({ name: "extra", title: "Extra One", mode: "view" });
    await act(async () => {
      await writeFile(manifestPath, JSON.stringify(manifest));
    });
    supplied.emit("package.json");
    await settle(terminal, (frame) => frame.includes("Extra One"));
    await act(async () => {
      await writeFile(manifestPath, "{ not json");
    });
    supplied.emit("package.json");
    const frame = await settle(
      terminal,
      (current) => current.includes("Manifest:") && current.includes("Extra One"),
    );
    expect(frame).toContain("› index");
  } finally {
    await act(async () => terminal.dispose());
    await supplied.engine.close();
    await rm(join(dir, ".."), { recursive: true, force: true });
  }
}, 30_000);

test("Enter launches a command and Esc returns to the root with the selection kept", async () => {
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
    await settle(terminal, (frame) => frame.includes("› navigation"));
    await act(async () => terminal.mockInput.pressArrow("down"));
    await settle(terminal, (frame) => frame.includes("› session"));
    await press(terminal, "enter");
    // The session command renders its List inside the picker session.
    await settle(terminal, (frame) => frame.includes("Item") && frame.includes("Increment"));
    await press(terminal, "escape");
    await settle(terminal, (frame) => frame.includes("› session"));
    await press(terminal, "ctrl-c");
    await settle(terminal, () => exits.length > 0);
    expect(exits).toEqual([false]);
  } finally {
    await act(async () => terminal.dispose());
    await rm(dataDir, { recursive: true, force: true });
    await rm(join(dir, ".."), { recursive: true, force: true });
  }
}, 30_000);

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
    await settle(terminal, (frame) => frame.includes("› index"));
    await press(terminal, "enter");
    // The engine's argument prompt opens instead of launching; the dropdown starts on One.
    const form = await settle(terminal, (frame) => frame.includes("Set up index"));
    expect(form).toContain("› query");
    expect(form).toContain("option");
    expect(form).toContain("[x] One");
    // Enter without the required text stays on the form.
    await press(terminal, "enter");
    await settle(terminal, (frame) => frame.includes("Required"));
    await type(terminal, "hello");
    await settle(terminal, (frame) => !frame.includes("Required"));
    await press(terminal, "enter");
    // The command renders its arguments in the navigation title.
    await settle(
      terminal,
      (current) => current.includes("launch hello one") && current.includes("Launched"),
    );
    await press(terminal, "escape");
    await settle(terminal, (frame) => frame.includes("› index"));
    await press(terminal, "ctrl-c");
    await settle(terminal, () => exits.length > 0);
    expect(exits).toEqual([false]);
  } finally {
    await act(async () => terminal.dispose());
    await rm(dataDir, { recursive: true, force: true });
    await rm(join(dir, ".."), { recursive: true, force: true });
  }
}, 30_000);

test("a password argument accepts a bracketed paste without echoing it", async () => {
  const dir = await copyFixture("launch");
  const file = join(dir, "package.json");
  const manifest = JSON.parse(await readFile(file, "utf8"));
  manifest.commands[0].arguments[0].type = "password";
  await writeFile(file, JSON.stringify(manifest));
  const dataDir = await mkdtemp(join(tmpdir(), "blast-tui-picker-paste-"));
  const terminal = await testRender(<CommandSession extensionDir={dir} dataDir={dataDir} />, {
    width: 90,
    height: 20,
    exitOnCtrlC: false,
  });
  try {
    await settle(terminal, (frame) => frame.includes("› index"));
    await press(terminal, "enter");
    await settle(terminal, (frame) => frame.includes("Set up index"));
    await paste(terminal, "pasted\n");
    expect(await settle(terminal, (frame) => frame.includes("••••••••"))).not.toContain("pasted");
    await press(terminal, "enter");
    await settle(terminal, (current) => current.includes("launch pasted one"));
  } finally {
    await act(async () => terminal.dispose());
    await rm(dataDir, { recursive: true, force: true });
    await rm(join(dir, ".."), { recursive: true, force: true });
  }
}, 30_000);

test("a no-view command finishes, shows its HUD and returns to the root", async () => {
  const dir = await copyFixture("feedback");
  const dataDir = await mkdtemp(join(tmpdir(), "blast-tui-picker-noview-"));
  const terminal = await testRender(
    <CommandSession extensionDir={dir} dataDir={dataDir} hudDurationMs={100} />,
    { width: 90, height: 20, exitOnCtrlC: false },
  );
  try {
    await settle(terminal, (frame) => frame.includes("› index"));
    await press(terminal, "enter");
    await settle(terminal, (frame) => frame.includes("Continue?"));
    await press(terminal, "enter");
    await settle(terminal, (frame) => frame.includes("Confirmed"));
    // The runtime exits 0 on its own; the picker comes back after the HUD.
    await settle(terminal, (frame) => frame.includes("› index"));
  } finally {
    await act(async () => terminal.dispose());
    await rm(dataDir, { recursive: true, force: true });
    await rm(join(dir, ".."), { recursive: true, force: true });
  }
}, 30_000);

test("a crashed command returns to the root and quitting then exits 1", async () => {
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
    await settle(terminal, (frame) => frame.includes("› navigation"));
    await type(terminal, "inv");
    await settle(terminal, (frame) => frame.includes("› invalid"));
    await press(terminal, "enter");
    // The invalid command crashes at startup; R relaunches it with the same
    // command and arguments, and Esc returns to the picker.
    await settle(terminal, (frame) => frame.includes("Error"));
    await press(terminal, "r");
    await settle(terminal, (frame) => frame.includes("Error"));
    await press(terminal, "escape");
    await settle(terminal, (frame) => frame.includes("› invalid"));
    await press(terminal, "ctrl-c");
    await settle(terminal, () => exits.length > 0);
    expect(exits).toEqual([true]);
  } finally {
    await act(async () => terminal.dispose());
    await rm(dataDir, { recursive: true, force: true });
    await rm(join(dir, ".."), { recursive: true, force: true });
  }
}, 30_000);

test("a launch failure (missing dependency) shows the error and Esc returns to the root", async () => {
  const dir = await copyFixture("missing-dependency");
  const dataDir = await mkdtemp(join(tmpdir(), "blast-picker-failure-"));
  const terminal = await testRender(
    <CommandSession
      extensionDir={dir}
      dataDir={dataDir}
      installer={async () => {
        throw new Error("offline");
      }}
    />,
    {
      width: 90,
      height: 20,
      exitOnCtrlC: false,
    },
  );
  try {
    await settle(terminal, (frame) => frame.includes("› index"));
    await press(terminal, "enter");
    // The engine's launch view offers Retry; Esc cancels back to the root.
    await settle(terminal, (current) => current.includes("Missing dependencies:"));
    await press(terminal, "escape");
    await settle(terminal, (current) => current.includes("Search commands…"));
  } finally {
    await act(async () => terminal.dispose());
    await rm(dataDir, { recursive: true, force: true });
    await rm(join(dir, ".."), { recursive: true, force: true });
  }
}, 30_000);

test("launch installs with progress before the command, reuses installs and reinstalls after lock changes", async () => {
  const dir = await copyFixture("host-session");
  const dataDir = join(dir, "../data");
  const file = join(dir, "package.json");
  const manifest = JSON.parse(await readFile(file, "utf8"));
  await writeFile(file, JSON.stringify({ ...manifest, dependencies: { example: "1" } }));
  let finish!: () => void;
  let calls = 0;
  const installer: import("@blastlauncher/host").DependencyInstaller = async ({ onLog }) => {
    calls++;
    onLog?.("first line\nInstalling example");
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
  };
  const supplied = deterministicEngine(dataDir, installer);
  const render = () =>
    testRender(<CommandSession extensionDir={dir} engine={supplied.engine} />, {
      width: 100,
      height: 20,
      exitOnCtrlC: false,
    });
  let terminal = await render();
  try {
    await settle(terminal, (f) => f.includes("Search commands"));
    // The install runs as the launch's progress view; the command waits for it.
    await press(terminal, "enter");
    await settle(terminal, (f) => f.includes("Installing example"));
    expect(terminal.captureCharFrame()).not.toContain("count 0 popped false");
    await act(async () => finish());
    await settle(terminal, (f) => f.includes("count 0 popped false"));
    await press(terminal, "escape");
    await settle(terminal, (f) => f.includes("Search commands"));
    expect(calls).toBe(1);
    await act(async () => terminal.dispose());
    terminal = await render();
    await settle(terminal, (f) => f.includes("Search commands"));
    await press(terminal, "enter");
    await settle(terminal, (f) => f.includes("count 0 popped false"));
    expect(calls).toBe(1);
    await press(terminal, "escape");
    await settle(terminal, (f) => f.includes("Search commands"));
    await writeFile(
      join(dir, "package-lock.json"),
      JSON.stringify({ lockfileVersion: 3, packages: {} }),
    );
    supplied.emit("package-lock.json");
    await press(terminal, "enter");
    await settle(terminal, (f) => f.includes("Installing example"));
    expect(calls).toBe(2);
    await act(async () => finish());
    await settle(terminal, (f) => f.includes("count 0 popped false"));
  } finally {
    finish?.();
    await act(async () => terminal.dispose());
    await supplied.engine.close();
    await rm(join(dir, ".."), { recursive: true, force: true });
  }
}, 30_000);

test("failed install shows the installer's error", async () => {
  const dir = await copyFixture("host-session");
  const file = join(dir, "package.json");
  const manifest = JSON.parse(await readFile(file, "utf8"));
  await writeFile(file, JSON.stringify({ ...manifest, dependencies: { example: "1" } }));
  const terminal = await testRender(
    <CommandSession
      extensionDir={dir}
      dataDir={join(dir, "../data")}
      installer={async () => {
        throw new Error("offline install failure");
      }}
    />,
    { width: 100, height: 20, exitOnCtrlC: false },
  );
  try {
    await settle(terminal, (f) => f.includes("Search commands"));
    await press(terminal, "enter");
    await settle(
      terminal,
      (f) => f.includes("Could not install dependencies") && f.includes("offline install failure"),
    );
  } finally {
    await act(async () => terminal.dispose());
    await rm(join(dir, ".."), { recursive: true, force: true });
  }
}, 30_000);

test("required preferences block launch, persist, reach the runtime and Ctrl-E edits them", async () => {
  const dir = await copyFixture("host-session");
  const dataDir = join(dir, "../data");
  const file = join(dir, "package.json");
  await writeFile(
    file,
    JSON.stringify({
      name: "preferences-fixture",
      preferences: [
        { name: "token", title: "API key", type: "password", required: true },
        { name: "enabled", label: "Enabled", type: "checkbox", default: false },
      ],
      commands: [
        {
          name: "navigation",
          mode: "view",
          preferences: [
            {
              name: "choice",
              title: "Choice",
              type: "dropdown",
              default: "a",
              data: [
                { title: "Alpha", value: "a" },
                { title: "Beta", value: "b" },
              ],
            },
          ],
        },
      ],
    }),
  );
  await writeFile(
    join(dir, "src/navigation.tsx"),
    `import { List, Action, ActionPanel, getPreferenceValues, openCommandPreferences } from "@raycast/api";
    export default function Command() { const p = getPreferenceValues(); return <List><List.Item title={JSON.stringify(p)} actions={<ActionPanel><Action title="Preferences" onAction={openCommandPreferences} /></ActionPanel>} /></List>; }`,
  );
  const render = () =>
    testRender(<CommandSession extensionDir={dir} dataDir={dataDir} />, {
      width: 120,
      height: 25,
      exitOnCtrlC: false,
    });
  let terminal = await render();
  try {
    await settle(terminal, (f) => f.includes("Search commands"));
    await press(terminal, "enter");
    await settle(terminal, (f) => f.includes("Set up navigation"));
    await settle(terminal, (f) => f.includes("› API key"));
    await press(terminal, "enter");
    await settle(terminal, (f) => f.includes("Required"));
    await type(terminal, "secret");
    expect(terminal.captureCharFrame()).not.toContain("secret");
    await press(terminal, "enter");
    await settle(terminal, (f) => f.includes('"token":"secret"'));
    const { preferenceFile } = await import("@blastlauncher/host");
    const { stat } = await import("node:fs/promises");
    expect((await stat(preferenceFile(dataDir, "preferences-fixture"))).mode & 0o777).toBe(0o600);
    // The extension's capability returns to the root and opens the command's form.
    await press(terminal, "enter");
    await settle(terminal, (f) => f.includes("Configure navigation"));
    await settle(terminal, (f) => f.includes("Choice") && f.includes("Command"));
    expect(terminal.captureCharFrame()).not.toContain("API key");
    await press(terminal, "escape");
    await settle(terminal, (f) => f.includes("Search commands"));
    await act(async () => {
      terminal.mockInput.pressKey("e", { ctrl: true });
    });
    await settle(terminal, (f) => f.includes("Configure navigation"));
    await settle(terminal, (f) => f.includes("API key"));
    // A stored password is never sent to the client: typing replaces it.
    await type(terminal, "secret2");
    await press(terminal, "enter");
    await settle(terminal, (f) => f.includes("Search commands"));
    await act(async () => terminal.dispose());
    terminal = await render();
    await settle(terminal, (f) => f.includes("Search commands"));
    await press(terminal, "enter");
    await settle(terminal, (f) => f.includes('"token":"secret2"'));
  } finally {
    await act(async () => terminal.dispose());
    await rm(join(dir, ".."), { recursive: true, force: true });
  }
}, 30_000);

test("manifest with missing required preference shows Set up launch gate with only missing fields, launches after entry", async () => {
  const dir = await copyFixture("host-session");
  const dataDir = join(dir, "../data");
  const file = join(dir, "package.json");
  await writeFile(
    file,
    JSON.stringify({
      name: "preferences-gate-fixture",
      title: "Gate Fixture",
      preferences: [
        {
          name: "token",
          title: "API key",
          type: "password",
          required: true,
          description: "Your API token",
        },
        { name: "opt", title: "Optional note", type: "textfield", required: false },
      ],
      commands: [
        {
          name: "navigation",
          title: "Navigate",
          mode: "view",
          preferences: [
            {
              name: "reqCmd",
              title: "Command secret",
              type: "textfield",
              required: false,
              default: "saved-cmd-secret",
            },
          ],
        },
      ],
    }),
  );
  // Pre-store the required command preference
  const { createPreferenceStore } = await import("@blastlauncher/host");
  const store = createPreferenceStore({ extensionName: "preferences-gate-fixture", dataDir });
  await store.save({}, "navigation", { reqCmd: "stored-cmd-val" });

  await writeFile(
    join(dir, "src/navigation.tsx"),
    `import { List, getPreferenceValues } from "@raycast/api";
    export default function Command() { const p = getPreferenceValues(); return <List><List.Item title={JSON.stringify(p)} /></List>; }`,
  );
  const terminal = await testRender(<CommandSession extensionDir={dir} dataDir={dataDir} />, {
    width: 120,
    height: 25,
    exitOnCtrlC: false,
  });
  try {
    await settle(terminal, (f) => f.includes("Search commands"));
    await press(terminal, "enter");
    // Should show launch gate: "Set up Navigate", "These values are required before the command can run."
    const gateFrame = await settle(terminal, (f) => f.includes("Set up Navigate"));
    expect(gateFrame).toContain("These values are required before the command can run.");
    // The engine's prompt shows each field's description next to its title.
    expect(gateFrame).toContain("› API key · Your API token");
    // Optional extension pref and already stored command pref should NOT be in the launch gate
    expect(gateFrame).not.toContain("Optional note");
    expect(gateFrame).not.toContain("Command secret");

    // Typed and pasted (bracketed, trailing newline dropped) secrets combine.
    await type(terminal, "my-secret");
    await paste(terminal, "-token\n");
    const masked = await settle(terminal, (f) => f.includes("••••••••"));
    expect(masked).not.toContain("my-secret");
    expect(masked).not.toContain("-token");
    await press(terminal, "enter");
    // Launches and runtime receives both values
    await settle(
      terminal,
      (f) => f.includes('"token":"my-secret-token"') && f.includes('"reqCmd":"stored-cmd-val"'),
    );
  } finally {
    await act(async () => terminal.dispose());
    await rm(join(dir, ".."), { recursive: true, force: true });
  }
}, 30_000);

test("Ctrl-E opens extension Configure with fields and descriptions, saves and returns on Enter or Esc without launch", async () => {
  const dir = await copyFixture("host-session");
  const dataDir = join(dir, "../data");
  const file = join(dir, "package.json");
  await writeFile(
    file,
    JSON.stringify({
      name: "preferences-view-fixture",
      title: "View Fixture",
      preferences: [
        {
          name: "token",
          title: "API key",
          type: "password",
          required: true,
          description: "Your API token",
        },
        {
          name: "opt",
          title: "Optional note",
          type: "textfield",
          required: false,
          description: "An optional note",
        },
      ],
      commands: [
        {
          name: "navigation",
          title: "Navigate",
          mode: "view",
          preferences: [
            {
              name: "reqCmd",
              title: "Command secret",
              type: "textfield",
              required: false,
              default: "saved-cmd-secret",
              description: "Command specific secret",
            },
          ],
        },
      ],
    }),
  );
  await writeFile(
    join(dir, "src/navigation.tsx"),
    `import { List, getPreferenceValues } from "@raycast/api";
    export default function Command() { const p = getPreferenceValues(); return <List><List.Item title={JSON.stringify(p)} /></List>; }`,
  );
  const terminal = await testRender(<CommandSession extensionDir={dir} dataDir={dataDir} />, {
    width: 120,
    height: 25,
    exitOnCtrlC: false,
  });
  try {
    await settle(terminal, (f) => f.includes("Search commands"));
    // Press Ctrl-E to open preferences view
    await act(async () => {
      terminal.mockInput.pressKey("e", { ctrl: true });
    });
    // Header format: Configure <command title>
    const prefFrame = await settle(terminal, (f) => f.includes("Configure Navigate"));
    // The engine uses stable Extension/Command section headers.
    expect(prefFrame).toContain("Extension");
    expect(prefFrame).toContain("Navigate");
    // All fields with their descriptions, the first one focused
    expect(prefFrame).toContain("› API key · Your API token");
    expect(prefFrame).toContain("Optional note");

    // Move to next field (Down)
    await press(terminal, "down");
    await settle(terminal, (f) => f.includes("› Optional note · An optional note"));

    // Press Esc - cancels and returns to the root without launching
    await press(terminal, "escape");
    await settle(terminal, (f) => f.includes("Search commands"));
    expect(terminal.captureCharFrame()).not.toContain("Configure Navigate");

    // Open again with Ctrl-E, edit a field, and press Enter to save
    await act(async () => {
      terminal.mockInput.pressKey("e", { ctrl: true });
    });
    await settle(terminal, (f) => f.includes("Configure Navigate"));
    // token is focused
    await type(terminal, "saved-token");
    await press(terminal, "enter");

    // Returns to the root, no launch
    await settle(terminal, (f) => f.includes("Search commands"));
    expect(terminal.captureCharFrame()).not.toContain('"token":"saved-token"');

    // Now press Enter on command row to launch - since required preferences are set, launches immediately
    await press(terminal, "enter");
    await settle(
      terminal,
      (f) => f.includes('"token":"saved-token"') && f.includes('"reqCmd":"saved-cmd-secret"'),
    );
  } finally {
    await act(async () => terminal.dispose());
    await rm(join(dir, ".."), { recursive: true, force: true });
  }
}, 30_000);

test.each([
  ["openExtensionPreferences", "Extension", "API key", "Choice"],
  ["openCommandPreferences", "Command", "Choice", "API key"],
] as const)(
  "%s returns to the root and opens that Configure scope",
  async (api, section, shown, hidden) => {
    const dir = await copyFixture("host-session");
    const dataDir = join(dir, "../data");
    const file = join(dir, "package.json");
    await writeFile(
      file,
      JSON.stringify({
        name: "preferences-scope-fixture",
        title: "Scope Fixture",
        preferences: [{ name: "token", title: "API key", type: "password", required: true }],
        commands: [
          {
            name: "navigation",
            title: "Navigate",
            mode: "view",
            preferences: [
              {
                name: "choice",
                title: "Choice",
                type: "textfield",
                default: "default-val",
              },
            ],
          },
        ],
      }),
    );
    // Pre-store token so command can launch without gate
    const { createPreferenceStore } = await import("@blastlauncher/host");
    const store = createPreferenceStore({ extensionName: "preferences-scope-fixture", dataDir });
    await store.save({ token: "initial-token" }, "navigation", {});

    await writeFile(
      join(dir, "src/navigation.tsx"),
      `import { List, Action, ActionPanel, ${api} } from "@raycast/api";
    export default function Command() { return <List><List.Item title="Item" actions={<ActionPanel><Action title="Open Prefs" onAction={${api}} /></ActionPanel>} /></List>; }`,
    );
    const terminal = await testRender(<CommandSession extensionDir={dir} dataDir={dataDir} />, {
      width: 120,
      height: 25,
      exitOnCtrlC: false,
    });
    try {
      await settle(terminal, (f) => f.includes("Search commands"));
      await press(terminal, "enter");
      await settle(terminal, (f) => f.includes("Item"));
      await press(terminal, "enter");
      // Only the requested scope shows, not the root's own Configure scope.
      const frame = await settle(terminal, (f) => f.includes("Configure Navigate"));
      expect(frame).toContain(section);
      expect(frame).toContain(shown);
      expect(frame).not.toContain(hidden);

      await press(terminal, "escape");
      await settle(terminal, (f) => f.includes("Search commands"));
    } finally {
      await act(async () => terminal.dispose());
      await rm(join(dir, ".."), { recursive: true, force: true });
    }
  },
  30_000,
);

test("the launcher passes custom capability handlers to launched commands", async () => {
  const dir = await copyFixture("hello-list");
  const copied: unknown[] = [];
  const terminal = await testRender(
    <CommandSession
      extensionDir={dir}
      dataDir={join(dir, ".data")}
      handlers={{
        "clipboard.copy": (params) => {
          copied.push(params);
        },
      }}
    />,
    { width: 90, height: 25, exitOnCtrlC: false },
  );
  try {
    await settle(terminal, (frame) => frame.includes("Search commands"));
    await press(terminal, "enter");
    // The footer always ends in ^C Copy, so wait for the action's own title
    // before pressing Enter: an earlier frame has no selected action yet.
    await settle(terminal, (frame) => frame.includes("Copy apple"));
    await press(terminal, "enter");
    await settle(terminal, () => copied.length > 0);
    expect(copied).toEqual([{ text: "apple" }]);
  } finally {
    await act(async () => terminal.dispose());
    await rm(join(dir, ".."), { recursive: true, force: true });
  }
}, 30_000);
