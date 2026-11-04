/**
 * Keep client semantics independent from terminal rendering. The controller
 * owns the complete filtered and ranked list; this helper only chooses the
 * small window of rows OpenTUI needs to mount for the current viewport.
 */
export function visibleRows<T extends { selected: boolean }>(
  rows: readonly T[],
  limit: number,
  overscan = 2,
): T[] {
  const count = Math.max(1, Math.floor(limit));
  if (rows.length <= count) return [...rows];

  const selected = rows.findIndex((row) => row.selected);
  const anchor = selected < 0 ? 0 : selected;
  const extra = Math.max(0, Math.floor(overscan));
  const window = Math.min(rows.length, count + extra * 2);
  const centered = anchor - Math.floor(window / 2);
  let start = Math.max(0, Math.min(rows.length - window, centered));
  // ScrollBox may retain its previous offset when a new window is mounted.
  // Keep the selected row inside the first viewport-sized slice as well as in
  // the overscan window, so selection remains visible after a resize or jump.
  if (anchor - start >= count) start = Math.max(0, anchor - count + 1);
  return rows.slice(start, start + window);
}
