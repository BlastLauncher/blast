import type { JsonValue } from "@blastlauncher/protocol";
import type { CapabilityHandler } from "./index.ts";
import { params, string, unsupported, x11, type DesktopTools } from "./desktop.ts";
import { macWindows } from "./windows-macos.ts";
import { psWindows } from "./windows-scripts.ts";

export function windowHandlers(t: DesktopTools): Record<string, CapabilityHandler> {
  return Object.fromEntries(
    ["desktops", "list", "active", "setBounds"].map((op) => {
      const cap = `window.${op}`;
      return [
        cap,
        async (value: JsonValue) => {
          const p = params(value);
          if (t.platform === "darwin") {
            if (op === "setBounds") validateBounds(p);
            return macWindows(t, cap, op, p);
          }
          if (t.platform === "win32") {
            if (op === "desktops")
              unsupported(t, cap, "Windows has no supported virtual-desktop enumeration API");
            if (op === "setBounds") {
              validateBounds(p);
              if (!/^\d+$/.test(string(p.id))) throw new Error("Invalid window id");
              if (
                p.desktopId !== undefined &&
                !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(string(p.desktopId))
              )
                throw new Error("Invalid desktop id");
              if (p.bounds === "fullscreen")
                unsupported(t, cap, "generic Win32 windows have no fullscreen operation");
            }
            return JSON.parse(await t.ps(cap, psWindows, { ...p, op })) as JsonValue;
          }
          if (t.platform !== "linux") unsupported(t, cap, "window management is unavailable");
          x11(t, cap);
          const command = (tool: string, args: string[]) => t.command(cap, tool, args);
          if (op === "desktops") {
            // EWMH desktops span the X screen; wmctrl reports their geometry.
            return (await command("wmctrl", ["-d"]))
              .trim()
              .split("\n")
              .filter(Boolean)
              .map((line) => {
                const m = line.match(/^(\d+)\s+([*-])\s+DG:\s+(\d+)x(\d+)/);
                if (!m) throw new Error("Invalid wmctrl desktop output");
                return {
                  id: m[1]!,
                  screenId: t.env.DISPLAY!,
                  active: m[2] === "*",
                  type: "User",
                  size: { width: Number(m[3]), height: Number(m[4]) },
                };
              });
          }
          if (op === "setBounds") {
            validateBounds(p);
            const id = string(p.id);
            if (!/^(?:0x[\da-f]+|\d+)$/i.test(id)) throw new Error("Invalid window id");
            if (p.desktopId !== undefined && !/^\d+$/.test(string(p.desktopId)))
              throw new Error("Invalid desktop id");
            const base = ["-i", "-r", id];
            if (p.bounds === "fullscreen")
              await command("wmctrl", [...base, "-b", "add,fullscreen"]);
            else {
              const b = params(p.bounds!),
                pos = b.position === undefined ? {} : params(b.position),
                size = b.size === undefined ? {} : params(b.size);
              await command("wmctrl", [
                ...base,
                "-b",
                "remove,fullscreen,maximized_vert,maximized_horz",
              ]);
              await command("wmctrl", [
                ...base,
                "-e",
                [0, pos.x ?? -1, pos.y ?? -1, size.width ?? -1, size.height ?? -1].join(","),
              ]);
              if (p.desktopId !== undefined)
                await command("wmctrl", [...base, "-t", string(p.desktopId)]);
            }
            return null;
          }
          const activeId = (await command("xdotool", ["getactivewindow"])).trim();
          if (!/^\d+$/.test(activeId)) throw new Error("No active window");
          const current = (await command("xdotool", ["get_desktop"])).trim();
          const windows = [];
          for (const line of (await command("wmctrl", ["-lG"]))
            .trim()
            .split("\n")
            .filter(Boolean)) {
            const m = line.match(/^(0x[\da-f]+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(\d+)\s+(\d+)\s/i);
            if (!m) throw new Error("Invalid wmctrl window output");
            const [, id, desktop, x, y, width, height] = m;
            const active = BigInt(id!) === BigInt(activeId);
            if (op === "active" ? !active : desktop !== current && desktop !== "-1") continue;
            const props = await command("xprop", [
              "-id",
              id!,
              "_NET_WM_ALLOWED_ACTIONS",
              "_NET_WM_STATE",
            ]);
            windows.push({
              id: id!,
              desktopId: desktop === "-1" ? current : desktop!,
              active,
              fullScreenSettable: props.includes("_NET_WM_ACTION_FULLSCREEN"),
              resizable: props.includes("_NET_WM_ACTION_RESIZE"),
              positionable: props.includes("_NET_WM_ACTION_MOVE"),
              bounds: props.includes("_NET_WM_STATE_FULLSCREEN")
                ? "fullscreen"
                : {
                    position: { x: Number(x), y: Number(y) },
                    size: { width: Number(width), height: Number(height) },
                  },
            });
          }
          if (op === "list") return windows;
          if (!windows[0]) throw new Error("No active window");
          return windows[0];
        },
      ];
    }),
  );
}
function validateBounds(p: Record<string, JsonValue>) {
  string(p.id);
  if (p.bounds === "fullscreen") {
    if (p.desktopId !== undefined) throw new Error("Fullscreen cannot target a desktop");
    return;
  }
  const bounds = params(p.bounds!);
  for (const key of ["position", "size"]) {
    if (bounds[key] === undefined) continue;
    for (const [field, value] of Object.entries(params(bounds[key]!))) {
      if (
        !(key === "position" ? ["x", "y"] : ["width", "height"]).includes(field) ||
        typeof value !== "number" ||
        !Number.isInteger(value) ||
        (key === "size" && value <= 0)
      )
        throw new Error("Invalid window bounds");
    }
  }
}
