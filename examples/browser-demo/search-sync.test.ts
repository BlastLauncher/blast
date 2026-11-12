import { expect, test } from "bun:test";
import { controlledSearchText, syncAttributes, type AttributeTarget } from "./search-sync.ts";

function element(attributes: Record<string, string>): AttributeTarget & {
  attributes: Record<string, string>;
} {
  return {
    attributes,
    getAttributeNames: () => Object.keys(attributes),
    getAttribute: (name) => attributes[name] ?? null,
    setAttribute: (name, value) => void (attributes[name] = value),
    removeAttribute: (name) => void delete attributes[name],
  };
}

// @covers List.Props.searchBarPlaceholder
test("a kept control takes the new markup's attributes but keeps its live value and style", () => {
  const previous = element({
    id: "search",
    placeholder: "Search…",
    value: "typed",
    style: "width: 10px",
    readonly: "",
  });
  syncAttributes(
    previous,
    element({ id: "search", placeholder: "Type here", value: "", "aria-label": "Search" }),
  );
  expect(previous.attributes).toEqual({
    id: "search",
    placeholder: "Type here",
    value: "typed",
    style: "width: 10px",
    "aria-label": "Search",
  });
});

const sync = (field: string, view: string, baseline: string, composing = false) =>
  controlledSearchText({ field, view, baseline, composing });

// @covers List.Props.searchText
test("the field takes the extension's search text only when the controller changed it", () => {
  // The extension cleared the field at the end of a round.
  expect(sync("red fox", "", "red fox")).toBe("");
  // A new view replaced the text.
  expect(sync("old", "", "old")).toBe("");
  // Already in step: nothing to write.
  expect(sync("red", "red", "re")).toBeUndefined();
  // The controller did not move (it refused or has not caught up): the visitor's
  // keystrokes stay, however far ahead of the controller they are.
  expect(sync("red fox", "red", "red")).toBeUndefined();
  // An open IME composition is never replaced.
  expect(sync("にほ", "", "にほ", true)).toBeUndefined();
});
