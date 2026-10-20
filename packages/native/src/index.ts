import { execFile } from "node:child_process";
import { posix, win32 } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { JsonValue } from "@blastlauncher/protocol";
import { desktopHandlers } from "./desktop.ts";
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

export type CapabilityHandler = (
  params: JsonValue,
  context?: { signal: AbortSignal; progress(value: JsonValue): void },
) => JsonValue | void | Promise<JsonValue | void>;
export type Runner = (
  command: string,
  args: string[],
  options: { input?: string },
) => Promise<{ stdout: string; code: number }>;

const defaultRun: Runner = (command, args, { input }) =>
  new Promise((resolve, reject) => {
    const child = execFile(
      command,
      args,
      { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
      (error, stdout) => {
        if (error && typeof error.code !== "number") reject(error);
        else resolve({ stdout, code: typeof error?.code === "number" ? error.code : 0 });
      },
    );
    // The process result owns failures (including an early close of stdin).
    child.stdin?.on("error", () => {});
    child.stdin?.end(input);
  });

const object = (value: JsonValue): Record<string, JsonValue> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected capability params object");
  return value;
};
const text = (value: JsonValue | undefined): string => {
  if (typeof value !== "string" || value.includes("\0"))
    throw new Error("Expected string without NUL");
  return value;
};

export function createNativeHandlers({
  platform = process.platform,
  run = defaultRun,
  env = process.env,
}: {
  platform?: NodeJS.Platform;
  run?: Runner;
  env?: Record<string, string | undefined>;
} = {}): Record<string, CapabilityHandler> {
  const windows = platform === "win32",
    mac = platform === "darwin";
  const paths = windows ? win32 : posix;
  const absolute = (value: JsonValue | undefined): string => {
    let path = text(value);
    if (path.startsWith("file:")) path = fileURLToPath(path, { windows });
    if (!paths.isAbsolute(path)) throw new Error("An absolute path is required");
    return path;
  };
  async function command(capability: string, tool: string, args: string[], input?: string) {
    try {
      const result = await run(tool, args, input === undefined ? {} : { input });
      if (result.code !== 0)
        throw new Error(`${tool} failed for ${capability} on ${platform} (exit ${result.code})`);
      return result.stdout;
    } catch (error) {
      if (missing(error))
        throw new Error(`${tool} is required for ${capability} on ${platform}`, { cause: error });
      throw error;
    }
  }
  const ps = (cap: string, script: string, input?: JsonValue) =>
    command(
      cap,
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-STA", "-Command", psPrefix + script],
      input === undefined ? undefined : JSON.stringify(input),
    );
  const jxa = (cap: string, script: string, args: string[] = []) =>
    command(cap, "osascript", ["-l", "JavaScript", "-e", script, "--", ...args]);
  const wayland = !!env.WAYLAND_DISPLAY;
  function display() {
    if (!wayland && !env.DISPLAY)
      throw new Error("A Wayland or X11 display is required for clipboard operations on linux");
  }
  async function linuxClipboard(cap: string, read: boolean, type: string, input?: string) {
    display();
    if (wayland)
      return command(
        cap,
        read ? "wl-paste" : "wl-copy",
        read ? ["--no-newline", "--type", type] : ["--type", type],
        input,
      );
    try {
      return await command(
        cap,
        "xclip",
        ["-selection", "clipboard", read ? "-o" : "-i", "-target", type],
        input,
      );
    } catch (error) {
      if (
        !(
          error instanceof Error && error.message === `xclip is required for ${cap} on ${platform}`
        ) ||
        type !== "UTF8_STRING"
      )
        throw error;
      return command(cap, "xsel", ["--clipboard", read ? "--output" : "--input"], input);
    }
  }
  async function copy(cap: string, p: Record<string, JsonValue>) {
    const content: Record<string, JsonValue> = {};
    if (p.file !== undefined) content.file = absolute(p.file);
    else if (p.html !== undefined) {
      content.html = text(p.html);
      if (p.text !== undefined) content.text = text(p.text);
    } else content.text = text(p.text);
    if (mac) {
      if (content.html !== undefined || content.file !== undefined)
        await jxa(cap, macCopy, [JSON.stringify(content)]);
      else await command(cap, "pbcopy", [], text(content.text));
    } else if (windows) await ps(cap, psCopy, content);
    else {
      const type =
        content.file !== undefined
          ? "text/uri-list"
          : content.html !== undefined
            ? "text/html"
            : wayland
              ? "text/plain;charset=utf-8"
              : "UTF8_STRING";
      const input =
        content.file !== undefined
          ? pathToFileURL(text(content.file)).href + "\r\n"
          : text(content.html ?? content.text);
      await linuxClipboard(cap, false, type, input);
    }
  }
  const handlers: Record<string, CapabilityHandler> = {
    "clipboard.copy": async (params) => {
      await copy("clipboard.copy", object(params));
    },
    "clipboard.paste": async (params) => {
      await copy("clipboard.paste", object(params));
      if (mac)
        await command("clipboard.paste", "osascript", [
          "-e",
          'tell application "System Events" to keystroke "v" using command down',
        ]);
      else if (windows)
        await ps(
          "clipboard.paste",
          "Add-Type -AssemblyName System.Windows.Forms; [Windows.Forms.SendKeys]::SendWait('^v')",
        );
      else
        await command(
          "clipboard.paste",
          wayland ? "wtype" : "xdotool",
          wayland ? ["-M", "ctrl", "v", "-m", "ctrl"] : ["key", "--clearmodifiers", "ctrl+v"],
        );
    },
    "clipboard.clear": async () => {
      if (windows)
        await ps(
          "clipboard.clear",
          "Add-Type -AssemblyName System.Windows.Forms; [Windows.Forms.Clipboard]::Clear()",
        );
      else if (mac) await command("clipboard.clear", "pbcopy", [], "");
      else {
        display();
        if (wayland) await command("clipboard.clear", "wl-copy", ["--clear"]);
        else await linuxClipboard("clipboard.clear", false, "UTF8_STRING", "");
      }
    },
    "clipboard.read": async (params) => {
      const { offset } = object(params);
      if (
        offset !== undefined &&
        (typeof offset !== "number" || !Number.isInteger(offset) || offset < 0 || offset > 5)
      )
        throw new Error("Invalid clipboard offset");
      if (offset) return { text: "" };
      if (windows) return JSON.parse(await ps("clipboard.read", psRead)) as JsonValue;
      if (mac) {
        const plain = await command("clipboard.read", "pbpaste", []);
        return { ...JSON.parse(await jxa("clipboard.read", macRead)), text: plain } as JsonValue;
      }
      display();
      let types: string;
      try {
        types = await command(
          "clipboard.read",
          wayland ? "wl-paste" : "xclip",
          wayland ? ["--list-types"] : ["-selection", "clipboard", "-o", "-target", "TARGETS"],
        );
      } catch (error) {
        if (
          !(
            error instanceof Error &&
            error.message === "xclip is required for clipboard.read on linux"
          )
        )
          throw error;
        return { text: await command("clipboard.read", "xsel", ["--clipboard", "--output"]) };
      }
      const offered = types.split(/\s+/),
        result: Record<string, JsonValue> = { text: "" };
      const plain = offered.find((t) => t === "UTF8_STRING" || t.startsWith("text/plain"));
      if (plain) result.text = await linuxClipboard("clipboard.read", true, plain);
      for (const [key, type] of [
        ["html", "text/html"],
        ["file", "text/uri-list"],
      ] as const) {
        if (!offered.includes(type)) continue;
        const value = await linuxClipboard("clipboard.read", true, type);
        result[key] =
          key === "file"
            ? fileURLToPath(value.split(/\r?\n/).find((line) => line.startsWith("file:")) ?? "")
            : value;
      }
      return result;
    },
    "finder.show": async (params) => {
      const path = absolute(object(params).path);
      if (mac) await command("finder.show", "open", ["-R", path]);
      else if (windows) await command("finder.show", "explorer.exe", ["/select,", path]);
      else {
        try {
          await command("finder.show", "dbus-send", [
            "--session",
            "--print-reply",
            "--dest=org.freedesktop.FileManager1",
            "/org/freedesktop/FileManager1",
            "org.freedesktop.FileManager1.ShowItems",
            `array:string:${pathToFileURL(path).href.replaceAll(",", "%2C")}`,
            "string:",
          ]);
        } catch {
          await command("finder.show", "gio", ["open", paths.dirname(path)]);
        }
      }
    },
    trash: async (params) => {
      const values = object(params).paths;
      if (!Array.isArray(values)) throw new Error("Expected paths array");
      const files = values.map(absolute);
      if (!files.length) return;
      if (mac) await jxa("trash", macTrash, files);
      else if (windows) await ps("trash", psTrash, { paths: files });
      else await command("trash", "gio", ["trash", "--", ...files]);
    },
  };
  for (const name of ["open.url", "open.path"])
    handlers[name] = async (params) => {
      const p = object(params),
        target = name === "open.path" ? absolute(p.path) : text(p.url);
      if (name === "open.url") {
        let url: URL;
        try {
          url = new URL(target);
        } catch {
          throw new Error("Invalid URL");
        }
        if (url.protocol === "javascript:")
          throw new Error("Invalid URL: javascript: is forbidden");
      }
      const bundleId =
        p.application &&
        typeof p.application === "object" &&
        !Array.isArray(p.application) &&
        !p.application.path
          ? p.application.bundleId
          : undefined;
      let app = p.application;
      if (app && typeof app === "object" && !Array.isArray(app))
        app = app.path ?? app.bundleId ?? app.name;
      const application = app === undefined ? undefined : text(app);
      if (mac)
        await command(name, "open", [
          ...(application ? [bundleId ? "-b" : "-a", application] : []),
          "--",
          target,
        ]);
      else if (windows)
        await ps(name, psOpen, {
          target,
          ...(application
            ? {
                application,
                argument:
                  '"' + target.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, "$1$1") + '"',
              }
            : {}),
        });
      else if (application?.endsWith(".desktop"))
        await command(name, "gio", ["launch", application, target]);
      else await command(name, application ?? "xdg-open", [target]);
    };
  if (platform !== "darwin" && platform !== "win32" && platform !== "linux") {
    for (const name of Object.keys(handlers))
      handlers[name] = () => {
        throw new Error(`Unsupported native platform: ${platform}`);
      };
  }
  return { ...handlers, ...desktopHandlers({ platform, env, command, ps, jxa }) };
}

function missing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
