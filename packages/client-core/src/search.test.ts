import { expect, test } from "bun:test";
import type { SceneNode } from "@blastlauncher/protocol";
import { SEARCH_THROTTLE_MS, searchDispatch } from "./search.ts";

const list = (props: SceneNode["props"]): SceneNode => ({
  type: "List",
  id: "list",
  props,
  children: [],
});

test("extension-owned search forwards the text immediately unless throttled", () => {
  const owned = list({ onSearchTextChange: { $handler: "search" } });
  expect(searchDispatch(owned, "ab")).toEqual({
    event: { node: "list", handler: "search", args: ["ab"] },
    delayMs: 0,
  });
  expect(
    searchDispatch(list({ throttle: true, onSearchTextChange: { $handler: "s" } }), "ab"),
  ).toEqual({
    event: { node: "list", handler: "s", args: ["ab"] },
    delayMs: SEARCH_THROTTLE_MS,
  });
  expect(SEARCH_THROTTLE_MS).toBe(200);
});

test("client-owned filtering forwards nothing", () => {
  expect(searchDispatch(list({}), "ab")).toBeUndefined();
  expect(searchDispatch(list({ filtering: false }), "ab")).toBeUndefined();
  expect(searchDispatch(undefined, "ab")).toBeUndefined();
});
