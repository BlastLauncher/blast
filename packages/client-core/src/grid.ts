import type { SceneNode } from "@blastlauncher/protocol";
import { selectionId, text } from "./nodes.ts";
import {
  filteringOf,
  groupsOf,
  rankGroups,
  score,
  searchable,
  type FilteringOptions,
} from "./rank.ts";

// Pure scene → cells layout: which items land in which row/column, ignoring
// purely visual Grid props (`aspectRatio`, `fit`, `inset`, `itemSize`).

export type GridRow = { node: SceneNode | undefined; header: string; cells: SceneNode[] };
export type GridLayout = { rows: GridRow[]; cells: SceneNode[] };
export type GridDirection = "up" | "down" | "left" | "right";

function columnsOf(node: SceneNode, fallback: number): number {
  const value = node.props.columns;
  return typeof value === "number" && value > 0 ? value : fallback;
}

/** The content of a cell as short text: the image source name or a color. */
export function contentGlyph(node: SceneNode): string {
  const content = node.props.content;
  const value =
    content && typeof content === "object" && !Array.isArray(content) && "value" in content
      ? content.value
      : content;
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && !Array.isArray(value) && "color" in value) {
    const color = text(value.color);
    return color ? `■ ${color}` : "■";
  }
  return "◇";
}

/**
 * Lay a Grid scene node out into selectable cells, one row per `columns`.
 * Items are filtered and ranked for `query` per the grid's `filtering`.
 */
export function gridLayout(
  grid: SceneNode | undefined,
  query = "",
  filtering: FilteringOptions = filteringOf(grid),
): GridLayout {
  const rows: GridRow[] = [];
  const cells: SceneNode[] = [];
  if (grid?.type !== "Grid") return { rows, cells };
  const base = columnsOf(grid, 5);
  const groups = rankGroups(
    groupsOf(
      grid,
      (node) => node.type === "Grid.Item",
      (node) => node.type === "Grid.Section",
    ),
    query,
    (node) => score(searchable(node), query),
    filtering,
  );
  for (const group of groups) {
    const columns = group.section ? columnsOf(group.section, base) : base;
    if (group.section)
      rows.push({
        node: group.section,
        header: [text(group.section.props.title), text(group.section.props.subtitle)]
          .filter(Boolean)
          .join(" — "),
        cells: [],
      });
    // A section header or a full row closes the row accepting cells.
    let open: GridRow | undefined;
    for (const node of group.items) {
      if (!open || open.cells.length >= columns) {
        open = { node: undefined, header: "", cells: [] };
        rows.push(open);
      }
      open.cells.push(node);
      cells.push(node);
    }
  }
  return { rows, cells };
}

/** Two-dimensional movement: ←/→ within a row, ↑/↓ by column across rows. */
export function gridMove(
  rows: GridRow[],
  currentId: string | null,
  direction: GridDirection,
): string | null {
  const cellRows = rows.map((row) => row.cells);
  let position: { r: number; c: number } | undefined;
  cellRows.forEach((row, r) =>
    row.forEach((cell, c) => {
      if (selectionId(cell) === currentId) position = { r, c };
    }),
  );
  // Walk to the nearest cell row above/below, keeping the column when it fits.
  const at = (r: number, column: number): { r: number; c: number } | undefined => {
    const cells = cellRows[r];
    if (!cells?.length) return undefined;
    return { r, c: Math.min(column, cells.length - 1) };
  };
  if (!position) {
    const first = cellRows.find((row) => row.length > 0)?.[0];
    return first ? selectionId(first) : null;
  }
  const { r, c } = position;
  const here = cellRows[r] ?? [];
  let target: { r: number; c: number } | undefined;
  if (direction === "left") target = c > 0 ? { r, c: c - 1 } : undefined;
  else if (direction === "right") target = c + 1 < here.length ? { r, c: c + 1 } : undefined;
  else if (direction === "up") for (let i = r - 1; i >= 0 && !target; i--) target = at(i, c);
  else for (let i = r + 1; i < cellRows.length && !target; i++) target = at(i, c);
  const cell = target ? cellRows[target.r]?.[target.c] : here[c];
  return selectionId(cell);
}
