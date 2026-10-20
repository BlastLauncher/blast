// @covers Keyboard.KeyModifier
// @covers Keyboard.KeyEquivalent
// @covers Keyboard.Shortcut
// @covers Keyboard.Shortcut.Common
import { expect, test } from "bun:test";
import { matchesShortcut, shortcutLabel, type KeyInput } from "./shortcut.ts";

const plain = (modifiers: string[], key = "k") => ({ modifiers, key });
const press = (name: string, modifiers: Omit<KeyInput, "name"> = {}): KeyInput => ({
  name,
  ...modifiers,
});

test("every modifier maps per platform", () => {
  // macOS: cmd=meta, opt/alt=option, windows=super.
  expect(matchesShortcut(plain(["cmd"]), press("k", { meta: true }), "macOS")).toBe(true);
  expect(matchesShortcut(plain(["cmd"]), press("k", { ctrl: true }), "macOS")).toBe(false);
  expect(matchesShortcut(plain(["ctrl"]), press("k", { ctrl: true }), "macOS")).toBe(true);
  expect(matchesShortcut(plain(["opt"]), press("k", { option: true }), "macOS")).toBe(true);
  expect(matchesShortcut(plain(["alt"]), press("k", { option: true }), "macOS")).toBe(true);
  expect(matchesShortcut(plain(["shift"]), press("k", { shift: true }), "macOS")).toBe(true);
  expect(matchesShortcut(plain(["windows"]), press("k", { super: true }), "macOS")).toBe(true);
  // Windows and Linux: cmd falls back to ctrl, alt/opt=option, windows=super.
  for (const platform of ["Windows", "Linux"] as const) {
    expect(matchesShortcut(plain(["cmd"]), press("k", { ctrl: true }), platform)).toBe(true);
    expect(matchesShortcut(plain(["cmd"]), press("k", { meta: true }), platform)).toBe(false);
    expect(matchesShortcut(plain(["ctrl"]), press("k", { ctrl: true }), platform)).toBe(true);
    expect(matchesShortcut(plain(["opt"]), press("k", { option: true }), platform)).toBe(true);
    expect(matchesShortcut(plain(["alt"]), press("k", { option: true }), platform)).toBe(true);
    expect(matchesShortcut(plain(["shift"]), press("k", { shift: true }), platform)).toBe(true);
    expect(matchesShortcut(plain(["windows"]), press("k", { super: true }), platform)).toBe(true);
  }
});

test("matching is exact: extra or missing modifiers and other keys do not match", () => {
  const value = plain(["cmd", "shift"], "k");
  const key = press("k", { meta: true, shift: true });
  expect(matchesShortcut(value, key, "macOS")).toBe(true);
  expect(matchesShortcut(value, press("k", { meta: true }), "macOS")).toBe(false);
  expect(matchesShortcut(value, { ...key, ctrl: true }, "macOS")).toBe(false);
  expect(matchesShortcut(value, { ...key, name: "j" }, "macOS")).toBe(false);
  expect(matchesShortcut(plain([]), press("k"))).toBe(true);
  expect(matchesShortcut(undefined, press("k"))).toBe(false);
  expect(matchesShortcut({ modifiers: ["hyper"], key: "k" }, press("k"))).toBe(false);
  expect(matchesShortcut({ modifiers: [], key: "notakey" }, press("notakey"))).toBe(false);
});

test("the { macOS, Windows } form picks the platform's variant; Linux uses Windows", () => {
  const value = {
    macOS: plain(["cmd", "opt"], "c"),
    Windows: plain(["ctrl", "alt"], "d"),
  };
  expect(matchesShortcut(value, press("c", { meta: true, option: true }), "macOS")).toBe(true);
  expect(matchesShortcut(value, press("d", { meta: true, option: true }), "macOS")).toBe(false);
  expect(matchesShortcut(value, press("d", { ctrl: true, option: true }), "Windows")).toBe(true);
  expect(matchesShortcut(value, press("d", { ctrl: true, option: true }), "Linux")).toBe(true);
  expect(matchesShortcut(value, press("c", { ctrl: true, option: true }), "Linux")).toBe(false);
  expect(shortcutLabel(value, "macOS")).toBe("⌥⌘C");
  expect(shortcutLabel(value, "Windows")).toBe("Ctrl+Alt+D");
  expect(shortcutLabel(value)).toBe("Ctrl+Alt+D");
  // The deprecated lowercase `windows` spelling still resolves.
  const legacy = { macOS: plain(["cmd"], "a"), windows: plain(["ctrl"], "b") };
  expect(shortcutLabel(legacy, "Windows")).toBe("Ctrl+B");
  expect(shortcutLabel({ macOS: plain(["cmd"], "a") }, "Linux")).toBe("");
  expect(shortcutLabel({ Windows: plain(["ctrl"], "a") }, "macOS")).toBe("");
});

test("Keyboard.Shortcut.Common values, as the runtime passes them, resolve per platform", () => {
  // Copy / Remove from packages/runtime/src/api/keyboard.ts.
  const copy = { macOS: plain(["cmd", "shift"], "c"), Windows: plain(["ctrl", "shift"], "c") };
  const remove = { macOS: plain(["ctrl"], "x"), Windows: plain(["ctrl"], "d") };
  expect(shortcutLabel(copy, "macOS")).toBe("⇧⌘C");
  expect(shortcutLabel(copy, "Linux")).toBe("Ctrl+Shift+C");
  expect(shortcutLabel(remove, "macOS")).toBe("⌃X");
  expect(shortcutLabel(remove, "Windows")).toBe("Ctrl+D");
  expect(matchesShortcut(remove, press("d", { ctrl: true }), "Linux")).toBe(true);
  expect(matchesShortcut(remove, press("x", { ctrl: true }), "Linux")).toBe(false);
});

test("labels use glyphs on macOS and words elsewhere, with every modifier in a stable order", () => {
  const all = plain(["shift", "cmd", "opt", "ctrl", "windows"], "k");
  expect(shortcutLabel(all, "macOS")).toBe("⌃⌥⇧⌘❖K");
  expect(shortcutLabel(plain(["cmd", "shift"], "k"), "macOS")).toBe("⇧⌘K");
  expect(shortcutLabel(plain(["cmd", "shift"], "k"), "Windows")).toBe("Ctrl+Shift+K");
  // cmd and ctrl collapse to one Ctrl off macOS.
  expect(shortcutLabel(plain(["cmd", "ctrl"], "k"), "Linux")).toBe("Ctrl+K");
  expect(shortcutLabel(plain(["windows", "alt"], "k"), "Linux")).toBe("Alt+Win+K");
});

test("special keys have names, glyphs and terminal key names", () => {
  const cases: [string, string, string, string][] = [
    ["enter", "return", "↵", "Enter"],
    ["return", "return", "↵", "Enter"],
    ["escape", "escape", "⎋", "Esc"],
    ["space", "space", "␣", "Space"],
    ["backspace", "backspace", "⌫", "Backspace"],
    ["delete", "backspace", "⌫", "Backspace"],
    ["deleteForward", "delete", "⌦", "Delete"],
    ["tab", "tab", "⇥", "Tab"],
    ["arrowUp", "up", "↑", "Up"],
    ["arrowDown", "down", "↓", "Down"],
    ["arrowLeft", "left", "←", "Left"],
    ["arrowRight", "right", "→", "Right"],
    ["pageUp", "pageup", "⇞", "PageUp"],
    ["pageDown", "pagedown", "⇟", "PageDown"],
    ["home", "home", "↖", "Home"],
    ["end", "end", "↘", "End"],
  ];
  for (const [key, name, glyph, word] of cases) {
    const value = plain([], key);
    expect(matchesShortcut(value, press(name))).toBe(true);
    expect(shortcutLabel(value, "macOS")).toBe(glyph);
    expect(shortcutLabel(value, "Linux")).toBe(word);
  }
  // Punctuation keys are their own name.
  expect(matchesShortcut(plain(["cmd"], "."), press(".", { meta: true }), "macOS")).toBe(true);
  expect(shortcutLabel(plain(["cmd"], "["), "macOS")).toBe("⌘[");
  // A client may report Enter as "enter".
  expect(matchesShortcut(plain([], "return"), press("enter"))).toBe(true);
});
