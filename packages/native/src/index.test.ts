import { expect, test } from "bun:test";
import { createNativeHandlers, type Runner } from "./index.ts";
import {
  macCopy,
  macRead,
  macTrash,
  psPrefix,
  psCopy,
  psRead,
  psOpen,
  psTrash,
} from "./scripts.ts";
import type { JsonValue } from "@blastlauncher/protocol";

type Call = [string, string[], { input?: string }];
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
const absent = () => Object.assign(new Error("not found"), { code: "ENOENT" });
const environments = [
  { platform: "darwin", env: {} },
  { platform: "win32", env: {} },
  { platform: "linux", env: { WAYLAND_DISPLAY: "wayland-0", DISPLAY: ":0" } },
  { platform: "linux", env: { DISPLAY: ":0" } },
] as const;

for (const options of environments) {
  const mac = options.platform === "darwin",
    win = options.platform === "win32",
    wl = "WAYLAND_DISPLAY" in options.env;
  const label = mac ? "macOS" : win ? "Windows" : wl ? "Wayland" : "X11";
  const path = win ? "C:\\folder\\a ' $().txt" : "/folder/a ' $().txt";
  const copy = (input: string): Call =>
    mac
      ? ["pbcopy", [], { input }]
      : win
        ? ps(psCopy, { text: input })
        : [
            wl ? "wl-copy" : "xclip",
            wl
              ? ["--type", "text/plain;charset=utf-8"]
              : ["-selection", "clipboard", "-i", "-target", "UTF8_STRING"],
            { input },
          ];
  const paste: Call = mac
    ? [
        "osascript",
        ["-e", 'tell application "System Events" to keystroke "v" using command down'],
        {},
      ]
    : win
      ? ps("Add-Type -AssemblyName System.Windows.Forms; [Windows.Forms.SendKeys]::SendWait('^v')")
      : [
          wl ? "wtype" : "xdotool",
          wl ? ["-M", "ctrl", "v", "-m", "ctrl"] : ["key", "--clearmodifiers", "ctrl+v"],
          {},
        ];
  const clear: Call = mac
    ? ["pbcopy", [], { input: "" }]
    : win
      ? ps("Add-Type -AssemblyName System.Windows.Forms; [Windows.Forms.Clipboard]::Clear()")
      : wl
        ? ["wl-copy", ["--clear"], {}]
        : copy("");
  const open = (target: string, application?: string): Call =>
    mac
      ? ["open", [...(application ? ["-a", application] : []), "--", target], {}]
      : win
        ? ps(psOpen, {
            target,
            ...(application ? { application, argument: '"' + target + '"' } : {}),
          })
        : [application ?? "xdg-open", [target], {}];
  const show: Call = mac
    ? ["open", ["-R", path], {}]
    : win
      ? ["explorer.exe", ["/select,", path], {}]
      : [
          "dbus-send",
          [
            "--session",
            "--print-reply",
            "--dest=org.freedesktop.FileManager1",
            "/org/freedesktop/FileManager1",
            "org.freedesktop.FileManager1.ShowItems",
            "array:string:file:///folder/a%20'%20$().txt",
            "string:",
          ],
          {},
        ];
  const trash: Call = mac
    ? jxa(macTrash, [path])
    : win
      ? ps(psTrash, { paths: [path] })
      : ["gio", ["trash", "--", path], {}];
  const cases: Array<[string, JsonValue, Call[]]> = [
    ["clipboard.copy", { text: "héllo\n' $()" }, [copy("héllo\n' $()")]],
    ["clipboard.paste", { text: "paste" }, [copy("paste"), paste]],
    ["clipboard.clear", {}, [clear]],
    [
      "open.url",
      { url: "https://example.com/a?q='$(bad)" },
      [open("https://example.com/a?q='$(bad)")],
    ],
    ["open.path", { path }, [open(path)]],
    ["finder.show", { path }, [show]],
    ["trash", { paths: [path] }, [trash]],
    [
      "open.url",
      { url: "mailto:a@example.com", application: "mail" },
      [open("mailto:a@example.com", "mail")],
    ],
    ["open.path", { path, application: { path: "viewer" } }, [open(path, "viewer")]],
  ];
  test(`${label}: every native effect uses exact argument arrays`, async () => {
    const calls: Call[] = [];
    const handlers = createNativeHandlers({
      ...options,
      run: async (...args) => {
        calls.push(args);
        return { stdout: "", code: 0 };
      },
    });
    for (const [name, params, expected] of cases) {
      calls.length = 0;
      await handlers[name]!(params);
      expect(calls).toEqual(expected);
    }
  });
  test(`${label}: rich clipboard copy and read preserve representation`, async () => {
    const calls: Call[] = [];
    const handlers = createNativeHandlers({
      ...options,
      run: async (...args) => {
        calls.push(args);
        const key = args[1].at(-1);
        return {
          stdout:
            args[0] === "pbpaste"
              ? "text\n"
              : mac || win
                ? '{"text":"text\\n","html":"<b>text</b>","file":"/file"}'
                : args[1].includes("--list-types") || key === "TARGETS"
                  ? "UTF8_STRING\ntext/html\ntext/uri-list\n"
                  : key === "text/html"
                    ? "<b>text</b>"
                    : key === "text/uri-list"
                      ? "file:///file\r\n"
                      : "text\n",
          code: 0,
        };
      },
    });
    for (const content of [{ html: "<b>text</b>", text: "text" }, { file: path }]) {
      calls.length = 0;
      await handlers["clipboard.copy"]!(content);
      const type = "file" in content ? "text/uri-list" : "text/html";
      const input = "file" in content ? "file:///folder/a%20'%20$().txt\r\n" : "<b>text</b>";
      expect(calls).toEqual(
        mac
          ? [jxa(macCopy, [JSON.stringify(content)])]
          : win
            ? [ps(psCopy, content)]
            : [
                [
                  wl ? "wl-copy" : "xclip",
                  wl ? ["--type", type] : ["-selection", "clipboard", "-i", "-target", type],
                  { input },
                ],
              ],
      );
    }
    calls.length = 0;
    expect(await handlers["clipboard.read"]!({})).toEqual({
      text: "text\n",
      html: "<b>text</b>",
      file: "/file",
    });
    expect(calls).toEqual(
      mac
        ? [["pbpaste", [], {}], jxa(macRead)]
        : win
          ? [ps(psRead)]
          : [
              [
                wl ? "wl-paste" : "xclip",
                wl ? ["--list-types"] : ["-selection", "clipboard", "-o", "-target", "TARGETS"],
                {},
              ],
              ...["UTF8_STRING", "text/html", "text/uri-list"].map((type): Call => [
                wl ? "wl-paste" : "xclip",
                wl
                  ? ["--no-newline", "--type", type]
                  : ["-selection", "clipboard", "-o", "-target", type],
                {},
              ]),
            ],
    );
    calls.length = 0;
    expect(await handlers["clipboard.read"]!({ offset: 1 })).toEqual({ text: "" });
    expect(calls).toEqual([]);
  });
  test(`${label}: validation and missing tools fail before unsafe operations`, async () => {
    const calls: Call[] = [];
    const handlers = createNativeHandlers({
      ...options,
      run: async (...args) => {
        calls.push(args);
        throw absent();
      },
    });
    for (const [name, params] of cases)
      await expect(Promise.resolve().then(() => handlers[name]!(params))).rejects.toThrow(
        `is required for ${name} on ${options.platform}`,
      );
    await expect(handlers["clipboard.read"]!({})).rejects.toThrow(
      `is required for clipboard.read on ${options.platform}`,
    );
    calls.length = 0;
    for (const [name, params, message] of [
      ["open.url", { url: "no URL" }, "Invalid URL"],
      ["open.url", { url: " JAVASCRIPT:alert(1)" }, "javascript:"],
      ["open.path", { path: "relative" }, "absolute path"],
      ["finder.show", { path: "relative" }, "absolute path"],
      ["trash", { paths: [path, "relative"] }, "absolute path"],
      ["trash", { paths: "wrong" }, "paths array"],
      ["clipboard.copy", { file: "relative" }, "absolute path"],
      ["clipboard.copy", {}, "Expected string"],
      ["clipboard.read", { offset: -1 }, "Invalid clipboard offset"],
    ] as const)
      await expect(
        Promise.resolve().then(() => handlers[name]!(params as JsonValue)),
      ).rejects.toThrow(message);
    expect(calls).toEqual([]);
  });
}

test("X11 falls back to xsel for text only; file-manager failure opens the parent", async () => {
  const calls: Call[] = [];
  const run: Runner = async (...args) => {
    calls.push(args);
    if (["xclip", "dbus-send"].includes(args[0])) throw absent();
    return { stdout: "fallback", code: 0 };
  };
  const handlers = createNativeHandlers({ platform: "linux", env: { DISPLAY: ":0" }, run });
  await handlers["clipboard.copy"]!({ text: "x" });
  expect(await handlers["clipboard.read"]!({})).toEqual({ text: "fallback" });
  await handlers["finder.show"]!({ path: "/a/file" });
  expect(calls).toEqual([
    ["xclip", ["-selection", "clipboard", "-i", "-target", "UTF8_STRING"], { input: "x" }],
    ["xsel", ["--clipboard", "--input"], { input: "x" }],
    ["xclip", ["-selection", "clipboard", "-o", "-target", "TARGETS"], {}],
    ["xsel", ["--clipboard", "--output"], {}],
    [
      "dbus-send",
      [
        "--session",
        "--print-reply",
        "--dest=org.freedesktop.FileManager1",
        "/org/freedesktop/FileManager1",
        "org.freedesktop.FileManager1.ShowItems",
        "array:string:file:///a/file",
        "string:",
      ],
      {},
    ],
    ["gio", ["open", "/a"], {}],
  ]);
  await expect(handlers["clipboard.copy"]!({ html: "<b>x</b>" })).rejects.toThrow(
    "xclip is required",
  );
});

test("nonzero tools and missing paste keystrokes fail clearly; no display fails before running", async () => {
  let count = 0;
  const handlers = createNativeHandlers({
    platform: "linux",
    env: { WAYLAND_DISPLAY: "w" },
    run: async () => ({ stdout: "", code: ++count === 1 ? 0 : 1 }),
  });
  await expect(handlers["clipboard.paste"]!({ text: "x" })).rejects.toThrow(
    "wtype failed for clipboard.paste on linux (exit 1)",
  );
  const noDisplay = createNativeHandlers({
    platform: "linux",
    env: {},
    run: async () => {
      throw new Error("must not run");
    },
  });
  await expect(noDisplay["clipboard.copy"]!({ text: "x" })).rejects.toThrow("display is required");
  const unsupported = createNativeHandlers({ platform: "freebsd" });
  expect(() => unsupported["trash"]!({ paths: [] })).toThrow("Unsupported native platform");
});
