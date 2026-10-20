import { expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm, readlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type { JsonValue } from "@blastlauncher/protocol";
import { createNativeHandlers, type Runner } from "./index.ts";
import {
  macApplications,
  psApplications,
  macSelectedText,
  macSelectedFiles,
  psSelectedText,
  psSelectedFiles,
} from "./desktop-scripts.ts";
import { psWindows } from "./windows-scripts.ts";
import { psPrefix } from "./scripts.ts";

type Call = [string, string[], { input?: string }];
function fake(
  platform: NodeJS.Platform,
  output: string[],
  env: Record<string, string | undefined> = { DISPLAY: ":1" },
) {
  const calls: Call[] = [];
  const run: Runner = async (...args) => {
    calls.push(args);
    if (!output.length) throw new Error("Unexpected command");
    return { stdout: output.shift()!, code: 0 };
  };
  return { handlers: createNativeHandlers({ platform, run, env }), calls };
}
const ps = (script: string, input?: JsonValue): Call => [
  "powershell.exe",
  ["-NoProfile", "-NonInteractive", "-STA", "-Command", psPrefix + script],
  input === undefined ? {} : { input: JSON.stringify(input) },
];
const jxa = (script: string, args: string[] = []): Call => [
  "osascript",
  ["-l", "JavaScript", "-e", script, "--", ...args],
  {},
];
const app = { name: "Editor", path: "/Applications/Editor.app", bundleId: "test.editor" };
const window = {
  id: "42",
  desktopId: "1",
  active: true,
  fullScreenSettable: false,
  resizable: true,
  positionable: true,
  bounds: { position: { x: 2, y: 3 }, size: { width: 800, height: 600 } },
};

for (const platform of ["darwin", "win32"] as const) {
  test(`${platform}: applications and selection use fixed scripts and preserve wire results`, async () => {
    const { handlers: h, calls } = fake(platform, [
      JSON.stringify([app]),
      JSON.stringify(app),
      JSON.stringify(app),
      platform === "darwin" ? '"selected\\n"\n' : "selected\n",
      '[{"path":"/file #1"}]',
    ]);
    const path = "/file ' $(bad).txt";
    expect(await h["applications.list"]!({})).toEqual([app]);
    expect(await h["applications.default"]!({ path })).toEqual(app);
    expect(await h["applications.frontmost"]!({})).toEqual(app);
    expect(await h["selection.text"]!({})).toBe("selected\n");
    expect(await h["selection.files"]!({})).toEqual([{ path: "/file #1" }]);
    expect(calls).toEqual(
      platform === "darwin"
        ? [
            jxa(macApplications, ["list", "{}"]),
            jxa(macApplications, ["default", JSON.stringify({ path })]),
            jxa(macApplications, ["frontmost", "{}"]),
            jxa(macSelectedText),
            jxa(macSelectedFiles),
          ]
        : [
            ps(psApplications, { op: "list" }),
            ps(psApplications, { path, op: "default" }),
            ps(psApplications, { op: "frontmost" }),
            ps(psSelectedText),
            ps(psSelectedFiles),
          ],
    );
  });
}

test("Linux desktop entries respect XDG precedence, tombstones, sections, escapes, MIME and nested IDs", async () => {
  const dir = await mkdtemp(join(tmpdir(), "blast-native-"));
  try {
    const user = join(dir, "user"),
      system = join(dir, "system");
    await mkdir(join(user, "applications"), { recursive: true });
    await mkdir(join(system, "applications", "nested"), { recursive: true });
    await writeFile(join(user, "applications", "hidden.desktop"), "[Desktop Entry]\nHidden=true\n");
    await writeFile(
      join(system, "applications", "hidden.desktop"),
      "[Desktop Entry]\nType=Application\nName=Hidden\n",
    );
    await writeFile(
      join(system, "applications", "nested", "editor.desktop"),
      "[Desktop Entry]\nType=Application\nName=Text\\sEditor\nMimeType=text/plain;\nNoDisplay=true\nExec=never-executed %f\n[Desktop Action Other]\nName=Wrong\n",
    );
    await writeFile(
      join(user, "applications", "link.desktop"),
      "[Desktop Entry]\nType=Link\nName=Wrong\n",
    );
    const { handlers: h, calls } = fake(
      "linux",
      ["text/plain\n", "text/plain\n", "nested-editor.desktop\n", "", "missing.desktop\n", ""],
      { XDG_DATA_HOME: user, XDG_DATA_DIRS: `${system}:${join(dir, "absent")}` },
    );
    const editor = {
      name: "Text Editor",
      path: join(system, "applications/nested/editor.desktop"),
    };
    expect(await h["applications.list"]!({})).toEqual([editor]);
    expect(calls).toEqual([]);
    expect(await h["applications.list"]!({ path: "/file" })).toEqual([editor]);
    expect(await h["applications.default"]!({ path: "/file" })).toEqual(editor);
    await expect(h["applications.default"]!({ path: "/unknown" })).rejects.toThrow(
      "No default application",
    );
    await h["open.path"]!({ path: "/file", application: editor });
    expect(calls).toEqual([
      ["xdg-mime", ["query", "filetype", "/file"], {}],
      ["xdg-mime", ["query", "filetype", "/file"], {}],
      ["xdg-mime", ["query", "default", "text/plain"], {}],
      ["xdg-mime", ["query", "filetype", "/unknown"], {}],
      ["xdg-mime", ["query", "default", ""], {}],
      ["gio", ["launch", editor.path, "/file"], {}],
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("X11 frontmost resolves the real executable and text uses primary selection", async () => {
  const { handlers: h, calls } = fake("linux", ["42\n", String(process.pid), "selected\n"]);
  const path = await readlink(`/proc/${process.pid}/exe`);
  expect(await h["applications.frontmost"]!({})).toEqual({ name: basename(path), path });
  expect(await h["selection.text"]!({})).toBe("selected\n");
  expect(calls).toEqual([
    ["xdotool", ["getactivewindow"], {}],
    ["xdotool", ["getwindowpid", "42"], {}],
    ["xclip", ["-selection", "primary", "-o"], {}],
  ]);
});

test("X11 reads desktops, active/sticky windows, geometry and allowed actions", async () => {
  const listing =
    "0x0000002a 1 2 3 800 600 host title\n0x0000002b 0 0 0 1 1 host other\n0x0000002c -1 0 0 1 1 host sticky\n";
  const properties =
    "_NET_WM_ALLOWED_ACTIONS(ATOM) = _NET_WM_ACTION_MOVE, _NET_WM_ACTION_RESIZE\n_NET_WM_STATE(ATOM) =";
  const { handlers: h, calls } = fake("linux", [
    "0 - DG: 1920x1080 VP: 0,0\n1 * DG: 1920x1080 VP: 0,0\n",
    "42",
    "1",
    listing,
    properties,
    properties,
    "42",
    "1",
    listing,
    properties + "_NET_WM_STATE_FULLSCREEN",
  ]);
  expect(await h["window.desktops"]!({})).toEqual(
    [0, 1].map((id) => ({
      id: String(id),
      screenId: ":1",
      active: id === 1,
      type: "User",
      size: { width: 1920, height: 1080 },
    })),
  );
  const windows = await h["window.list"]!({});
  expect(windows).toEqual([
    { ...window, id: "0x0000002a" },
    {
      ...window,
      id: "0x0000002c",
      active: false,
      bounds: { position: { x: 0, y: 0 }, size: { width: 1, height: 1 } },
    },
  ]);
  expect(await h["window.active"]!({})).toEqual({
    ...window,
    id: "0x0000002a",
    bounds: "fullscreen",
  });
  expect(calls[0]).toEqual(["wmctrl", ["-d"], {}]);
  expect(calls[4]).toEqual([
    "xprop",
    ["-id", "0x0000002a", "_NET_WM_ALLOWED_ACTIONS", "_NET_WM_STATE"],
    {},
  ]);
});

test("X11 partial bounds preserve unspecified coordinates and fullscreen is explicit", async () => {
  const { handlers: h, calls } = fake("linux", ["", "", "", ""]);
  await h["window.setBounds"]!({
    id: "42",
    bounds: { position: { x: -20 }, size: { height: 300 } },
    desktopId: "2",
  });
  await h["window.setBounds"]!({ id: "42", bounds: "fullscreen" });
  expect(calls).toEqual([
    ["wmctrl", ["-i", "-r", "42", "-b", "remove,fullscreen,maximized_vert,maximized_horz"], {}],
    ["wmctrl", ["-i", "-r", "42", "-e", "0,-20,-1,-1,300"], {}],
    ["wmctrl", ["-i", "-r", "42", "-t", "2"], {}],
    ["wmctrl", ["-i", "-r", "42", "-b", "add,fullscreen"], {}],
  ]);
});

const macWindow = {
  id: 42,
  space: 1,
  frame: { x: 2, y: 3, w: 800, h: 600 },
  "has-focus": true,
  "can-move": true,
  "can-resize": true,
  "is-native-fullscreen": false,
};
test("macOS yabai maps real Spaces/displays and windows and preserves partial bounds", async () => {
  const { handlers: h, calls } = fake("darwin", [
    JSON.stringify([{ index: 1, display: 2, "is-visible": true, "is-native-fullscreen": false }]),
    JSON.stringify([{ index: 2, uuid: "screen-uuid", frame: { w: 1920, h: 1080 } }]),
    JSON.stringify([macWindow]),
    JSON.stringify(macWindow),
    JSON.stringify(macWindow),
    "",
    "",
    "",
    JSON.stringify(macWindow),
    "",
  ]);
  expect(await h["window.desktops"]!({})).toEqual([
    {
      id: "1",
      screenId: "screen-uuid",
      active: true,
      type: "User",
      size: { width: 1920, height: 1080 },
    },
  ]);
  expect(await h["window.list"]!({})).toEqual([{ ...window, fullScreenSettable: true }]);
  expect(await h["window.active"]!({})).toEqual({ ...window, fullScreenSettable: true });
  await h["window.setBounds"]!({
    id: "42",
    bounds: { position: { x: 10 }, size: { height: 100 } },
    desktopId: "2",
  });
  await h["window.setBounds"]!({ id: "42", bounds: "fullscreen" });
  expect(calls.map((c) => c.slice(0, 2))).toEqual([
    ["yabai", ["-m", "query", "--spaces"]],
    ["yabai", ["-m", "query", "--displays"]],
    ["yabai", ["-m", "query", "--windows", "--space"]],
    ["yabai", ["-m", "query", "--windows", "--window"]],
    ["yabai", ["-m", "query", "--windows", "--window", "42"]],
    ["yabai", ["-m", "window", "42", "--move", "abs:10:3"]],
    ["yabai", ["-m", "window", "42", "--resize", "abs:800:100"]],
    ["yabai", ["-m", "window", "42", "--space", "2"]],
    ["yabai", ["-m", "query", "--windows", "--window", "42"]],
    ["yabai", ["-m", "window", "42", "--toggle", "native-fullscreen"]],
  ]);
});

test("Windows window reads and mutation use JSON stdin; unsupported operations reject", async () => {
  const { handlers: h, calls } = fake("win32", [
    JSON.stringify([window]),
    JSON.stringify(window),
    "null",
  ]);
  expect(await h["window.list"]!({})).toEqual([window]);
  expect(await h["window.active"]!({})).toEqual(window);
  const p = { id: "42", bounds: { size: { width: 400 } } };
  await h["window.setBounds"]!(p);
  expect(calls).toEqual([
    ps(psWindows, { op: "list" }),
    ps(psWindows, { op: "active" }),
    ps(psWindows, { ...p, op: "setBounds" }),
  ]);
  await expect(h["window.desktops"]!({})).rejects.toThrow(
    "window.desktops is not supported on win32:",
  );
  await expect(h["window.setBounds"]!({ id: "42", bounds: "fullscreen" })).rejects.toThrow(
    "window.setBounds is not supported on win32:",
  );
});

const capabilities = [
  "applications.list",
  "applications.default",
  "applications.frontmost",
  "selection.text",
  "selection.files",
  "window.desktops",
  "window.list",
  "window.active",
  "window.setBounds",
];
test("unsupported platforms and Wayland/no-display combinations name the capability and session", async () => {
  for (const platform of ["freebsd", "linux"] as const) {
    const { handlers: h, calls } = fake(platform, [], {
      WAYLAND_DISPLAY: "wayland-0",
      DISPLAY: ":1",
    });
    for (const cap of platform === "freebsd"
      ? capabilities
      : [
          "applications.frontmost",
          "selection.files",
          ...capabilities.filter((c) => c.startsWith("window.")),
        ]) {
      await expect(Promise.resolve().then(() => h[cap]!({ path: "/file" }))).rejects.toThrow(
        `${cap} is not supported on ${platform}${platform === "linux" ? "/Wayland" : ""}:`,
      );
    }
    expect(calls).toEqual([]);
  }
  const { handlers: h, calls } = fake("linux", ["primary"], { WAYLAND_DISPLAY: "wl" });
  expect(await h["selection.text"]!({})).toBe("primary");
  expect(calls).toEqual([["wl-paste", ["--primary", "--no-newline"], {}]]);
  const absent = fake("linux", [], {}).handlers;
  await expect(absent["window.list"]!({})).rejects.toThrow("an X11 display is required");
  await expect(absent["selection.text"]!({})).rejects.toThrow("display is required");
});

test("missing tools, nonzero exits, invalid bounds and malformed tool results fail without fake answers", async () => {
  for (const platform of ["darwin", "win32", "linux"] as const) {
    const h = createNativeHandlers({
      platform,
      env: { DISPLAY: ":1" },
      run: async () => {
        throw Object.assign(new Error("missing"), { code: "ENOENT" });
      },
    });
    await expect(h["selection.text"]!({})).rejects.toThrow(
      `is required for selection.text on ${platform}`,
    );
    for (const bounds of [null, { size: { width: 0 } }, { position: { x: "1" } }])
      await expect(h["window.setBounds"]!({ id: "42", bounds })).rejects.toThrow();
  }
  const failed = createNativeHandlers({
    platform: "linux",
    env: { DISPLAY: ":1" },
    run: async () => ({ stdout: "", code: 1 }),
  });
  await expect(failed["window.desktops"]!({})).rejects.toThrow(
    "wmctrl failed for window.desktops on linux (exit 1)",
  );
  await expect(fake("linux", ["bad"]).handlers["window.desktops"]!({})).rejects.toThrow(
    "Invalid wmctrl",
  );
  await expect(fake("linux", [""]).handlers["window.active"]!({})).rejects.toThrow(
    "No active window",
  );
});

for (const platform of ["darwin", "win32"] as const) {
  test(`${platform}: path-filtered application queries pass data separately`, async () => {
    const { handlers: h, calls } = fake(platform, [JSON.stringify([app])]);
    const path = "file ' $(bad).txt";
    expect(await h["applications.list"]!({ path, op: "default" })).toEqual([app]);
    expect(calls).toEqual(
      platform === "darwin"
        ? [jxa(macApplications, ["list", JSON.stringify({ path, op: "default" })])]
        : [ps(psApplications, { path, op: "list" })],
    );
  });
}

test("clipboard selection round trips serialize and a failure releases the queue", async () => {
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  let count = 0;
  const h = createNativeHandlers({
    platform: "win32",
    run: async () => {
      count++;
      if (count === 1) {
        await waiting;
        throw new Error("Copy failed");
      }
      return { stdout: "next selection", code: 0 };
    },
  });
  const first = Promise.resolve(h["selection.text"]!({})).catch((e: Error) => e.message);
  const second = h["selection.text"]!({});
  await Promise.resolve();
  expect(count).toBe(1);
  release();
  expect(await first).toBe("Copy failed");
  expect(await second).toBe("next selection");
  expect(count).toBe(2);
});
