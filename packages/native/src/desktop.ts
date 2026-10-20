import type { JsonValue } from "@blastlauncher/protocol";
import type { CapabilityHandler } from "./index.ts";
import { applicationHandlers } from "./applications.ts";
import { selectionHandlers } from "./selection.ts";
import { windowHandlers } from "./windows.ts";

export type DesktopTools = {
  platform: NodeJS.Platform;
  env: Record<string, string | undefined>;
  command(cap: string, tool: string, args: string[], input?: string): Promise<string>;
  ps(cap: string, script: string, input?: JsonValue): Promise<string>;
  jxa(cap: string, script: string, args?: string[]): Promise<string>;
};
export function unsupported(t: DesktopTools, cap: string, reason: string): never {
  const session = t.platform === "linux" && t.env.WAYLAND_DISPLAY ? "/Wayland" : "";
  throw new Error(`${cap} is not supported on ${t.platform}${session}: ${reason}`);
}
export function params(value: JsonValue): Record<string, JsonValue> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected capability params object");
  return value;
}
export function string(value: JsonValue | undefined): string {
  if (typeof value !== "string" || !value || value.includes("\0"))
    throw new Error("Expected non-empty string without NUL");
  return value;
}
export function x11(t: DesktopTools, cap: string) {
  if (t.env.WAYLAND_DISPLAY) unsupported(t, cap, "not available on Wayland");
  if (!t.env.DISPLAY) unsupported(t, cap, "an X11 display is required");
}
export function desktopHandlers(t: DesktopTools): Record<string, CapabilityHandler> {
  return { ...applicationHandlers(t), ...selectionHandlers(t), ...windowHandlers(t) };
}
