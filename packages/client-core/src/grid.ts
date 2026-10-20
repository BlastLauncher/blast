import type { SceneNode } from "@blastlauncher/protocol";
import { isFiltering, matchesQuery, selectionId, text } from "./nodes.ts";

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

/** Lay a Grid scene node out into selectable cells, one row per `columns`. */
export function gridLayout(
  grid: SceneNode | undefined,
  query = "",
  filtering: boolean = isFiltering(grid),
): GridLayout {
  const rows: GridRow[] = [];
  const cells: SceneNode[] = [];
  if (grid?.type !== "Grid") return { rows, cells };
  const base = columnsOf(grid, 5);
  // The row currently accepting cells; a section header or a full row closes it.
  let open: GridRow | undefined;
  function addCell(node: SceneNode, columns: number) {
    if (filtering && !matchesQuery(node, query)) return;
    if (!open || open.cells.length >= columns) {
      open = { node: undefined, header: "", cells: [] };
      rows.push(open);
    }
    open.cells.push(node);
    cells.push(node);
  }
  function visit(node: SceneNode, columns: number) {
    if (node.type === "Grid.Item") addCell(node, columns);
    else if (node.type === "Grid.Section") {
      open = undefined;
      const start = rows.length;
      rows.push({
        node,
        header: [text(node.props.title), text(node.props.subtitle)].filter(Boolean).join(" — "),
        cells: [],
      });
      const own = columnsOf(node, columns);
      node.children.forEach((child) => visit(child, own));
      // Drop sections whose items all filtered away, like List does.
      if (rows.length === start + 1) rows.splice(start, 1);
      open = undefined;
    }
  }
  grid.children.forEach((child) => visit(child, base));
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
