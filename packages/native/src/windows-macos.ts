import type { JsonValue } from "@blastlauncher/protocol";
import { params, string, type DesktopTools } from "./desktop.ts";

/** The one script used when yabai is unavailable. Inputs are op and JSON params argv. */
export const macWindowsFallback = String.raw`
ObjC.import('AppKit');
ObjC.import('CoreGraphics');
const args = $args;
const op = args[0];
const input = JSON.parse(args[1] || '{}');
const cg = ObjC.unwrap($.CGWindowListCopyWindowInfo($.kCGWindowListOptionOnScreenOnly, $.kCGNullWindowID));
const number = (value) => Number(ObjC.unwrap(value));
const rect = (value) => {
  const r = ObjC.unwrap(value);
  return { position: { x: r.X, y: r.Y }, size: { width: r.Width, height: r.Height } };
};
const screens = $.NSScreen.screens;
const screenInfo = [];
for (let i = 0; i < screens.count; i++) {
  const screen = screens.objectAtIndex(i);
  const description = screen.deviceDescription;
  const display = number(description.objectForKey('NSScreenNumber'));
  const uuid = ObjC.unwrap($.CGDisplayCreateUUIDFromDisplayID(display).UUIDString);
  const frame = ObjC.unwrap(screen.frame);
  screenInfo.push({ id: 'screen:' + uuid, screenId: uuid, display, frame });
}
const screenFor = (bounds) => {
  const center = { x: bounds.X + bounds.Width / 2, y: bounds.Y + bounds.Height / 2 };
  return screenInfo.find((s) => {
    const f = s.frame;
    return center.x >= f.X && center.x <= f.X + f.Width && center.y >= f.Y && center.y <= f.Y + f.Height;
  }) || screenInfo[0];
};
const axWindows = (pid) => {
  const app = Application('System Events').applicationProcesses.byId(pid);
  try { return app.windows(); } catch (_) { return []; }
};
const windows = cg.filter((w) => number(w.kCGWindowLayer) === 0 && !!ObjC.unwrap(w.kCGWindowIsOnscreen));
const convert = (w, active) => {
  const bounds = ObjC.unwrap(w.kCGWindowBounds);
  const screen = screenFor(bounds);
  let positionable = false, resizable = false, fullScreenSettable = false;
  try {
    const candidates = axWindows(number(w.kCGWindowOwnerPID));
    const match = candidates.find((window) => {
      const p = window.position(), s = window.size();
      return Math.abs(p.x - bounds.X) < 2 && Math.abs(p.y - bounds.Y) < 2 && Math.abs(s.width - bounds.Width) < 2 && Math.abs(s.height - bounds.Height) < 2;
    });
    if (match) {
      positionable = match.attributes.byName('AXPosition').value() !== undefined;
      resizable = match.attributes.byName('AXSize').value() !== undefined;
      fullScreenSettable = match.actions().some((action) => action.name() === 'AXPress') && match.attributes.byName('AXFullScreen').value() !== undefined;
    }
  } catch (_) {}
  return { id: String(number(w.kCGWindowNumber)), desktopId: screen.id, active, fullScreenSettable, resizable, positionable, bounds: rect(w.kCGWindowBounds) };
};
const front = windows[0];
if (op === 'desktops') {
  const frontScreen = front ? screenFor(ObjC.unwrap(front.kCGWindowBounds)) : undefined;
  console.log(JSON.stringify(screenInfo.map((s) => ({ id: s.id, screenId: s.screenId, active: s === frontScreen, type: 'User', size: { width: s.frame.Width, height: s.frame.Height } }))));
} else if (op === 'list' || op === 'active') {
  const result = windows.map((w, i) => convert(w, i === 0));
  console.log(JSON.stringify(op === 'active' ? (result[0] || (() => { throw new Error('No active window'); })()) : result));
} else if (op === 'setBounds') {
  const id = String(input.id);
  const target = windows.find((w) => String(number(w.kCGWindowNumber)) === id);
  if (!target) throw new Error('Window not found');
  const current = convert(target, false);
  if (input.desktopId !== undefined && input.desktopId !== current.desktopId) throw new Error('Window cannot move to a different desktop without yabai');
  const app = Application('System Events').applicationProcesses.byId(number(target.kCGWindowOwnerPID));
  const candidates = axWindows(number(target.kCGWindowOwnerPID));
  const frame = ObjC.unwrap(target.kCGWindowBounds);
  const match = candidates.find((window) => {
    const p = window.position(), s = window.size();
    return Math.abs(p.x - frame.X) < 2 && Math.abs(p.y - frame.Y) < 2 && Math.abs(s.width - frame.Width) < 2 && Math.abs(s.height - frame.Height) < 2;
  });
  if (!match) throw new Error('Accessibility permission is required to identify this window');
  if (input.bounds === 'fullscreen') {
    try { match.attributes.byName('AXFullScreen').setValue(true); } catch (_) { throw new Error('Accessibility permission is required to set fullscreen'); }
  } else {
    const b = input.bounds || {}, p = b.position || {}, s = b.size || {};
    try {
      if (p.x !== undefined || p.y !== undefined) match.position = [p.x ?? frame.X, p.y ?? frame.Y];
      if (s.width !== undefined || s.height !== undefined) match.size = [s.width ?? frame.Width, s.height ?? frame.Height];
    } catch (_) { throw new Error('Accessibility permission is required to set window bounds'); }
  }
  console.log('null');
}`;

export async function macWindows(
  t: DesktopTools,
  cap: string,
  op: string,
  p: Record<string, JsonValue>,
): Promise<JsonValue> {
  // Display IDs are only produced by the fallback backend; do not ask yabai
  // to interpret one as a Mission Control Space index.
  if (op === "setBounds" && typeof p.desktopId === "string" && p.desktopId.startsWith("screen:"))
    return JSON.parse(await t.jxa(cap, macWindowsFallback, [op, JSON.stringify(p)])) as JsonValue;
  try {
    return await yabaiWindows(t, cap, op, p);
  } catch (error) {
    if (!missingExecutable(error)) throw error;
    return JSON.parse(await t.jxa(cap, macWindowsFallback, [op, JSON.stringify(p)])) as JsonValue;
  }
}

async function yabaiWindows(
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

function missingExecutable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: unknown; cause?: unknown };
  return value.code === "ENOENT" || missingExecutable(value.cause);
}
