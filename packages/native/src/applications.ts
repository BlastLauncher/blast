import { readdir, readFile, readlink } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, isAbsolute, join, relative } from "node:path";
import type { JsonValue } from "@blastlauncher/protocol";
import type { CapabilityHandler } from "./index.ts";
import { params, string, unsupported, x11, type DesktopTools } from "./desktop.ts";
import { macApplications, psApplications } from "./desktop-scripts.ts";

type Entry = { id: string; app: { name: string; path: string }; mime: string[] };
async function entries(env: DesktopTools["env"]): Promise<Entry[]> {
  const roots = [
    env.XDG_DATA_HOME || join(env.HOME || homedir(), ".local/share"),
    ...(env.XDG_DATA_DIRS || "/usr/local/share:/usr/share").split(":"),
  ];
  const seen = new Set<string>(),
    result: Entry[] = [];
  for (const root of roots.filter(isAbsolute)) {
    const dir = join(root, "applications");
    let files;
    try {
      files = await readdir(dir, { recursive: true, withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    for (const file of files.toSorted((a, b) => a.name.localeCompare(b.name))) {
      if ((!file.isFile() && !file.isSymbolicLink()) || !file.name.endsWith(".desktop")) continue;
      const path = join(file.parentPath, file.name),
        id = relative(dir, path).replaceAll("/", "-");
      if (seen.has(id)) continue;
      seen.add(id);
      const data: Record<string, string> = {};
      let main = false;
      for (const line of (await readFile(path, "utf8")).split(/\r?\n/)) {
        if (line.startsWith("[")) main = line === "[Desktop Entry]";
        else if (main && !line.startsWith("#")) {
          const at = line.indexOf("=");
          if (at > 0)
            data[line.slice(0, at)] = line
              .slice(at + 1)
              .replace(
                /\\([sntr\\])/g,
                (_, c: string) => ({ s: " ", n: "\n", t: "\t", r: "\r", "\\": "\\" })[c]!,
              );
        }
      }
      if (data.Type !== "Application" || data.Hidden === "true" || !data.Name) continue;
      // A desktop file is the portable launchable application identity; Exec is
      // a command template, not a filesystem path, and is never executed here.
      result.push({ id, app: { name: data.Name, path }, mime: (data.MimeType || "").split(";") });
    }
  }
  return result;
}
export function applicationHandlers(t: DesktopTools): Record<string, CapabilityHandler> {
  return Object.fromEntries(
    ["list", "default", "frontmost"].map((op) => {
      const cap = `applications.${op}`;
      return [
        cap,
        async (value: JsonValue) => {
          const p = params(value);
          if (op === "default" || p.path !== undefined) string(p.path);
          if (t.platform === "darwin")
            return JSON.parse(
              await t.jxa(cap, macApplications, [op, JSON.stringify(p)]),
            ) as JsonValue;
          if (t.platform === "win32")
            return JSON.parse(await t.ps(cap, psApplications, { ...p, op })) as JsonValue;
          if (t.platform !== "linux")
            unsupported(t, cap, "desktop application discovery is unavailable");
          if (op === "frontmost") {
            x11(t, cap);
            const id = (await t.command(cap, "xdotool", ["getactivewindow"])).trim();
            const pid = (await t.command(cap, "xdotool", ["getwindowpid", id])).trim();
            if (!/^\d+$/.test(pid)) throw new Error("Invalid frontmost process id");
            const path = await readlink(`/proc/${pid}/exe`);
            return { name: basename(path), path };
          }
          const apps = await entries(t.env);
          if (p.path === undefined) return apps.map((e) => e.app);
          const mime = (
            await t.command(cap, "xdg-mime", ["query", "filetype", string(p.path)])
          ).trim();
          if (op === "list") return apps.filter((e) => e.mime.includes(mime)).map((e) => e.app);
          const id = (await t.command(cap, "xdg-mime", ["query", "default", mime])).trim();
          const app = apps.find((e) => e.id === id)?.app;
          if (!app) throw new Error(`No default application for ${p.path}`);
          return app;
        },
      ];
    }),
  );
}
