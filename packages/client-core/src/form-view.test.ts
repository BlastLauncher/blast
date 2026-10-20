// @covers Form.Dropdown
// @covers Form.Dropdown.Props.filtering
// @covers Form.Dropdown.Props.filtering.keepSectionOrder
// @covers Form.Dropdown.Props.onSearchTextChange
import { expect, test } from "bun:test";
import type { SceneNode } from "@blastlauncher/protocol";
import { formDropdownOptions, formFields, formOptions, nextField, parseDate } from "./form-view.ts";
import { searchDispatch } from "./search.ts";

const node = (type: string, id: string, children: SceneNode[] = []): SceneNode => ({
  type,
  id,
  props: {},
  children,
});
test("focus skips presentation fields and wraps in both directions", () => {
  const fields = formFields(
    node("Form", "form", [
      node("Form.Description", "help"),
      node("Form.TextField", "a"),
      node("Slot", "actions"),
      node("Form.TextArea", "b"),
    ]),
  );
  expect(fields.map((field) => field.id)).toEqual(["a", "b"]);
  expect(nextField(fields, "a", -1)?.id).toBe("b");
  expect(nextField(fields, "b", 1)?.id).toBe("a");
  expect(nextField([], undefined, 1)).toBeUndefined();
});
test("picker options include section children", () => {
  expect(
    formOptions(
      node("Form.Dropdown", "d", [
        node("Form.Dropdown.Section", "s", [node("Form.Dropdown.Item", "tea")]),
      ]),
    ).map((item) => item.id),
  ).toEqual(["tea"]);
});
test("ISO dates validate calendar days, times and empty input", () => {
  expect(parseDate("")).toBeNull();
  expect(parseDate("2024-02-29")).toBe("2024-02-29T00:00:00.000Z");
  expect(parseDate("2024-02-29T12:30:00Z")).toBe("2024-02-29T12:30:00.000Z");
  for (const value of [
    "2023-02-29",
    "2024-02-30",
    "2024-13-01",
    "yesterday",
    "2024-01-01T29:00",
    "2024-",
  ])
    expect(parseDate(value)).toBeUndefined();
});

const item = (id: string, props: SceneNode["props"] = {}): SceneNode => ({
  type: "Form.Dropdown.Item",
  id,
  props: { title: id, value: id, ...props },
  children: [],
});
const dropdown = (props: SceneNode["props"], children: SceneNode[]): SceneNode => ({
  type: "Form.Dropdown",
  id: "dd",
  props,
  children,
});
const section = (id: string, children: SceneNode[]): SceneNode => ({
  type: "Form.Dropdown.Section",
  id,
  props: { title: id },
  children,
});
const ids = (field: SceneNode, query: string) =>
  formDropdownOptions(field, query).map((option) => option.id);

// An exact keyword or value match outranks a mere title prefix.
test("form dropdown options are ranked by title, keywords and value", () => {
  const field = dropdown({}, [
    item("pineapple"),
    item("juice", { keywords: ["apple"] }),
    item("apple tart"),
    item("zzz", { value: "apple" }),
    item("apple"),
  ]);
  expect(ids(field, "apple")).toEqual(["apple", "juice", "zzz", "apple tart", "pineapple"]);
  expect(ids(field, "")).toEqual(["pineapple", "juice", "apple tart", "zzz", "apple"]);
  expect(ids(field, "nothing")).toEqual([]);
});

const sectioned = () => [section("A", [item("xxapple")]), section("B", [item("apple")])];

test("form dropdown sections reorder unless keepSectionOrder", () => {
  expect(ids(dropdown({}, sectioned()), "apple")).toEqual(["apple", "xxapple"]);
  expect(ids(dropdown({ filtering: { keepSectionOrder: true } }, sectioned()), "apple")).toEqual([
    "xxapple",
    "apple",
  ]);
});

test("filtering: false or an owned search shows everything and forwards the text", () => {
  const children = [item("b"), item("a")];
  expect(ids(dropdown({ filtering: false }, children), "zzz")).toEqual(["b", "a"]);
  const owned = dropdown({ onSearchTextChange: { $handler: "search" } }, children);
  expect(ids(owned, "zzz")).toEqual(["b", "a"]);
  expect(searchDispatch(owned, "zzz")).toEqual({
    event: { node: "dd", handler: "search", args: ["zzz"] },
    delayMs: 0,
  });
  expect(searchDispatch(dropdown({}, children), "zzz")).toBeUndefined();
});
