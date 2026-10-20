import type { SceneNode } from "@blastlauncher/protocol";
import { handler, handlerEvent, paginationOf, selectionId, type OutboundEvent } from "./nodes.ts";

/** A due `onLoadMore`: the event to send and the item count it was asked for. */
export type LoadMore = { count: number; event: OutboundEvent };

/**
 * Raycast pagination trigger: while the view declares pagination with
 * `hasMore`, reaching the last loaded item asks for the next page — at most
 * once per item count, until the scene grows. The client sends `event` when
 * present and remembers `count` as `requested` on the next call; the timer
 * and the send stay with the client.
 */
export function loadMoreRequest(
  list: SceneNode | undefined,
  items: SceneNode[],
  selectedId: string | null | undefined,
  requested: number,
): LoadMore | undefined {
  const pagination = paginationOf(list);
  if (!pagination || !handler(pagination.onLoadMore) || pagination.hasMore !== true) return;
  const last = items.at(-1);
  if (!last || selectionId(last) !== selectedId || requested === items.length) return;
  const event = handlerEvent(list, pagination.onLoadMore);
  return event ? { count: items.length, event } : undefined;
}
