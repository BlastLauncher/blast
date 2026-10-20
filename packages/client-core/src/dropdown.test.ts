// @covers List.Dropdown
// @covers List.Dropdown.Props
// @covers List.Dropdown.Props.filtering
// @covers List.Dropdown.Props.filtering.keepSectionOrder
// @covers Grid.Dropdown
// @covers Grid.Dropdown.Props
// @covers Grid.Dropdown.Props.filtering
// @covers Grid.Dropdown.Props.filtering.keepSectionOrder
import { expect, test } from "bun:test";
import type { SceneNode } from "@blastlauncher/protocol";
import {
  dropdownLabel,
  dropdownOptions,
  filterOptions,
  searchBarDropdown,
  visibleOptions,
} from "./dropdown.ts";

const node = (
  type: string,
  id: string,
  props: SceneNode["props"] = {},
  children: SceneNode[] = [],
): SceneNode => ({ type, id, props, children });

function listWithDropdown(dropdown: SceneNode, props: SceneNode["props"] = {}): SceneNode {
  return node("List", "list", props, [
    node("Slot", "accessory", { name: "searchBarAccessory" }, [dropdown]),
  ]);
}

const dropdown = (props: SceneNode["props"], children: SceneNode[]): SceneNode =>
  node("List.Dropdown", "dd", props, children);

test("searchBarDropdown finds the List/Grid dropdown in the accessory slot only", () => {
  const list = node("List.Dropdown", "dd");
  const grid = node("Grid.Dropdown", "gd");
  expect(searchBarDropdown(listWithDropdown(list))).toBe(list);
  expect(searchBarDropdown(listWithDropdown(grid))).toBe(grid);
  expect(searchBarDropdown(node("List", "l", {}, [list]))).toBeUndefined();
  expect(searchBarDropdown(undefined)).toBeUndefined();
});

test("dropdownOptions flatten items and carry their section title", () => {
  const options = dropdownOptions(
    dropdown({}, [
      node("List.Dropdown.Item", "a", { title: "Tea", value: "tea" }),
      node("List.Dropdown.Section", "s", { title: "Drinks" }, [
        node("List.Dropdown.Item", "b", { title: "Coffee", value: "coffee" }),
      ]),
    ]),
  );
  expect(options.map((option) => [option.value, option.title, option.section])).toEqual([
    ["tea", "Tea", ""],
    ["coffee", "Coffee", "Drinks"],
  ]);
  expect(dropdownOptions(undefined)).toEqual([]);
});

test("filterOptions keeps title and value matches and everything on an empty query", () => {
  const options = dropdownOptions(
    dropdown({}, [
      node("List.Dropdown.Item", "a", { title: "Tea", value: "drink-tea" }),
      node("List.Dropdown.Item", "b", { title: "Coffee", value: "coffee" }),
    ]),
  );
  expect(filterOptions(options, "").map((option) => option.value)).toEqual(["drink-tea", "coffee"]);
  expect(filterOptions(options, "TEA").map((option) => option.value)).toEqual(["drink-tea"]);
  expect(filterOptions(options, "off").map((option) => option.value)).toEqual(["coffee"]);
  expect(filterOptions(options, "soda")).toEqual([]);
});

test("dropdownLabel resolves the controlled value, then the default, to a title", () => {
  const options = dropdownOptions(
    dropdown({}, [
      node("List.Dropdown.Item", "a", { title: "Tea", value: "tea" }),
      node("List.Dropdown.Item", "b", { title: "Coffee", value: "coffee" }),
    ]),
  );
  const labelled = (props: SceneNode["props"]) =>
    searchBarDropdown(listWithDropdown(dropdown(props, [])));
  expect(dropdownLabel(labelled({ value: "coffee" }), options)).toBe("Coffee");
  expect(dropdownLabel(labelled({ defaultValue: "tea" }), options)).toBe("Tea");
  // An unknown or absent value falls back to the raw value text.
  expect(dropdownLabel(labelled({ value: "soda" }), options)).toBe("soda");
  expect(dropdownLabel(undefined, options)).toBe("");
});

const item = (id: string, props: SceneNode["props"] = {}) =>
  node("List.Dropdown.Item", id, { title: id, value: id, ...props });

const dropdownSections = () => [
  node("List.Dropdown.Section", "A", { title: "A" }, [item("xxapple"), item("apple pie")]),
  node("List.Dropdown.Section", "B", { title: "B" }, [
    item("apple"),
    item("kw", { keywords: ["apple"] }),
  ]),
];

const ids = (props: SceneNode["props"], query: string) =>
  visibleOptions(dropdown(props, dropdownSections()), query).map((option) => option.node.id);

test("dropdown options rank by title, keywords and value, with sections ordered by best item", () => {
  expect(ids({}, "apple")).toEqual(["apple", "kw", "apple pie", "xxapple"]);
  expect(ids({ filtering: { keepSectionOrder: true } }, "apple")).toEqual([
    "apple pie",
    "xxapple",
    "apple",
    "kw",
  ]);
  expect(ids({}, "")).toEqual(["xxapple", "apple pie", "apple", "kw"]);
  expect(ids({ filtering: false }, "zzz")).toEqual(["xxapple", "apple pie", "apple", "kw"]);
  expect(ids({ onSearchTextChange: { $handler: "h" } }, "zzz")).toEqual([
    "xxapple",
    "apple pie",
    "apple",
    "kw",
  ]);
  expect(visibleOptions(undefined, "x")).toEqual([]);
});
