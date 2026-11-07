import { expect, test } from "bun:test";
import { applyEarlyKey, applyEarlyPaste, keyInputFromEvent } from "./keyboard.ts";

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
});
