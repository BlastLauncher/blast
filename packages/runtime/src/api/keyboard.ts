import type { KeyShortcut } from "./types.ts";

function shortcut(key: string, macOS: string[], Windows: string[], windowsKey = key) {
  return { macOS: { modifiers: macOS, key }, Windows: { modifiers: Windows, key: windowsKey } };
}

// https://developers.raycast.com/api-reference/keyboard#keyboard.shortcut.common
// The declarations supply the names; the public docs supply both platform mappings.
export const Keyboard = {
  Shortcut: {
    Common: {
      Copy: shortcut("c", ["cmd", "shift"], ["ctrl", "shift"]),
      CopyDeeplink: shortcut("c", ["cmd", "shift"], ["ctrl", "shift"]),
      CopyName: shortcut("c", ["cmd", "opt"], ["ctrl", "alt"]),
      CopyPath: shortcut("c", ["cmd", "ctrl"], ["alt", "shift"]),
      Save: shortcut("s", ["cmd"], ["ctrl"]),
      Duplicate: shortcut("d", ["cmd"], ["ctrl", "shift"], "s"),
      Edit: shortcut("e", ["cmd"], ["ctrl"]),
      MoveDown: shortcut("arrowDown", ["cmd", "opt"], ["ctrl", "alt"]),
      MoveUp: shortcut("arrowUp", ["cmd", "opt"], ["ctrl", "alt"]),
      New: shortcut("n", ["cmd"], ["ctrl"]),
      Open: shortcut("o", ["cmd"], ["ctrl"]),
      OpenWith: shortcut("o", ["cmd", "shift"], ["ctrl", "shift"]),
      Pin: shortcut(".", ["cmd"], ["ctrl"]),
      Refresh: shortcut("r", ["cmd"], ["ctrl"]),
      Remove: shortcut("x", ["ctrl"], ["ctrl"], "d"),
      RemoveAll: shortcut("x", ["ctrl", "shift"], ["ctrl", "alt"], "d"),
      ToggleQuickLook: shortcut("y", ["cmd"], ["ctrl"]),
    } satisfies Record<string, { macOS: KeyShortcut; Windows: KeyShortcut }>,
  },
};
