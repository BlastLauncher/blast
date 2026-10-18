import { expect, test } from "bun:test";
import { environment, setEnvironment } from "./environment.ts";
import { getPreferenceValues, setPreferenceValues } from "./preferences.ts";

// @covers environment partial
// @covers environment.raycastVersion
// @covers environment.extensionName
// @covers environment.commandName
// @covers environment.assetsPath
// @covers environment.supportPath
// @covers environment.isDevelopment

test("environment mirrors init and leaves the members Blast does not set undefined", () => {
  setEnvironment({
    extensionName: "Clipboard History",
    commandName: "history",
    assetsPath: "/ext/assets",
    supportPath: "/ext/support",
    isDevelopment: false,
  });
  expect(environment).toEqual({
    raycastVersion: "0.0.0-blast",
    extensionName: "Clipboard History",
    commandName: "history",
    assetsPath: "/ext/assets",
    supportPath: "/ext/support",
    isDevelopment: false,
  });
  // Only the members above are set, so the rest of Raycast's `Environment`
  // reads as `undefined` and stays `missing` in the coverage report.
  expect(Object.keys(environment).toSorted()).toEqual([
    "assetsPath",
    "commandName",
    "extensionName",
    "isDevelopment",
    "raycastVersion",
    "supportPath",
  ]);
  expect((environment as { appearance?: unknown }).appearance).toBeUndefined();
});

// @covers getPreferenceValues partial
test("getPreferenceValues returns a fresh copy of the init preferences", () => {
  setPreferenceValues({ maxItems: 20, pinned: true });
  const first = getPreferenceValues();
  expect(first).toEqual({ maxItems: 20, pinned: true });
  first["maxItems"] = 5;
  expect(getPreferenceValues()).toEqual({ maxItems: 20, pinned: true });
  // The generic names an extension's own preference type, as the Raycast API does.
  expect(getPreferenceValues<{ maxItems: number }>().maxItems).toBe(20);
});
