import { expect, test } from "bun:test";
import { createElement as h } from "react";
import { createSceneRoot, type SceneSnapshot } from "../reconciler/index.ts";
import { Action, ActionPanel, Grid } from "./index.ts";

// @covers Grid partial
// @covers Grid.Props partial
// @covers Grid.Props.navigationTitle
// @covers Grid.Props.isLoading
// @covers Grid.Props.searchText
// @covers Grid.Props.searchBarPlaceholder
// @covers Grid.Props.filtering partial
// @covers Grid.Props.filtering.keepSectionOrder partial
// @covers Grid.Props.enableFiltering
// @covers Grid.Props.throttle
// @covers Grid.Props.onSearchTextChange
// @covers Grid.Props.onSelectionChange
// @covers Grid.Props.selectedItemId
// @covers Grid.Props.columns
// @covers Grid.Props.itemSize
// @covers Grid.Props.aspectRatio
// @covers Grid.Props.fit
// @covers Grid.Props.inset
// @covers Grid.Props.pagination
// @covers Grid.Props.pagination.pageSize
// @covers Grid.Props.pagination.hasMore
// @covers Grid.Props.pagination.onLoadMore
// @covers Grid.Props.children
// @covers Grid.Props.actions
// @covers Grid.Props.searchBarAccessory
// @covers Grid.ItemSize
// @covers Grid.Fit
// @covers Grid.Inset
// @covers Grid.AspectRatio

function setup() {
  const scenes: SceneSnapshot[] = [];
  const root = createSceneRoot({ publish: (scene) => scenes.push(scene) });
  return { root, latest: () => scenes.at(-1)!.root! };
}

// Lives at module scope: it only echoes its argument for dispatch assertions.
const echo = (value: string | null) => value;
const echoText = (text: string) => text;
const loadMore = () => "more";

test("Grid exposes the declared enum values", () => {
  expect(Grid.ItemSize).toEqual({ Small: "small", Medium: "medium", Large: "large" });
  expect(Grid.Inset).toEqual({ Zero: "zero", Small: "sm", Medium: "md", Large: "lg" });
  expect(Grid.Fit).toEqual({ Contain: "contain", Fill: "fill" });
});

test("renders Grid passthrough props, children and element props as trailing Slots", () => {
  const { root, latest } = setup();
  root.render(
    h(
      Grid,
      {
        navigationTitle: "Beers",
        isLoading: true,
        searchText: "q",
        searchBarPlaceholder: "Search…",
        filtering: { keepSectionOrder: true },
        enableFiltering: true,
        throttle: true,
        onSearchTextChange: echoText,
        onSelectionChange: echo,
        selectedItemId: "one",
        columns: 6,
        itemSize: Grid.ItemSize.Medium,
        aspectRatio: "3/2",
        fit: Grid.Fit.Fill,
        inset: Grid.Inset.Small,
        pagination: { pageSize: 50, hasMore: true, onLoadMore: loadMore },
        actions: h(ActionPanel, { title: "Panel" }),
        searchBarAccessory: h("Grid.Dropdown", { tooltip: "Filter" }),
      },
      h(Grid.Item, { content: "star.png", title: "One" }),
    ),
  );
  const grid = latest();
  expect(grid.type).toBe("Grid");
  expect(grid.props).toEqual({
    navigationTitle: "Beers",
    isLoading: true,
    searchText: "q",
    searchBarPlaceholder: "Search…",
    filtering: { keepSectionOrder: true },
    enableFiltering: true,
    throttle: true,
    onSearchTextChange: { $handler: "onSearchTextChange" },
    onSelectionChange: { $handler: "onSelectionChange" },
    selectedItemId: "one",
    columns: 6,
    itemSize: "medium",
    aspectRatio: "3/2",
    fit: "fill",
    inset: "sm",
    pagination: {
      pageSize: 50,
      hasMore: true,
      onLoadMore: { $handler: "pagination.onLoadMore" },
    },
  });
  expect(grid.children.map((child) => child.type)).toEqual(["Grid.Item", "Slot", "Slot"]);
  const [actionsSlot, accessorySlot] = grid.children.filter((child) => child.type === "Slot");
  expect(actionsSlot!.props).toEqual({ name: "actions" });
  expect(actionsSlot!.children[0]!.type).toBe("ActionPanel");
  expect(accessorySlot!.props).toEqual({ name: "searchBarAccessory" });
  expect(accessorySlot!.children[0]!.type).toBe("Grid.Dropdown");
  expect(root.dispatch(grid.id, "onSelectionChange", [null])).toBeNull();
  expect(root.dispatch(grid.id, "onSelectionChange", ["one"])).toBe("one");
  expect(root.dispatch(grid.id, "onSearchTextChange", ["ale"])).toBe("ale");
  expect(root.dispatch(grid.id, "pagination.onLoadMore", [])).toBe("more");
  root.unmount();
});

// @covers Grid.Item
// @covers Grid.Item.Props
// @covers Grid.Item.Props.id
// @covers Grid.Item.Props.title
// @covers Grid.Item.Props.subtitle
// @covers Grid.Item.Props.keywords
// @covers Grid.Item.Props.content
// @covers Grid.Item.Props.content.color
// @covers Grid.Item.Props.content.tooltip
// @covers Grid.Item.Props.content.value
// @covers Grid.Item.Props.content.value.color
// @covers Grid.Item.Props.accessory
// @covers Grid.Item.Accessory
// @covers Grid.Item.Accessory.icon
// @covers Grid.Item.Accessory.tooltip
// @covers Grid.Item.Props.quickLook
// @covers Grid.Item.Props.quickLook.name
// @covers Grid.Item.Props.quickLook.path
// @covers Grid.Item.Props.actions
test("renders Grid.Item content in every declared form and an actions Slot", () => {
  const { root, latest } = setup();
  root.render(
    h(
      Grid,
      null,
      h(Grid.Item, { key: "a", content: "star.png", title: "String content" }),
      h(Grid.Item, {
        key: "b",
        content: { source: "avatar.png", tintColor: "red" },
        title: "Image content",
      }),
      h(Grid.Item, { key: "c", content: { color: "#ff0000" }, title: "Color content" }),
      h(Grid.Item, {
        key: "d",
        content: { value: "hidden.png", tooltip: "A star" },
        title: "Tooltipped image",
      }),
      h(Grid.Item, {
        key: "e",
        content: { value: { color: { light: "#fff", dark: "#000" } }, tooltip: "Tinted" },
        title: "Tooltipped color",
      }),
      h(Grid.Item, {
        key: "f",
        id: "pr-1",
        content: "star.png",
        title: "Everything",
        subtitle: "0.5 L",
        keywords: ["beer"],
        accessory: { icon: "hammer.png", tooltip: "8% ABV" },
        quickLook: { name: "label.png", path: "/tmp/label.png" },
        actions: h(ActionPanel, null, h(Action, { title: "Go" })),
      }),
    ),
  );
  const grid = latest();
  expect(grid.children.map((child) => child.props.content)).toEqual([
    "star.png",
    { source: "avatar.png", tintColor: "red" },
    { color: "#ff0000" },
    { value: "hidden.png", tooltip: "A star" },
    { value: { color: { light: "#fff", dark: "#000" } }, tooltip: "Tinted" },
    "star.png",
  ]);
  const item = grid.children[5]!;
  expect(item.type).toBe("Grid.Item");
  expect(item.props).toEqual({
    id: "pr-1",
    content: "star.png",
    title: "Everything",
    subtitle: "0.5 L",
    keywords: ["beer"],
    accessory: { icon: "hammer.png", tooltip: "8% ABV" },
    quickLook: { name: "label.png", path: "/tmp/label.png" },
  });
  const [actionsSlot] = item.children;
  expect(actionsSlot!.type).toBe("Slot");
  expect(actionsSlot!.props).toEqual({ name: "actions" });
  expect(actionsSlot!.children[0]!.type).toBe("ActionPanel");
  expect(actionsSlot!.children[0]!.children[0]!.type).toBe("Action");
  root.unmount();
});

// @covers Grid.Item.Props.accessory
test("an accessory with only a tooltip passes through as JSON", () => {
  const { root, latest } = setup();
  root.render(h(Grid.Item, { content: "star.png", accessory: { tooltip: "shh" } }));
  expect(latest().props).toEqual({ content: "star.png", accessory: { tooltip: "shh" } });
  root.unmount();
});

// @covers Grid.Section
// @covers Grid.Section.Props
// @covers Grid.Section.Props.children
// @covers Grid.Section.Props.title
// @covers Grid.Section.Props.subtitle
// @covers Grid.Section.Props.columns
// @covers Grid.Section.Props.aspectRatio
// @covers Grid.Section.Props.fit
// @covers Grid.Section.Props.inset
test("renders Grid.Section with layout props above its items", () => {
  const { root, latest } = setup();
  root.render(
    h(
      Grid.Section,
      {
        title: "Lager",
        subtitle: "Bottom fermented",
        columns: 4,
        aspectRatio: "16/9",
        fit: Grid.Fit.Contain,
        inset: Grid.Inset.Large,
      },
      h(Grid.Item, { content: "star.png", title: "Camden" }),
    ),
  );
  const section = latest();
  expect(section.type).toBe("Grid.Section");
  expect(section.props).toEqual({
    title: "Lager",
    subtitle: "Bottom fermented",
    columns: 4,
    aspectRatio: "16/9",
    fit: "contain",
    inset: "lg",
  });
  expect(section.children.map((child) => child.type)).toEqual(["Grid.Item"]);
  expect(section.children[0]!.props).toEqual({ content: "star.png", title: "Camden" });
  root.unmount();
});

// @covers Grid.EmptyView
// @covers Grid.EmptyView.Props.title
// @covers Grid.EmptyView.Props.description
// @covers Grid.EmptyView.Props.icon
// @covers Grid.EmptyView.Props.actions
test("renders Grid.EmptyView with its own actions Slot", () => {
  const { root, latest } = setup();
  root.render(
    h(Grid.EmptyView, {
      title: "Nothing here",
      description: "Try another query",
      icon: "empty.png",
      actions: h(ActionPanel, null, h(Action, { title: "Reset" })),
    }),
  );
  const empty = latest();
  expect(empty.type).toBe("Grid.EmptyView");
  expect(empty.props).toEqual({
    title: "Nothing here",
    description: "Try another query",
    icon: "empty.png",
  });
  expect(empty.children.map((child) => child.type)).toEqual(["Slot"]);
  expect(empty.children[0]!.props).toEqual({ name: "actions" });
  expect(empty.children[0]!.children[0]!.type).toBe("ActionPanel");
  root.unmount();
});

// @covers Grid.Dropdown partial
// @covers Grid.Dropdown.Props.tooltip
// @covers Grid.Dropdown.Props.children
// @covers Grid.Dropdown.Props.value
// @covers Grid.Dropdown.Props.defaultValue
// @covers Grid.Dropdown.Props.storeValue partial
// @covers Grid.Dropdown.Props.onChange
// @covers Grid.Dropdown.Props.placeholder
// @covers Grid.Dropdown.Props.id
// @covers Grid.Dropdown.Props.isLoading
// @covers Grid.Dropdown.Props.throttle
// @covers Grid.Dropdown.Props.filtering partial
// @covers Grid.Dropdown.Props.onSearchTextChange
// @covers Grid.Dropdown.Item
// @covers Grid.Dropdown.Item.Props
// @covers Grid.Dropdown.Item.Props.value
// @covers Grid.Dropdown.Item.Props.title
// @covers Grid.Dropdown.Item.Props.icon
// @covers Grid.Dropdown.Item.Props.keywords
// @covers Grid.Dropdown.Section
// @covers Grid.Dropdown.Section.Props
// @covers Grid.Dropdown.Section.Props.title
// @covers Grid.Dropdown.Section.Props.children
test("Grid.Dropdown renders into the searchBarAccessory Slot and dispatches onChange", () => {
  const { root, latest } = setup();
  root.render(
    h(Grid, {
      searchBarAccessory: h(
        Grid.Dropdown,
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
          Grid.Dropdown.Section,
          { title: "Alcoholic" },
          h(Grid.Dropdown.Item, {
            value: "beer",
            title: "Beer",
            icon: "beer.png",
            keywords: ["lager"],
          }),
        ),
        h(Grid.Dropdown.Item, { value: "water", title: "Water" }),
      ),
    }),
  );
  const slot = latest().children.find((child) => child.type === "Slot")!;
  expect(slot.props).toEqual({ name: "searchBarAccessory" });
  const dropdown = slot.children[0]!;
  expect(dropdown.type).toBe("Grid.Dropdown");
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
  expect(section!.type).toBe("Grid.Dropdown.Section");
  expect(section!.props).toEqual({ title: "Alcoholic" });
  const sectionItem = section!.children[0]!;
  expect(sectionItem.type).toBe("Grid.Dropdown.Item");
  expect(sectionItem.props).toEqual({
    value: "beer",
    title: "Beer",
    icon: "beer.png",
    keywords: ["lager"],
  });
  expect(item!.type).toBe("Grid.Dropdown.Item");
  expect(item!.props).toEqual({ value: "water", title: "Water" });
  expect(root.dispatch(dropdown.id, "onChange", ["wine"])).toBe("wine");
  expect(root.dispatch(dropdown.id, "onSearchTextChange", ["wh"])).toBe("wh");
  root.unmount();
});
