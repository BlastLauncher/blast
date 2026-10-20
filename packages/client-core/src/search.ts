import type { SceneNode } from "@blastlauncher/protocol";
import { event, handler, type OutboundEvent } from "./nodes.ts";

/** Raycast throttles extension-owned search text to one update per 200 ms. */
export const SEARCH_THROTTLE_MS = 200;

/**
 * The search rule as data: when the view owns its search text
 * (`onSearchTextChange`), the client forwards every edit — immediately, or
 * after `SEARCH_THROTTLE_MS` when the view sets `throttle`. Undefined when
 * the client owns the filtering and nothing is forwarded; the timer (if any)
 * stays with the client.
 */
export function searchDispatch(
  list: SceneNode | undefined,
  value: string,
): { event: OutboundEvent; delayMs: number } | undefined {
  if (!handler(list?.props.onSearchTextChange)) return undefined;
  const out = event(list, "onSearchTextChange", [value]);
  if (!out) return undefined;
  return { event: out, delayMs: list?.props.throttle ? SEARCH_THROTTLE_MS : 0 };
}
