import { afterEach, expect, test } from "bun:test";
import type { JsonValue } from "../reconciler/index.ts";
import { setCapabilityRequester } from "./capability.ts";
import { DesktopType, WindowManagement, type SetWindowBoundsOptions } from "./index.ts";

afterEach(() => setCapabilityRequester(undefined));

const desktop = {
  id: "desktop-1",
  screenId: "screen-1",
  active: true,
  type: "User",
  size: { width: 1920, height: 1080 },
};

const window = {
  id: "window-1",
  application: { name: "Safari", path: "/Applications/Safari.app", bundleId: "com.apple.Safari" },
  bounds: { position: { x: 0, y: 24 }, size: { width: 1440, height: 900 } },
  desktopId: "desktop-1",
  fullScreenSettable: true,
  resizable: true,
  positionable: true,
  active: true,
};

/** Records every request and answers each one with the next queued value. */
function recorder(answers: JsonValue[]): Array<{ name: string; params: JsonValue }> {
  const requests: Array<{ name: string; params: JsonValue }> = [];
  setCapabilityRequester(async (name, params) => {
    requests.push({ name, params });
    return answers[requests.length - 1] ?? null;
  });
  return requests;
}

// @covers WindowManagement
// @covers WindowManagement.DesktopType
// @covers WindowManagement.DesktopType.FullScreen
// @covers WindowManagement.DesktopType.User
// @covers WindowManagement.Desktop
// @covers WindowManagement.Desktop.active
// @covers WindowManagement.Desktop.id
// @covers WindowManagement.Desktop.screenId
// @covers WindowManagement.Desktop.size
// @covers WindowManagement.Desktop.size.height
// @covers WindowManagement.Desktop.size.width
// @covers WindowManagement.Desktop.type
// @covers WindowManagement.getDesktops
test("getDesktops asks window.desktops and keeps the declared Desktop fields", async () => {
  const requests = recorder([[{ ...desktop, extra: true }, { ...desktop, id: "desktop-2" }]]);
  expect(WindowManagement).toBeDefined();
  expect(WindowManagement.DesktopType).toBe(DesktopType);
  expect(Object.values(DesktopType)).toEqual(["User", "FullScreen"]);
  expect(await WindowManagement.getDesktops()).toEqual([desktop, { ...desktop, id: "desktop-2" }]);
  expect(requests).toEqual([{ name: "window.desktops", params: {} }]);
});

// @covers WindowManagement.getActiveWindow
// @covers WindowManagement.Window
// @covers WindowManagement.Window.active
// @covers WindowManagement.Window.application
// @covers WindowManagement.Window.bounds
// @covers WindowManagement.Window.bounds.position
// @covers WindowManagement.Window.bounds.position.x
// @covers WindowManagement.Window.bounds.position.y
// @covers WindowManagement.Window.bounds.size
// @covers WindowManagement.Window.bounds.size.height
// @covers WindowManagement.Window.bounds.size.width
// @covers WindowManagement.Window.desktopId
// @covers WindowManagement.Window.fullScreenSettable
// @covers WindowManagement.Window.id
// @covers WindowManagement.Window.positionable
// @covers WindowManagement.Window.resizable
// @covers WindowManagement.getWindowsOnActiveDesktop
test("window reads carry the declared Window fields and a fullscreen bound stays a string", async () => {
  const fullscreen = { ...window, id: "window-2", bounds: "fullscreen" };
  const requests = recorder([window, [fullscreen], []]);
  expect(await WindowManagement.getActiveWindow()).toEqual(window);
  expect(await WindowManagement.getWindowsOnActiveDesktop()).toEqual([fullscreen]);
  expect(await WindowManagement.getWindowsOnActiveDesktop()).toEqual([]);
  expect(requests).toEqual([
    { name: "window.active", params: {} },
    { name: "window.list", params: {} },
    { name: "window.list", params: {} },
  ]);
});

// @covers WindowManagement.setWindowBounds
test("setWindowBounds sends partial bounds, a desktop and fullscreen requests", async () => {
  const requests = recorder([]);
  await WindowManagement.setWindowBounds({ id: "window-1", bounds: { position: { x: 100 } } });
  await WindowManagement.setWindowBounds({
    id: "window-1",
    bounds: { size: { height: 800 } },
    desktopId: "desktop-2",
  });
  await WindowManagement.setWindowBounds({ id: "window-1", bounds: "fullscreen" });
  expect(requests).toEqual([
    {
      name: "window.setBounds",
      params: { id: "window-1", bounds: { position: { x: 100 } } },
    },
    {
      name: "window.setBounds",
      params: { id: "window-1", bounds: { size: { height: 800 } }, desktopId: "desktop-2" },
    },
    { name: "window.setBounds", params: { id: "window-1", bounds: "fullscreen" } },
  ]);
});

// @covers WindowManagement.setWindowBounds
test("setWindowBounds rejects malformed options before anything crosses the wire", async () => {
  const requests = recorder([]);
  const invalid: Array<[unknown, string]> = [
    [{ id: "", bounds: {} }, "id must be a non-empty string"],
    [{ id: "w", bounds: { position: { x: "left" } } }, "bounds.position.x must be a finite number"],
    [{ id: "w", bounds: { size: { width: Number.NaN } } }, "bounds.size.width must be a finite number"],
    [{ id: "w", bounds: 5 }, "bounds must be an object"],
    [{ id: "w", bounds: {}, desktopId: 7 }, "desktopId must be a string"],
  ];
  for (const [options, message] of invalid) {
    await expect(
      WindowManagement.setWindowBounds(options as SetWindowBoundsOptions),
    ).rejects.toThrow(message);
  }
  expect(requests).toEqual([]);
});

// @covers WindowManagement.getDesktops
// @covers WindowManagement.getActiveWindow
// @covers WindowManagement.getWindowsOnActiveDesktop
// @covers WindowManagement.setWindowBounds
test("window capabilities reject a denial and a malformed host answer", async () => {
  setCapabilityRequester(() => Promise.reject(new Error("Capability denied: window.desktops")));
  await expect(WindowManagement.getDesktops()).rejects.toThrow(
    "Capability denied: window.desktops",
  );
  await expect(WindowManagement.getActiveWindow()).rejects.toThrow("Capability denied");
  await expect(WindowManagement.getWindowsOnActiveDesktop()).rejects.toThrow(
    "Capability denied",
  );
  await expect(WindowManagement.setWindowBounds({ id: "w", bounds: {} })).rejects.toThrow(
    "Capability denied",
  );

  recorder([{}, [{ id: 4 }], "not a window", [{ ...desktop, type: "Unknown" }]]);
  await expect(WindowManagement.getDesktops()).rejects.toThrow("invalid Desktop");
  await expect(WindowManagement.getWindowsOnActiveDesktop()).rejects.toThrow("invalid Window");
  await expect(WindowManagement.getActiveWindow()).rejects.toThrow("invalid Window");
  await expect(WindowManagement.getDesktops()).rejects.toThrow("invalid Desktop");
});
