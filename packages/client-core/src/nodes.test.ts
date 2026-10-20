import { expect, test } from "bun:test";
import type { SceneNode } from "@blastlauncher/protocol";
import {
  event,
  handler,
  handlerEvent,
  isFiltering,
  matchesQuery,
  paginationOf,
  selectionId,
  slot,
  text,
} from "./nodes.ts";

const node = (
  type: string,
  id: string,
  props: SceneNode["props"] = {},
  children: SceneNode[] = [],
): SceneNode => ({ type, id, props, children });

test("text flattens strings, numbers and value wrappers; anything else is empty", () => {
  expect(text("Title")).toBe("Title");
  expect(text(42)).toBe("42");
  expect(text({ value: { value: "nested" } })).toBe("nested");
  expect(text(undefined)).toBe("");
  expect(text({})).toBe("");
});

test("handler detects handler references and event resolves them off a node", () => {
  expect(handler({ $handler: "run" })).toBe(true);
  expect(handler("run")).toBe(false);
  const item = node("List.Item", "a", { onAction: { $handler: "run" } });
  expect(event(item, "onAction")).toEqual({ node: "a", handler: "run", args: [] });
  expect(event(item, "onChange")).toBeUndefined();
  expect(event(item, "onAction", [{ type: "left-click" }])).toEqual({
    node: "a",
    handler: "run",
    args: [{ type: "left-click" }],
  });
  expect(handlerEvent(undefined, { $handler: "run" })).toBeUndefined();
});

test("slot finds named Slot children and selectionId prefers the declared id", () => {
  const actions = node("Slot", "s1", { name: "actions" });
  expect(slot(node("List", "l", {}, [actions]), "actions")).toBe(actions);
  expect(slot(node("List", "l", {}, [actions]), "detail")).toBeUndefined();
  expect(selectionId(node("List.Item", "inner", { id: "outer" }))).toBe("outer");
  expect(selectionId(node("List.Item", "inner"))).toBe("inner");
  expect(selectionId(undefined)).toBeNull();
});

test("paginationOf accepts only complete pagination props", () => {
  const full = { pageSize: 3, hasMore: true, onLoadMore: { $handler: "more" } };
  expect(paginationOf(node("List", "l", { pagination: full }))).toEqual(full);
  for (const partial of [
    { pageSize: 3, hasMore: true },
    { pageSize: 3, onLoadMore: { $handler: "more" } },
    { hasMore: true, onLoadMore: { $handler: "more" } },
  ]) {
    expect(paginationOf(node("List", "l", { pagination: partial }))).toBeUndefined();
  }
  expect(paginationOf(node("List", "l", { pagination: "no" }))).toBeUndefined();
  expect(paginationOf(undefined)).toBeUndefined();
});

test("filtering is client-owned unless the view opts out or handles search itself", () => {
  expect(isFiltering(node("List", "l"))).toBe(true);
  expect(isFiltering(node("List", "l", { filtering: false }))).toBe(false);
  expect(isFiltering(node("List", "l", { onSearchTextChange: { $handler: "s" } }))).toBe(false);
});

test("matchesQuery is a case-insensitive match over title, subtitle and keywords", () => {
  const item = node("List.Item", "a", {
    title: "Apple",
    subtitle: "Green",
    keywords: ["fruit", "Juice"],
  });
  // The query arrives lowercased from sceneToView.
  for (const query of ["app", "green", "juice", ""]) expect(matchesQuery(item, query)).toBe(true);
  expect(matchesQuery(item, "pear")).toBe(false);
  expect(matchesQuery(node("List.Item", "b", { title: "Pear" }), "app")).toBe(false);
});
