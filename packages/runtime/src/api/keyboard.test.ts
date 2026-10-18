import { expect, test } from "bun:test";
import { createElement as h } from "react";
import { createSceneRoot, type SceneSnapshot } from "../reconciler/index.ts";
import { Action, Keyboard } from "./index.ts";
import type { Shortcut } from "./index.ts";
import { KEY_EQUIVALENTS, KEY_MODIFIERS } from "./keyboard.ts";

// @covers Keyboard
// @covers Keyboard.Shortcut
// @covers Keyboard.Shortcut.Common
// @covers Keyboard.Shortcut.Common.Copy
// @covers Keyboard.Shortcut.Common.CopyDeeplink
// @covers Keyboard.Shortcut.Common.CopyName
// @covers Keyboard.Shortcut.Common.CopyPath
// @covers Keyboard.Shortcut.Common.Save
// @covers Keyboard.Shortcut.Common.Duplicate
// @covers Keyboard.Shortcut.Common.Edit
// @covers Keyboard.Shortcut.Common.MoveDown
// @covers Keyboard.Shortcut.Common.MoveUp
// @covers Keyboard.Shortcut.Common.New
// @covers Keyboard.Shortcut.Common.Open
// @covers Keyboard.Shortcut.Common.OpenWith
// @covers Keyboard.Shortcut.Common.Pin
// @covers Keyboard.Shortcut.Common.Refresh
// @covers Keyboard.Shortcut.Common.Remove
// @covers Keyboard.Shortcut.Common.RemoveAll
// @covers Keyboard.Shortcut.Common.ToggleQuickLook
// @covers Keyboard.KeyModifier
// @covers Keyboard.KeyEquivalent
test("common shortcuts preserve the documented mappings on both platforms in scenes", () => {
  // Expected mappings transcribed from the table cited in keyboard.ts.
  const expected = [
    ["Copy", "cmd shift c", "ctrl shift c"],
    ["CopyDeeplink", "cmd shift c", "ctrl shift c"],
    ["CopyName", "cmd opt c", "ctrl alt c"],
    ["CopyPath", "cmd ctrl c", "alt shift c"],
    ["Save", "cmd s", "ctrl s"],
    ["Duplicate", "cmd d", "ctrl shift s"],
    ["Edit", "cmd e", "ctrl e"],
    ["MoveDown", "cmd opt arrowDown", "ctrl alt arrowDown"],
    ["MoveUp", "cmd opt arrowUp", "ctrl alt arrowUp"],
    ["New", "cmd n", "ctrl n"],
    ["Open", "cmd o", "ctrl o"],
    ["OpenWith", "cmd shift o", "ctrl shift o"],
    ["Pin", "cmd .", "ctrl ."],
    ["Refresh", "cmd r", "ctrl r"],
    ["Remove", "ctrl x", "ctrl d"],
    ["RemoveAll", "ctrl shift x", "ctrl alt d"],
    ["ToggleQuickLook", "cmd y", "ctrl y"],
  ] as const;
  expect(Object.keys(Keyboard.Shortcut.Common)).toEqual(expected.map(([name]) => name));
  let scene: SceneSnapshot;
  const root = createSceneRoot({
    publish: (next) => {
      scene = next;
    },
  });
  for (const [name, macOS, Windows] of expected) {
    const shortcut = Keyboard.Shortcut.Common[name];
    for (const [platform, keys] of [
      ["macOS", macOS],
      ["Windows", Windows],
    ] as const) {
      const parts = keys.split(" ");
      const key = parts.pop()!;
      // Every value is one the declared unions allow.
      expect(KEY_EQUIVALENTS as readonly string[]).toContain(key);
      expect(parts.every((part) => (KEY_MODIFIERS as readonly string[]).includes(part))).toBe(true);
      expect(shortcut[platform] as unknown).toEqual({ modifiers: parts, key });
    }
    root.render(h(Action, { title: name, shortcut }));
    expect(scene!.root!.props.shortcut).toEqual(shortcut);
  }
  root.unmount();
});

// @covers Keyboard.Shortcut.modifiers
// @covers Keyboard.Shortcut.key
// @covers Keyboard.Shortcut.macOS
// @covers Keyboard.Shortcut.macOS.modifiers
// @covers Keyboard.Shortcut.macOS.key
// @covers Keyboard.Shortcut.Windows
// @covers Keyboard.Shortcut.Windows.modifiers
// @covers Keyboard.Shortcut.Windows.key
test("shortcut shapes reach the scene as authored, with nothing invented", () => {
  const one = { modifiers: ["cmd"], key: "g" } satisfies Shortcut;
  const perPlatform = {
    macOS: { modifiers: ["cmd", "shift"], key: "k" },
    Windows: { modifiers: ["ctrl", "shift"], key: "k" },
  } satisfies Shortcut;
  // `windows` is the deprecated lowercase alias; it passes through too.
  const withLegacyWindows = {
    macOS: { modifiers: ["opt"], key: "w" },
    Windows: { modifiers: ["alt"], key: "w" },
    windows: { modifiers: ["alt"], key: "w" },
  } satisfies Shortcut;
  let scene: SceneSnapshot;
  const root = createSceneRoot({ publish: (next) => (scene = next) });
  for (const shortcut of [one, perPlatform, withLegacyWindows]) {
    root.render(h(Action, { title: "Shortcut", shortcut }));
    expect(scene!.root!.props.shortcut).toEqual(shortcut);
  }
  root.unmount();
});
