import { expect, test } from "bun:test";
import { environment, setEnvironment } from "./environment.ts";
import { AI, Clipboard, Icon } from "./index.ts";
import { getPreferenceValues, setPreferenceValues } from "./preferences.ts";

// @covers Environment
// @covers Environment.raycastVersion
// @covers Environment.ownerOrAuthorName
// @covers Environment.extensionName
// @covers Environment.entryPointType
// @covers Environment.entryPointName
// @covers Environment.entryPointMode
// @covers Environment.commandName
// @covers Environment.assetsPath
// @covers Environment.supportPath
// @covers Environment.isDevelopment
// @covers Environment.appearance
// @covers Environment.textSize
// @covers Environment.launchType
// @covers Environment.canAccess
// @covers Environment.theme
// @covers Environment.commandMode
// @covers Environment.launchContext
// @covers environment
// @covers environment.raycastVersion
// @covers environment.ownerOrAuthorName
// @covers environment.extensionName
// @covers environment.entryPointType
// @covers environment.entryPointName
// @covers environment.entryPointMode
// @covers environment.commandName
// @covers environment.assetsPath
// @covers environment.supportPath
// @covers environment.isDevelopment
// @covers environment.appearance
// @covers environment.textSize
// @covers environment.launchType
// @covers environment.canAccess
// @covers environment.theme
// @covers environment.commandMode
// @covers environment.launchContext
test("environment mirrors init, derives the entry point and answers canAccess", () => {
  const init = {
    extensionName: "Clipboard History",
    commandName: "history",
    ownerOrAuthorName: "Raycast",
    assetsPath: "/ext/assets",
    supportPath: "/ext/support",
    isDevelopment: false,
    appearance: "light",
    textSize: "large",
  } as const;
  setEnvironment(init, { name: "history", mode: "view" });
  expect(environment).toEqual({
    raycastVersion: "0.0.0-blast",
    ownerOrAuthorName: "Raycast",
    extensionName: "Clipboard History",
    entryPointType: "command",
    entryPointName: "history",
    entryPointMode: "view",
    assetsPath: "/ext/assets",
    supportPath: "/ext/support",
    isDevelopment: false,
    appearance: "light",
    textSize: "large",
    // Blast has no background launch yet, so every command is user initiated.
    launchType: "userInitiated",
    // The deprecated aliases keep the launched command's name and mode, and
    // `theme` mirrors the app appearance.
    commandName: "history",
    theme: "light",
    commandMode: "view",
    canAccess: expect.any(Function),
  });
  // The entry point follows the launched command's mode.
  setEnvironment(init, { name: "session", mode: "menu-bar" });
  expect(environment.entryPointName).toBe("session");
  expect(environment.entryPointMode).toBe("menu-bar");
  expect(environment.commandMode).toBe("menu-bar");
  // `theme` follows the appearance, not the mode.
  expect(environment.theme).toBe("light");
  expect(environment.launchContext).toBeUndefined();
});

// @covers Environment.launchContext
// @covers environment.launchContext
test("the deprecated environment launch context is the one this command was launched with", () => {
  const init = {
    extensionName: "Fixture",
    commandName: "command",
    ownerOrAuthorName: "Blast",
    assetsPath: "",
    supportPath: "",
    isDevelopment: true,
    appearance: "dark",
    textSize: "medium",
  } as const;
  setEnvironment(init, {
    name: "command",
    mode: "view",
    launchContext: { from: "launcher", nested: { deep: true } },
  });
  expect(environment.launchContext).toEqual({ from: "launcher", nested: { deep: true } });
  // A plain launch clears the previous command's context.
  setEnvironment(init, { name: "command", mode: "view" });
  expect(environment.launchContext).toBeUndefined();
});

// @covers Environment.canAccess
// @covers environment.canAccess
test("canAccess denies optional APIs without host availability and allows other implementations", () => {
  // No host availability list was supplied.
  expect(environment.canAccess(AI)).toBe(false);
  expect(environment.canAccess(Icon)).toBe(true);
  expect(environment.canAccess(Clipboard)).toBe(true);
  expect(environment.canAccess({ arbitrary: true })).toBe(true);
});

// @covers getPreferenceValues
// @covers PreferenceValues
test("getPreferenceValues returns a fresh copy of the init preferences", () => {
  setPreferenceValues({ maxItems: 20, pinned: true });
  const first = getPreferenceValues();
  expect(first).toEqual({ maxItems: 20, pinned: true });
  first["maxItems"] = 5;
  expect(getPreferenceValues()).toEqual({ maxItems: 20, pinned: true });
  // The generic names an extension's own preference type, as the Raycast API does.
  expect(getPreferenceValues<{ maxItems: number }>().maxItems).toBe(20);
});
