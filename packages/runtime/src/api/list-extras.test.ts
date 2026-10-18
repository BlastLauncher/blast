import { expect, test } from "bun:test";
import { createElement as h } from "react";
import { createSceneRoot, type SceneSnapshot } from "../reconciler/index.ts";
import { Action, List } from "./index.ts";

// @covers List.Item.Props.accessories
// @covers List.Item.Accessory
// @covers List.Item.Accessory.date
// @covers List.Item.Accessory.date.color
// @covers List.Item.Accessory.date.value
// @covers List.Item.Accessory.icon
// @covers List.Item.Accessory.tag
// @covers List.Item.Accessory.tag.color
// @covers List.Item.Accessory.tag.value
// @covers List.Item.Accessory.text
// @covers List.Item.Accessory.text.color
// @covers List.Item.Accessory.text.value
// @covers List.Item.Accessory.tooltip
// @covers List.Props.onSearchTextChange
// @covers List.Props.throttle
// @covers List.Props partial
// @covers List.Props.filtering.keepSectionOrder partial
// @covers List.Props.filtering partial
// @covers List.Dropdown partial
// @covers List.Dropdown.Props partial
// @covers List.Dropdown.Props.tooltip
// @covers List.Dropdown.Props.children
// @covers List.Dropdown.Props.value
// @covers List.Dropdown.Props.defaultValue
// @covers List.Dropdown.Props.storeValue partial
// @covers List.Dropdown.Props.onChange
// @covers List.Dropdown.Props.placeholder
// @covers List.Dropdown.Props.id
// @covers List.Dropdown.Props.isLoading
// @covers List.Dropdown.Props.throttle
// @covers List.Dropdown.Props.filtering partial
// @covers List.Dropdown.Props.onSearchTextChange
// @covers List.Dropdown.Item
// @covers List.Dropdown.Item.Props
// @covers List.Dropdown.Item.Props.value
// @covers List.Dropdown.Item.Props.title
// @covers List.Dropdown.Item.Props.icon
// @covers List.Dropdown.Item.Props.keywords
// @covers List.Dropdown.Section
// @covers List.Dropdown.Section.Props
// @covers List.Dropdown.Section.Props.title
// @covers List.Dropdown.Section.Props.children
// @covers Action.Style
// @covers Action.Props.style

function setup() {
  const scenes: SceneSnapshot[] = [];
  const root = createSceneRoot({ publish: (scene) => scenes.push(scene) });
  return { root, latest: () => scenes.at(-1)!.root! };
}

// Lives at module scope: it only echoes its argument for dispatch assertions.
const echoText = (text: string) => text;

test("accessories serialize text, tag, { value, color } forms and icons", () => {
  const { root, latest } = setup();
  root.render(
    h(List.Item, {
      title: "Beer",
      accessories: [
        { text: "Germany" },
        { text: { value: "Strong", color: "raycast-red" }, icon: "hammer.png", tooltip: "8% ABV" },
        { date: new Date(0) },
        { date: { value: new Date(0), color: "raycast-blue" } },
        { tag: "tagged" },
        { tag: new Date(0) },
        { tag: { value: "malt", color: { light: "#fff", dark: "#000" } } },
        { icon: "star.png" },
        { icon: "hidden.png", tooltip: "shh" },
      ],
    }),
  );
  const epoch = "1970-01-01T00:00:00.000Z";
  expect(latest().props.accessories).toEqual([
    { text: "Germany" },
    { text: { value: "Strong", color: "raycast-red" }, icon: "hammer.png", tooltip: "8% ABV" },
    { date: epoch },
    { date: { value: epoch, color: "raycast-blue" } },
    { tag: "tagged" },
    { tag: epoch },
    { tag: { value: "malt", color: { light: "#fff", dark: "#000" } } },
    { icon: "star.png" },
    { icon: "hidden.png", tooltip: "shh" },
  ]);
  root.unmount();
});

// @covers List.Item.Props.accessories
test("null and empty accessories pass through as JSON", () => {
  const { root, latest } = setup();
  root.render(h(List.Item, { title: "Plain", accessories: null }));
  root.render(h(List.Item, { title: "Also plain", accessories: [] }));
  expect(latest().props).toEqual({ title: "Also plain", accessories: [] });
  root.unmount();
});

// @covers List.Props.onSearchTextChange
// @covers List.Props.throttle
// @covers List.Props.filtering partial
test("List declares the search handler with throttle and filtering", () => {
  const { root, latest } = setup();
  root.render(
    h(List, {
      searchText: "q",
      throttle: true,
      filtering: { keepSectionOrder: true },
      onSearchTextChange: echoText,
    }),
  );
  const list = latest();
  expect(list.props).toEqual({
    searchText: "q",
    throttle: true,
    filtering: { keepSectionOrder: true },
    onSearchTextChange: { $handler: "onSearchTextChange" },
  });
  expect(root.dispatch(list.id, "onSearchTextChange", ["beer"])).toBe("beer");
  root.unmount();
});

// @covers List.Dropdown partial
// @covers List.Dropdown.Props partial
// @covers List.Dropdown.Props.onChange
// @covers List.Dropdown.Props.storeValue partial
// @covers List.Dropdown.Props.onSearchTextChange
// @covers List.Dropdown.Item
// @covers List.Dropdown.Item.Props.value
// @covers List.Dropdown.Item.Props.title
// @covers List.Dropdown.Section
// @covers List.Dropdown.Section.Props.title
test("List.Dropdown renders into the searchBarAccessory Slot and dispatches onChange", () => {
  const { root, latest } = setup();
  root.render(
    h(List, {
      searchBarAccessory: h(
        List.Dropdown,
        {
          tooltip: "Filter",
          placeholder: "Drink…",
          value: "beer",
          defaultValue: "beer",
          storeValue: false,
          throttle: true,
          isLoading: true,
          id: "drink",
          filtering: false,
          onSearchTextChange: echoText,
          onChange: echoText,
        },
        h(
          List.Dropdown.Section,
          { title: "Alcoholic" },
          h(List.Dropdown.Item, {
            value: "beer",
            title: "Beer",
            icon: "beer.png",
            keywords: ["lager"],
          }),
        ),
        h(List.Dropdown.Item, { value: "water", title: "Water" }),
      ),
    }),
  );
  const slot = latest().children.find((child) => child.type === "Slot")!;
  expect(slot.props).toEqual({ name: "searchBarAccessory" });
  const dropdown = slot.children[0]!;
  expect(dropdown.type).toBe("List.Dropdown");
  expect(dropdown.props).toEqual({
    tooltip: "Filter",
    placeholder: "Drink…",
    value: "beer",
    defaultValue: "beer",
    storeValue: false,
    throttle: true,
    isLoading: true,
    id: "drink",
    filtering: false,
    onSearchTextChange: { $handler: "onSearchTextChange" },
    onChange: { $handler: "onChange" },
  });
  const [section, item] = dropdown.children;
  expect(section!.type).toBe("List.Dropdown.Section");
  expect(section!.props).toEqual({ title: "Alcoholic" });
  const sectionItem = section!.children[0]!;
  expect(sectionItem.type).toBe("List.Dropdown.Item");
  expect(sectionItem.props).toEqual({
    value: "beer",
    title: "Beer",
    icon: "beer.png",
    keywords: ["lager"],
  });
  expect(item!.type).toBe("List.Dropdown.Item");
  expect(item!.props).toEqual({ value: "water", title: "Water" });
  expect(root.dispatch(dropdown.id, "onChange", ["wine"])).toBe("wine");
  expect(root.dispatch(dropdown.id, "onSearchTextChange", ["wh"])).toBe("wh");
  root.unmount();
});

// @covers Action.Style
// @covers Action.Props.style
test("Action.Style exposes Regular and Destructive, and style serializes", () => {
  const { root, latest } = setup();
  expect(Action.Style.Regular).toBe("regular");
  expect(Action.Style.Destructive).toBe("destructive");
  root.render(
    h(Action, { title: "Delete", style: Action.Style.Destructive, onAction: () => "deleted" }),
  );
  expect(latest().props).toEqual({
    title: "Delete",
    style: "destructive",
    onAction: { $handler: "onAction" },
  });
  root.unmount();
});
