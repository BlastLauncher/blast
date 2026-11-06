import { expect, test } from "bun:test";
import { keyInputFromEvent } from "./keyboard.ts";

test("maps browser keys and modifiers to client-core shortcuts", () => {
  expect(keyInputFromEvent({ key: "c", metaKey: true, shiftKey: true })).toEqual({
    name: "c",
    meta: true,
    shift: true,
  });
  expect(keyInputFromEvent({ key: "7", ctrlKey: true, altKey: true })).toEqual({
    name: "7",
    ctrl: true,
    option: true,
  });
  expect(keyInputFromEvent({ key: "Enter" })).toEqual({ name: "return" });
  expect(keyInputFromEvent({ key: "ArrowDown" })).toEqual({ name: "down" });
  expect(keyInputFromEvent({ key: "Escape" })).toEqual({ name: "escape" });
  expect(keyInputFromEvent({ key: " " })).toEqual({ name: "space" });
});
