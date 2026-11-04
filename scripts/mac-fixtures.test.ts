import { expect, test } from "bun:test";
import { FIXTURE_NAMES, compareFixtures, renderFixture, sortKeys } from "./mac-fixtures.ts";

test("sortKeys sorts objects recursively but keeps array order", () => {
  expect(sortKeys({ b: 1, a: { d: [3, 1], c: 2 } })).toEqual({
    a: { c: 2, d: [3, 1] },
    b: 1,
  });
});

test("sortKeys leaves scalars alone", () => {
  for (const value of [null, true, 0, "text"]) expect(sortKeys(value)).toBe(value);
});

test("renderFixture is stable regardless of input key order", () => {
  const first = renderFixture({ b: 2, a: { y: 1, x: [2, 1] } });
  const second = renderFixture({ a: { x: [2, 1], y: 1 }, b: 2 });
  expect(first).toBe(second);
  expect(first.endsWith("}\n")).toBe(true);
  expect(JSON.parse(first)).toEqual({ a: { x: [2, 1], y: 1 }, b: 2 });
});

test("compareFixtures passes identical fixtures", () => {
  expect(compareFixtures({ list: "a\n" }, { list: "a\n" })).toEqual([]);
});

test("compareFixtures reports missing, stale and unexpected files", () => {
  expect(compareFixtures({ list: "a\n", grid: "b\n" }, { list: "old\n", extra: "x\n" })).toEqual([
    "grid.json: missing",
    "list.json: stale",
    "extra.json: unexpected file",
  ]);
});

test("the required fixtures are covered", () => {
  expect([...FIXTURE_NAMES]).toEqual([
    "list",
    "grid",
    "detail",
    "form",
    "menu-bar",
    "toast",
    "action-panel",
  ]);
});
