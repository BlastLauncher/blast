import { expect, test } from "bun:test";
import { matchesShortcut, shortcutLabel } from "../../packages/client-core/src/shortcut.ts";
import {
  applyEarlyKey,
  applyEarlyPaste,
  isBrowserReserved,
  isReservedLabel,
  keyInputFromEvent,
  platformFromNavigator,
  shortcutAllowedInText,
} from "./keyboard.ts";

test("maps browser keys and modifiers to client-core shortcut names", () => {
  expect(keyInputFromEvent({ key: "c", metaKey: true, shiftKey: true })).toEqual({
    name: "c",
    meta: true,
    shift: true,
  });
  // KeyboardEvent.key is uppercase when Shift is held; shortcut.ts normalizes it to lowercase.
  expect(keyInputFromEvent({ key: "C", shiftKey: true })).toEqual({ name: "c", shift: true });
  expect(keyInputFromEvent({ key: "7", ctrlKey: true, altKey: true })).toEqual({
    name: "7",
    ctrl: true,
    option: true,
  });
  expect(keyInputFromEvent({ key: "Enter" })).toEqual({ name: "return" });
  expect(keyInputFromEvent({ key: "Tab" })).toEqual({ name: "tab" });
  expect(keyInputFromEvent({ key: "Backspace" })).toEqual({ name: "backspace" });
  expect(keyInputFromEvent({ key: "Delete" })).toEqual({ name: "delete" });
  expect(keyInputFromEvent({ key: "PageUp" })).toEqual({ name: "pageup" });
  expect(keyInputFromEvent({ key: "PageDown" })).toEqual({ name: "pagedown" });
  expect(keyInputFromEvent({ key: "Home" })).toEqual({ name: "home" });
  expect(keyInputFromEvent({ key: "End" })).toEqual({ name: "end" });
  expect(keyInputFromEvent({ key: "ArrowUp" })).toEqual({ name: "up" });
  expect(keyInputFromEvent({ key: "ArrowDown" })).toEqual({ name: "down" });
  expect(keyInputFromEvent({ key: "ArrowLeft" })).toEqual({ name: "left" });
  expect(keyInputFromEvent({ key: "ArrowRight" })).toEqual({ name: "right" });
  expect(keyInputFromEvent({ key: "Escape" })).toEqual({ name: "escape" });
  expect(keyInputFromEvent({ key: " " })).toEqual({ name: "space" });
});

test("buffers only printable, unmodified keys and backspace", () => {
  let value = "";
  value = applyEarlyKey(value, { key: "a" }) ?? value;
  value = applyEarlyKey(value, { key: "b" }) ?? value;
  value = applyEarlyKey(value, { key: "Backspace" }) ?? value;
  expect(value).toBe("a");
  expect(applyEarlyKey(value, { key: "Enter" })).toBeUndefined();
  expect(applyEarlyKey(value, { key: "ArrowDown" })).toBeUndefined();
  expect(applyEarlyKey(value, { key: "c", metaKey: true })).toBeUndefined();
  expect(applyEarlyKey(value, { key: "d", ctrlKey: true })).toBeUndefined();
  expect(applyEarlyKey(value, { key: "e", altKey: true })).toBeUndefined();
  expect(applyEarlyKey(value, { key: "f", isComposing: true })).toBeUndefined();
});

test("appends paste text without reading the clipboard", () => {
  expect(applyEarlyPaste("ab", "c d")).toBe("abc d");
  expect(applyEarlyPaste("", "one\r\ntwo\nthree")).toBe("one two three");
});

test("cmd is Command on macOS and Ctrl elsewhere, from the browser's platform", () => {
  expect(platformFromNavigator({ platform: "MacIntel" })).toBe("macOS");
  expect(platformFromNavigator({ platform: "iPad" })).toBe("macOS");
  expect(platformFromNavigator({ platform: "Win32" })).toBe("Windows");
  expect(platformFromNavigator({ platform: "Linux x86_64" })).toBe("Linux");
  expect(platformFromNavigator({ platform: "", userAgentData: { platform: "macOS" } })).toBe(
    "macOS",
  );
  expect(platformFromNavigator({ userAgentData: { platform: "Windows" } })).toBe("Windows");
  expect(platformFromNavigator(undefined)).toBe("Linux");
  const restart = { modifiers: ["cmd"], key: "r" };
  const meta = keyInputFromEvent({ key: "r", metaKey: true });
  const ctrl = keyInputFromEvent({ key: "r", ctrlKey: true });
  expect([
    matchesShortcut(restart, meta, "macOS"),
    matchesShortcut(restart, ctrl, "macOS"),
  ]).toEqual([true, false]);
  expect([
    matchesShortcut(restart, meta, "Linux"),
    matchesShortcut(restart, ctrl, "Linux"),
  ]).toEqual([false, true]);
  expect([shortcutLabel(restart, "macOS"), shortcutLabel(restart, "Linux")]).toEqual([
    "⌘R",
    "Ctrl+R",
  ]);
});

test("an action's { macOS, Windows } shortcut matches the right press on each platform", () => {
  const pair = {
    macOS: { modifiers: ["cmd", "shift"], key: "d" },
    Windows: { modifiers: ["ctrl", "alt"], key: "d" },
  };
  const macPress = keyInputFromEvent({ key: "D", metaKey: true, shiftKey: true });
  const winPress = keyInputFromEvent({ key: "d", ctrlKey: true, altKey: true });
  expect(matchesShortcut(pair, macPress, "macOS")).toBe(true);
  expect(matchesShortcut(pair, winPress, "macOS")).toBe(false);
  for (const platform of ["Windows", "Linux"] as const) {
    expect(matchesShortcut(pair, winPress, platform)).toBe(true);
    expect(matchesShortcut(pair, macPress, platform)).toBe(false);
  }
  expect([shortcutLabel(pair, "macOS"), shortcutLabel(pair, "Windows")]).toEqual([
    "⇧⌘D",
    "Ctrl+Alt+D",
  ]);
});

test("reserved combos are detected by press and by label on each platform", () => {
  expect(isBrowserReserved(keyInputFromEvent({ key: "t", metaKey: true }), "macOS")).toBe(true);
  expect(isBrowserReserved(keyInputFromEvent({ key: "t", ctrlKey: true }), "macOS")).toBe(false);
  expect(isBrowserReserved(keyInputFromEvent({ key: "t", ctrlKey: true }), "Linux")).toBe(true);
  expect(isBrowserReserved(keyInputFromEvent({ key: "Tab", ctrlKey: true }), "macOS")).toBe(true);
  expect(
    isBrowserReserved(keyInputFromEvent({ key: "N", metaKey: true, shiftKey: true }), "macOS"),
  ).toBe(true);
  // Combos a page can take with preventDefault are not reserved.
  for (const key of ["r", "d", "p", "s", "f", "["])
    expect(isBrowserReserved(keyInputFromEvent({ key, metaKey: true }), "macOS")).toBe(false);
  expect(isReservedLabel("⌘T", "macOS")).toBe(true);
  expect(isReservedLabel("⌘W", "macOS")).toBe(true);
  expect(isReservedLabel("Ctrl+W", "Windows")).toBe(true);
  expect(isReservedLabel("⌘R", "macOS")).toBe(false);
  expect(isReservedLabel("", "macOS")).toBe(false);
});

test("a text field keeps plain typing but yields combos, Enter, Escape and up/down", () => {
  expect(shortcutAllowedInText({ key: "a" })).toBe(false);
  expect(shortcutAllowedInText({ key: "A", shiftKey: true })).toBe(false);
  expect(shortcutAllowedInText({ key: "ArrowLeft" })).toBe(false);
  expect(shortcutAllowedInText({ key: " " })).toBe(false);
  expect(shortcutAllowedInText({ key: "r", metaKey: true })).toBe(true);
  expect(shortcutAllowedInText({ key: "k", ctrlKey: true })).toBe(true);
  expect(shortcutAllowedInText({ key: "x", altKey: true })).toBe(true);
  for (const key of ["Enter", "Escape", "ArrowUp", "ArrowDown"])
    expect(shortcutAllowedInText({ key })).toBe(true);
  expect(shortcutAllowedInText({ key: "r", metaKey: true, isComposing: true })).toBe(false);
});
