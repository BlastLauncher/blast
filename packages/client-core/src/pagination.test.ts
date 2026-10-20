import { expect, test } from "bun:test";
import type { SceneNode } from "@blastlauncher/protocol";
import { loadMoreRequest } from "./pagination.ts";

const item = (id: string): SceneNode => ({
  type: "List.Item",
  id,
  props: { title: id },
  children: [],
});
const list = (hasMore: boolean, items: SceneNode[], onLoadMore: unknown = { $handler: "more" }) =>
  ({
    type: "List",
    id: "list",
    props: { pagination: { pageSize: 3, hasMore, onLoadMore } },
    children: items,
  }) as SceneNode;

test("the trigger fires only when the selection reaches the last loaded item", () => {
  const items = ["a", "b", "c"].map(item);
  const request = (selectedId: string | null) =>
    loadMoreRequest(list(true, items), items, selectedId, -1);
  expect(request("c")?.event).toEqual({ node: "list", handler: "more", args: [] });
  expect(request("b")).toBeUndefined();
  expect(request(null)).toBeUndefined();
  // An empty view has no last item to reach.
  expect(loadMoreRequest(list(true, []), [], "a", -1)).toBeUndefined();
});

test("each item count loads once; a grown scene loads again", () => {
  const items = ["a", "b", "c"].map(item);
  const view = list(true, items);
  expect(loadMoreRequest(view, items, "c", -1)?.count).toBe(3);
  // The client reports back the count it already requested for.
  expect(loadMoreRequest(view, items, "c", 3)).toBeUndefined();
  const grown = ["a", "b", "c", "d", "e", "f"].map(item);
  expect(loadMoreRequest(view, grown, "f", 3)?.count).toBe(6);
});

test("no trigger without pagination, a handler, or `hasMore`", () => {
  const items = ["a", "b", "c"].map(item);
  expect(loadMoreRequest(undefined, items, "c", -1)).toBeUndefined();
  expect(loadMoreRequest(list(true, items, "not-a-handler"), items, "c", -1)).toBeUndefined();
  expect(loadMoreRequest(list(false, items), items, "c", -1)).toBeUndefined();
  // A view without the pagination prop at all.
  const plain: SceneNode = { type: "List", id: "list", props: {}, children: items };
  expect(loadMoreRequest(plain, items, "c", -1)).toBeUndefined();
});
