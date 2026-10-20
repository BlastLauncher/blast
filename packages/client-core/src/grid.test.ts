import { expect, test } from "bun:test";
import type { SceneNode } from "@blastlauncher/protocol";
import { contentGlyph, gridLayout, gridMove } from "./grid.ts";

function item(id: string, props: SceneNode["props"] = {}): SceneNode {
  return {
    type: "Grid.Item",
    id,
    props: { title: id, content: `${id}.png`, ...props },
    children: [],
  };
}
function section(id: string, title: string, children: SceneNode[], columns?: number): SceneNode {
  return {
    type: "Grid.Section",
    id,
    props: columns === undefined ? { title } : { title, columns },
    children,
  };
}
function grid(children: SceneNode[], columns?: number): SceneNode {
  return { type: "Grid", id: "grid", props: columns === undefined ? {} : { columns }, children };
}
const ids = (layout: ReturnType<typeof gridLayout>) =>
  layout.rows.map((row) => (row.cells.length === 0 ? row.header : row.cells.map((c) => c.id)));

test("grid layout defaults to 5 columns and wraps top-level items", () => {
  const layout = gridLayout(grid([..."abcdefg"].map((id) => item(id))));
  expect(layout.cells.map((cell) => cell.id)).toEqual([..."abcdefg"]);
  expect(ids(layout)).toEqual([
    ["a", "b", "c", "d", "e"],
    ["f", "g"],
  ]);
});

test("grid columns and section overrides shape the rows", () => {
  const layout = gridLayout(
    grid([item("a"), section("s", "One", [item("b"), item("c"), item("d")], 2)], 3),
  );
  expect(ids(layout)).toEqual([["a"], "One", ["b", "c"], ["d"]]);
  // The section's own columns override the grid's.
  expect(
    ids(gridLayout(grid([section("s", "One", [item("a"), item("b"), item("c")], 3)]))),
  ).toEqual(["One", ["a", "b", "c"]]);
});

test("grid filtering drops items and sections that match nothing", () => {
  const layout = gridLayout(
    grid([item("apple"), section("s", "One", [item("banana"), item("cherry")])]),
    "app",
  );
  expect(ids(layout)).toEqual([["apple"]]);
  expect(gridLayout(grid([section("s", "One", [item("banana")])]), "zzz").rows).toEqual([]);
});

test("movement: ←/→ stay in the row, ↑/↓ follow the column across rows and sections", () => {
  const layout = gridLayout(
    grid([
      item("a"),
      item("b"),
      item("c"),
      section("s1", "One", [item("d"), item("e"), item("f")], 3),
      section("s2", "Two", [item("g")]),
    ]),
  );
  // rows: [a b c], One, [d e f], Two, [g]
  const move = (from: string, direction: "up" | "down" | "left" | "right") =>
    gridMove(layout.rows, from, direction);
  expect(move("a", "right")).toBe("b");
  expect(move("b", "left")).toBe("a");
  expect(move("a", "left")).toBe("a"); // clamped at the row start
  expect(move("c", "right")).toBe("c"); // clamped at the row end
  expect(move("a", "down")).toBe("d"); // same column in the next cell row
  expect(move("d", "up")).toBe("a");
  expect(move("c", "down")).toBe("f"); // ragged row below clamps to its last cell
  expect(move("f", "down")).toBe("g"); // single-cell row clamps to column 0
  expect(move("g", "up")).toBe("d");
});

test("movement without a current cell selects the first cell", () => {
  const layout = gridLayout(grid([item("a"), item("b")]));
  expect(gridMove(layout.rows, null, "down")).toBe("a");
  expect(gridMove(layout.rows, "missing", "right")).toBe("a");
  expect(gridMove([], null, "down")).toBeNull();
});

test("cell glyphs render image source names and colors", () => {
  expect(contentGlyph(item("a"))).toBe("a.png");
  expect(contentGlyph(item("b", { content: { color: "red" } }))).toBe("■ red");
  expect(
    contentGlyph(item("c", { content: { value: { color: "#00ff00" }, tooltip: "Green" } })),
  ).toBe("■ #00ff00");
});
