import type { JsonValue } from "@blastlauncher/protocol";
import { params, string, type DesktopTools } from "./desktop.ts";

// yabai supplies actual Space/display identities that System Events lacks.
// No daemon is installed or configured by Blast.
export async function macWindows(
  t: DesktopTools,
  cap: string,
  op: string,
  p: Record<string, JsonValue>,
): Promise<JsonValue> {
  const send = (args: string[]) => t.command(cap, "yabai", ["-m", ...args]);
  const query = async (args: string[]) => JSON.parse(await send(["query", ...args]));
  if (op === "desktops") {
    const spaces: Array<Record<string, JsonValue>> = await query(["--spaces"]);
    const displays: Array<{ index: number; uuid: string; frame: { w: number; h: number } }> =
      await query(["--displays"]);
    return spaces.map((s) => {
      const display = displays.find((d) => d.index === s.display);
      if (!display) throw new Error("Space display is unavailable");
      return {
        id: String(s.index),
        screenId: display.uuid,
        active: !!s["is-visible"],
        type: s["is-native-fullscreen"] ? "FullScreen" : "User",
        size: { width: display.frame.w, height: display.frame.h },
      };
    });
  }
  if (op === "setBounds") {
    const id = string(p.id);
    if (!/^\d+$/.test(id)) throw new Error("Invalid window id");
    if (p.desktopId !== undefined && !/^\d+$/.test(string(p.desktopId)))
      throw new Error("Invalid desktop id");
    const w = await query(["--windows", "--window", id]);
    const fullscreen = !!w["is-native-fullscreen"];
    if (p.bounds === "fullscreen") {
      if (!fullscreen) await send(["window", id, "--toggle", "native-fullscreen"]);
    } else {
      // Exiting native fullscreen is asynchronous. Do not race a move against
      // the Space transition or change unrelated window state silently.
      if (fullscreen) throw new Error("Exit native fullscreen before setting numeric bounds");
      const b = params(p.bounds!),
        pos = b.position === undefined ? {} : params(b.position),
        size = b.size === undefined ? {} : params(b.size);
      if (b.position !== undefined)
        await send(["window", id, "--move", `abs:${pos.x ?? w.frame.x}:${pos.y ?? w.frame.y}`]);
      if (b.size !== undefined)
        await send([
          "window",
          id,
          "--resize",
          `abs:${size.width ?? w.frame.w}:${size.height ?? w.frame.h}`,
        ]);
      if (p.desktopId !== undefined) await send(["window", id, "--space", string(p.desktopId)]);
    }
    return null;
  }
  const data = await query(op === "active" ? ["--windows", "--window"] : ["--windows", "--space"]);

  return op === "active" ? convert(data) : data.map(convert);
}

function convert(w: Record<string, JsonValue>) {
  const f = params(w.frame!);
  return {
    id: String(w.id),
    desktopId: String(w.space),
    active: !!w["has-focus"],
    fullScreenSettable: !!w["can-resize"],
    resizable: !!w["can-resize"],
    positionable: !!w["can-move"],
    bounds: w["is-native-fullscreen"]
      ? "fullscreen"
      : { position: { x: f.x!, y: f.y! }, size: { width: f.w!, height: f.h! } },
  };
}
