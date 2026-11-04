import { expect, test } from "bun:test";
import { visibleRows } from "./virtual-list.ts";

const rows = (count: number, selected: number): { id: number; selected: boolean }[] =>
  Array.from({ length: count }, (_, id) => ({ id, selected: id === selected }));

test("visibleRows mounts a bounded window around the selection", () => {
  const visible = visibleRows(rows(10_000, 5_000), 20);
  expect(visible.length).toBe(24);
  expect(visible.some((row) => row.selected)).toBe(true);
  expect(visible[0]?.id).toBe(4_988);
  expect(visible.at(-1)?.id).toBe(5_011);
});

test("visibleRows keeps the beginning, end and all rows in small lists", () => {
  expect(visibleRows(rows(5, 0), 20)).toHaveLength(5);
  expect(visibleRows(rows(100, 0), 3, 0).map((row) => row.id)).toEqual([0, 1, 2]);
  expect(visibleRows(rows(100, 99), 3, 0).map((row) => row.id)).toEqual([97, 98, 99]);
  expect(visibleRows(rows(100, 99), 3).some((row) => row.selected)).toBe(true);
});
