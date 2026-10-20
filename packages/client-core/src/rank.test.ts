// @covers List
// @covers List.Props
// @covers Grid
// @covers Grid.Props
// @covers ActionPanel.Submenu
// @covers ActionPanel.Submenu.Props
// @covers List.Props.filtering
// @covers List.Props.filtering.keepSectionOrder
// @covers Grid.Props.filtering
// @covers Grid.Props.filtering.keepSectionOrder
// @covers ActionPanel.Submenu.Props.filtering
// @covers ActionPanel.Submenu.Props.filtering.keepSectionOrder
import { expect, test } from "bun:test";
import type { SceneMessage, SceneNode } from "@blastlauncher/protocol";
import { gridLayout } from "./grid.ts";
import { filteringOf, matchesQuery, score } from "./rank.ts";
import { actionRows, panelRows, sceneToView } from "./view.ts";

const node = (
  type: string,
  id: string,
  props: SceneNode["props"] = {},
  children: SceneNode[] = [],
): SceneNode => ({ type, id, props, children });
const item = (id: string, props: SceneNode["props"] = {}) =>
  node("List.Item", id, { title: id, ...props });
const section = (id: string, children: SceneNode[]) =>
  node("List.Section", id, { title: id }, children);
function listScene(list: SceneNode): SceneMessage {
  return { type: "scene", revision: 1, root: list };
}
const ids = (query: string, list: SceneNode) =>
  sceneToView(listScene(list), { searchText: query, selectedId: null }).rows.map(
    (row) => row.node.id,
  );

test("match quality orders exact > prefix > word prefix > substring", () => {
  const titles = ["pineapple", "apple pie", "apple"];
  const list = node(
    "List",
    "l",
    {},
    titles.map((id) => item(id)),
  );
  expect(ids("apple", list)).toEqual(["apple", "apple pie", "pineapple"]);
  // "pineapple" matches mid-word, so a word prefix like "pine apple" beats it.
  expect(ids("apple", node("List", "l", {}, [item("pineapple"), item("pine apple")]))).toEqual([
    "pine apple",
    "pineapple",
  ]);
});

test("equal scores keep declaration order", () => {
  const list = node("List", "l", {}, [item("b1"), item("b2"), item("b3")]);
  expect(ids("b", list)).toEqual(["b1", "b2", "b3"]);
  expect(ids("B", list)).toEqual(["b1", "b2", "b3"]);
});

test("title outranks keywords outranks subtitle at equal match quality", () => {
  const list = node("List", "l", {}, [
    item("sub", { title: "One", subtitle: "tea" }),
    item("kw", { title: "Two", keywords: ["tea"] }),
    item("title", { title: "tea" }),
  ]);
  expect(ids("tea", list)).toEqual(["title", "kw", "sub"]);
  expect(matchesQuery(node("x", "x", { title: "Pear" }), "app")).toBe(false);
  expect(score({ title: "Apple", keywords: ["juice"], subtitle: "green" }, "")).toBeGreaterThan(0);
  expect(score({ title: "Apple", keywords: ["Juice"], subtitle: "green" }, "JUI")).toBeGreaterThan(
    0,
  );
  expect(score({ title: "Apple" }, "pear")).toBe(0);
});

test("a stronger match in a weaker field still beats a weaker match in the title", () => {
  const list = node("List", "l", {}, [
    item("weak", { title: "xtea" }),
    item("strong", { title: "Zed", keywords: ["tea"] }),
  ]);
  expect(ids("tea", list)).toEqual(["strong", "weak"]);
});

test("an empty query keeps every item and section in declaration order", () => {
  const list = node("List", "l", {}, [
    item("z"),
    section("S2", [item("y"), item("a")]),
    section("S1", [item("b")]),
  ]);
  expect(ids("", list)).toEqual(["z", "S2", "y", "a", "S1", "b"]);
});

const sections = () => [
  section("Fruit", [item("apple pie"), item("apple")]),
  section("Other", [item("xxapple"), item("apple tart")]),
  section("Exact", [item("apple")]),
];

test("sections reorder by their best item unless keepSectionOrder", () => {
  // Items rank inside their section; sections rank by the best item's score.
  expect(ids("apple", node("List", "l", {}, sections()))).toEqual([
    "Fruit",
    "apple",
    "apple pie",
    "Exact",
    "apple",
    "Other",
    "apple tart",
    "xxapple",
  ]);
  const kept = node("List", "l", { filtering: { keepSectionOrder: true } }, sections());
  expect(ids("apple", kept)).toEqual([
    "Fruit",
    "apple",
    "apple pie",
    "Other",
    "apple tart",
    "xxapple",
    "Exact",
    "apple",
  ]);
});

test("a better section moves ahead of an earlier one", () => {
  const children = [
    section("Late", [item("pineapple")]),
    section("Early", [item("apple")]),
    item("loose apple"),
  ];
  expect(ids("apple", node("List", "l", {}, children))).toEqual([
    "Early",
    "apple",
    "loose apple",
    "Late",
    "pineapple",
  ]);
  expect(
    ids("apple", node("List", "l", { filtering: { keepSectionOrder: true } }, children)),
  ).toEqual(["Late", "pineapple", "Early", "apple", "loose apple"]);
});

test("filtering: false and onSearchTextChange disable client filtering", () => {
  const children = [item("b"), item("a")];
  expect(ids("zzz", node("List", "l", { filtering: false }, children))).toEqual(["b", "a"]);
  expect(
    ids("zzz", node("List", "l", { onSearchTextChange: { $handler: "h" } }, children)),
  ).toEqual(["b", "a"]);
  expect(filteringOf(node("List", "l", { filtering: { keepSectionOrder: true } }))).toEqual({
    enabled: true,
    keepSectionOrder: true,
  });
  expect(filteringOf(undefined)).toEqual({ enabled: true, keepSectionOrder: false });
});

const cell = (id: string) => node("Grid.Item", id, { title: id, content: "x.png" });

const gridSections = () => [
  node("Grid.Section", "S1", { title: "S1" }, [cell("xxapple")]),
  node("Grid.Section", "S2", { title: "S2" }, [cell("apple"), cell("apple pie")]),
];
const gridOrder = (props: SceneNode["props"]) =>
  gridLayout(node("Grid", "g", props, gridSections()), "apple").rows.map((row) =>
    row.cells.length ? row.cells.map((c) => c.id) : row.header,
  );

test("grid ranks cells and sections the same way", () => {
  expect(gridOrder({})).toEqual(["S2", ["apple", "apple pie"], "S1", ["xxapple"]]);
  expect(gridOrder({ filtering: { keepSectionOrder: true } })).toEqual([
    "S1",
    ["xxapple"],
    "S2",
    ["apple", "apple pie"],
  ]);
  expect(gridOrder({ filtering: false })).toEqual([
    "S1",
    ["xxapple"],
    "S2",
    ["apple", "apple pie"],
  ]);
});

const action = (id: string) => node("Action", id, { title: id });
const actionSections = () => [
  node("ActionPanel.Section", "s1", { title: "One" }, [action("copy link"), action("xcopy")]),
  node("ActionPanel.Section", "s2", { title: "Two" }, [action("copy")]),
];
const submenu = (props: SceneNode["props"]) =>
  node("ActionPanel.Submenu", "m", props, actionSections());

test("action panels and submenus rank by title and honour the submenu's filtering", () => {
  const panel = node("ActionPanel", "p", {}, actionSections());
  expect(actionRows(panel, "copy").map((row) => row.node.id)).toEqual([
    "s2",
    "copy",
    "s1",
    "copy link",
    "xcopy",
  ]);
  expect(
    panelRows(submenu({ filtering: { keepSectionOrder: true } }), "copy").map((r) => r.node.id),
  ).toEqual(["s1", "copy link", "xcopy", "s2", "copy"]);
  expect(panelRows(submenu({ filtering: false }), "zzz").map((r) => r.node.id)).toEqual([
    "s1",
    "copy link",
    "xcopy",
    "s2",
    "copy",
  ]);
  // A submenu inside a panel is one row that matches by its own title.
  const nested = node("ActionPanel", "p", {}, [
    node("ActionPanel.Submenu", "sub", { title: "More" }, actionSections()),
  ]);
  expect(actionRows(nested, "mor").map((row) => row.node.id)).toEqual(["sub"]);
  expect(actionRows(nested, "copy")).toEqual([]);
});
