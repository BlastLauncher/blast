// `WindowManagement` from the declarations. Every call is a capability: listing
// desktops and windows reads state a desktop client owns, and moving a window
// changes the machine. Nothing is granted by default; a headless run answers
// the read-only calls neutrally (see packages/host/src/headless.ts).
import type { JsonValue } from "../reconciler/index.ts";
import { WindowManagement as WindowManagementEnums } from "./enums.generated.ts";
import { requestCapability } from "./capability.ts";
import type { Application } from "./open.ts";
import { toApplication } from "./applications.ts";

/** `WindowManagement.DesktopType`, the enum generated from the declarations. */
export const DesktopType = WindowManagementEnums.DesktopType;

/** `WindowManagement.Desktop.type` as a value union. */
export type DesktopTypeValue = (typeof DesktopType)[keyof typeof DesktopType];

/** `WindowManagement.Desktop`: a virtual desktop on a screen. */
export interface Desktop {
  /** The size of the desktop. */
  size: { width: number; height: number };
  /** The unique identifier of the desktop. */
  id: string;
  /** The identifier of the screen the desktop is on. */
  screenId: string;
  /** Whether the desktop is the active one. */
  active: boolean;
  /** The kind of desktop. */
  type: DesktopTypeValue;
}

/** The position and size of a window, as the declarations allow them partially. */
export interface WindowBounds {
  position?: { x?: number; y?: number };
  size?: { width?: number; height?: number };
}

/** `WindowManagement.Window`: a window of an application on a desktop. */
export interface Window {
  /** The unique identifier of the window. */
  id: string;
  /** The application that owns the window, when the client can name it. */
  application?: Application;
  /** The bounds of the window, or `"fullscreen"`. */
  bounds:
    | { position: { x: number; y: number }; size: { width: number; height: number } }
    | "fullscreen";
  /** The desktop the window is on. */
  desktopId: string;
  /** Whether the window can be made fullscreen. */
  fullScreenSettable: boolean;
  /** Whether the window can be resized. */
  resizable: boolean;
  /** Whether the window can be moved. */
  positionable: boolean;
  /** Whether the window is the active one. */
  active: boolean;
}

/** `WindowManagement.setWindowBounds` options, exactly as the declarations union them. */
export type SetWindowBoundsOptions = { id: string } & (
  | { bounds: WindowBounds; desktopId?: string }
  | { bounds: "fullscreen" }
);

function numberField(value: JsonValue | undefined, at: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${at} must be a finite number`);
  }
  return value;
}

function boundsWire(bounds: WindowBounds, at: string): Record<string, JsonValue> {
  if (typeof bounds !== "object" || bounds === null || Array.isArray(bounds)) {
    throw new TypeError(`${at}: bounds must be an object or "fullscreen"`);
  }
  const wire: Record<string, JsonValue> = {};
  if (bounds.position !== undefined) {
    const position: Record<string, JsonValue> = {};
    const x = numberField(bounds.position.x, `${at}: bounds.position.x`);
    const y = numberField(bounds.position.y, `${at}: bounds.position.y`);
    if (x !== undefined) position["x"] = x;
    if (y !== undefined) position["y"] = y;
    wire["position"] = position;
  }
  if (bounds.size !== undefined) {
    const size: Record<string, JsonValue> = {};
    const width = numberField(bounds.size.width, `${at}: bounds.size.width`);
    const height = numberField(bounds.size.height, `${at}: bounds.size.height`);
    if (width !== undefined) size["width"] = width;
    if (height !== undefined) size["height"] = height;
    wire["size"] = size;
  }
  return wire;
}

// The host is another process: rebuild each value from the declared fields
// rather than trusting whatever shape arrived on the wire.
function toBounds(value: JsonValue | undefined, at: string): Window["bounds"] {
  if (value === "fullscreen") return value;
  const bounds = boundsWire(value as WindowBounds, at);
  const { position, size } = bounds as WindowBounds;
  if (
    position?.x === undefined ||
    position.y === undefined ||
    size?.width === undefined ||
    size.height === undefined
  ) {
    throw new TypeError(`${at}: the host returned incomplete Window bounds`);
  }
  return {
    position: { x: position.x, y: position.y },
    size: { width: size.width, height: size.height },
  };
}

function toWindow(value: JsonValue, api: string): Window {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    typeof value.id !== "string" ||
    typeof value.desktopId !== "string" ||
    typeof value.fullScreenSettable !== "boolean" ||
    typeof value.resizable !== "boolean" ||
    typeof value.positionable !== "boolean" ||
    typeof value.active !== "boolean"
  ) {
    throw new TypeError(`${api}: the host returned an invalid Window`);
  }
  const window: Window = {
    id: value.id,
    bounds: toBounds(value.bounds, `${api}: bounds`),
    desktopId: value.desktopId,
    fullScreenSettable: value.fullScreenSettable,
    resizable: value.resizable,
    positionable: value.positionable,
    active: value.active,
  };
  if (value.application !== undefined) {
    window.application = toApplication(value.application, `${api}: application`);
  }
  return window;
}

function toDesktop(value: JsonValue, api: string): Desktop {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    typeof value.id !== "string" ||
    typeof value.screenId !== "string" ||
    typeof value.active !== "boolean" ||
    (value.type !== DesktopType.User && value.type !== DesktopType.FullScreen)
  ) {
    throw new TypeError(`${api}: the host returned an invalid Desktop`);
  }
  const size = value.size;
  if (
    typeof size !== "object" ||
    size === null ||
    Array.isArray(size) ||
    typeof size.width !== "number" ||
    typeof size.height !== "number" ||
    !Number.isFinite(size.width) ||
    !Number.isFinite(size.height)
  ) {
    throw new TypeError(`${api}: the host returned an invalid Desktop size`);
  }
  return {
    size: { width: size.width, height: size.height },
    id: value.id,
    screenId: value.screenId,
    active: value.active,
    type: value.type,
  };
}

function windows(value: JsonValue, api: string): Window[] {
  if (!Array.isArray(value)) throw new TypeError(`${api}: the host returned a non-array`);
  return value.map((item) => toWindow(item, api));
}

/** Gets the desktops across all screens. */
export async function getDesktops(): Promise<Desktop[]> {
  const value = await requestCapability("window.desktops", {});
  if (!Array.isArray(value)) throw new TypeError("getDesktops: the host returned a non-array");
  return value.map((item) => toDesktop(item, "getDesktops"));
}

/**
 * Gets the active window. Rejects when no window is active, as the
 * declarations promise.
 */
export async function getActiveWindow(): Promise<Window> {
  return toWindow(await requestCapability("window.active", {}), "getActiveWindow");
}

/** Gets the windows on the active desktop. */
export async function getWindowsOnActiveDesktop(): Promise<Window[]> {
  return windows(await requestCapability("window.list", {}), "getWindowsOnActiveDesktop");
}

/**
 * Moves a window, or makes it fullscreen. The request reaches the host only
 * through the capability, never the scene.
 */
export async function setWindowBounds(options: SetWindowBoundsOptions): Promise<void> {
  if (typeof options.id !== "string" || options.id === "") {
    throw new TypeError("setWindowBounds: id must be a non-empty string");
  }
  const params: Record<string, JsonValue> = { id: options.id };
  if (options.bounds === "fullscreen") params["bounds"] = "fullscreen";
  else params["bounds"] = boundsWire(options.bounds, "setWindowBounds");
  const desktopId = "desktopId" in options ? options.desktopId : undefined;
  if (desktopId !== undefined) {
    if (typeof desktopId !== "string")
      throw new TypeError("setWindowBounds: desktopId must be a string");
    params["desktopId"] = desktopId;
  }
  await requestCapability("window.setBounds", params);
}

/** Members in the order the declarations list them. */
export const WindowManagement = {
  DesktopType,
  getDesktops,
  getActiveWindow,
  getWindowsOnActiveDesktop,
  setWindowBounds,
};
