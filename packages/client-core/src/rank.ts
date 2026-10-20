import type { SceneNode } from "@blastlauncher/protocol";
import { handler, text } from "./nodes.ts";

// Raycast-like search ranking, framework-free. Every client-owned filter (List,
// Grid, dropdowns, action panels) goes through here so they order alike.

/** The searchable fields of one item. */
export type Searchable = { title?: string; subtitle?: string; keywords?: string[] };

/** Match quality, best first. Weighs more than which field matched. */
const EXACT = 4;
const PREFIX = 3;
const WORD_PREFIX = 2;
const SUBSTRING = 1;
// Field weight breaks ties between equal match qualities: title > keywords > subtitle.
const TITLE = 3;
const KEYWORDS = 2;
const SUBTITLE = 1;

function quality(value: string, query: string): number {
  const haystack = value.toLowerCase();
  if (haystack === query) return EXACT;
  if (haystack.startsWith(query)) return PREFIX;
  const at = haystack.indexOf(query);
  if (at < 0) return 0;
  // A word prefix: the match begins right after a non-alphanumeric boundary.
  for (let index = at; index >= 0; index = haystack.indexOf(query, index + 1))
    if (index === 0 || !/[\p{L}\p{N}]/u.test(haystack[index - 1] ?? "")) return WORD_PREFIX;
  return SUBSTRING;
}

/**
 * How well `item` matches `query` (case-insensitive, pass it as typed): the
 * best of its fields, 0 for no match. Match quality (exact > prefix > word
 * prefix > substring) dominates; the field (title > keywords > subtitle)
 * decides between equal qualities. An empty query matches everything equally.
 */
export function score(item: Searchable, query: string): number {
  const needle = query.toLowerCase();
  if (!needle) return 1;
  let best = 0;
  const consider = (value: string | undefined, field: number) => {
    const q = value ? quality(value, needle) : 0;
    if (q) best = Math.max(best, q * 4 + field);
  };
  consider(item.title, TITLE);
  for (const keyword of item.keywords ?? []) consider(keyword, KEYWORDS);
  consider(item.subtitle, SUBTITLE);
  return best;
}

/** The searchable fields of a scene node (`title`, `subtitle`, `keywords`). */
export function searchable(node: SceneNode): Searchable {
  return {
    title: text(node.props.title),
    subtitle: text(node.props.subtitle),
    keywords: Array.isArray(node.props.keywords) ? node.props.keywords.map(text) : [],
  };
}

/** Case-insensitive match over title, subtitle and keywords. */
export function matchesQuery(node: SceneNode, query: string): boolean {
  return score(searchable(node), query) > 0;
}

export type FilteringOptions = { enabled: boolean; keepSectionOrder: boolean };

/**
 * A view's `filtering` prop: client-side filtering is on unless the view opts
 * out (`filtering: false`) or owns the search (`onSearchTextChange`);
 * `{ keepSectionOrder: true }` keeps sections in declaration order.
 */
export function filteringOf(node: SceneNode | undefined): FilteringOptions {
  const value = node?.props.filtering;
  const enabled = value !== false && !handler(node?.props.onSearchTextChange);
  const keepSectionOrder =
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "keepSectionOrder" in value &&
    value.keepSectionOrder === true;
  return { enabled, keepSectionOrder };
}

/** A section of items, or the loose items between sections (`section` undefined). */
export type Group<T, S = SceneNode> = { section?: S; items: T[] };

/**
 * Filter and order groups for `query`. Items inside a group are ordered by
 * score (ties keep declaration order); groups whose items all drop away
 * disappear. Unless `keepSectionOrder`, groups are ordered by their best item
 * (ties keep declaration order). An empty query keeps declaration order;
 * `enabled: false` shows everything in declaration order.
 */
export function rankGroups<T, S = SceneNode>(
  groups: Group<T, S>[],
  query: string,
  scoreOf: (item: T) => number,
  options: FilteringOptions,
): Group<T, S>[] {
  if (!options.enabled || !query) return groups.filter((group) => group.items.length > 0);
  const ranked = groups
    .map((group, order) => {
      const scored = group.items
        .map((item, index) => ({ item, index, value: scoreOf(item) }))
        .filter((entry) => entry.value > 0)
        .toSorted((a, b) => b.value - a.value || a.index - b.index);
      return {
        group: { ...group, items: scored.map((entry) => entry.item) },
        order,
        best: scored[0]?.value ?? 0,
      };
    })
    .filter((entry) => entry.group.items.length > 0);
  const ordered = options.keepSectionOrder
    ? ranked
    : ranked.toSorted((a, b) => b.best - a.best || a.order - b.order);
  return ordered.map((entry) => entry.group);
}

/**
 * Split a parent's children into groups: each section is a group, consecutive
 * loose items form one. Other children are not items and are skipped here.
 */
export function groupsOf(
  parent: SceneNode,
  isItem: (node: SceneNode) => boolean,
  isSection: (node: SceneNode) => boolean,
): Group<SceneNode>[] {
  const groups: Group<SceneNode>[] = [];
  let loose: Group<SceneNode> | undefined;
  for (const child of parent.children) {
    if (isSection(child)) {
      loose = undefined;
      groups.push({ section: child, items: child.children.filter(isItem) });
    } else if (isItem(child)) {
      if (!loose) groups.push((loose = { items: [] }));
      loose.items.push(child);
    }
  }
  return groups;
}
