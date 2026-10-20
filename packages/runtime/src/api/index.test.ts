import { expect, test } from "bun:test";
import { createElement as h } from "react";
import { createSceneRoot, type SceneSnapshot } from "../reconciler/index.ts";
import { setCapabilityRequester } from "./capability.ts";
import { Action, Clipboard, CopyToClipboard, List, ActionPanel } from "./index.ts";

// @covers List
// @covers List.Props
// @covers List.Item
// @covers List.Section
// @covers List.EmptyView
// @covers ActionPanel
// @covers ActionPanel.Props
// @covers ActionPanel.Children

function setup() {
  const scenes: SceneSnapshot[] = [];
  const root = createSceneRoot({ publish: (scene) => scenes.push(scene) });
  return { root, latest: () => scenes.at(-1)!.root! };
}

function byType(node: ReturnType<ReturnType<typeof setup>["latest"]>, type: string) {
  const found = node.children.filter((child) => child.type === type);
  expect(found.length).toBeGreaterThan(0);
  return found;
}

// Lives at module scope: it only echoes its argument for dispatch assertions.
const echoSelection = (id: string | null) => id;
const failingRequester = () => Promise.reject(new Error("host refused"));

// @covers List.Props.navigationTitle
// @covers List.Props.isLoading
// @covers List.Props.searchText
// @covers List.Props.searchBarPlaceholder
// @covers List.Props.isShowingDetail
// @covers List.Props.selectedItemId
// @covers List.Props.onSelectionChange
// @covers List.Props.children
// @covers List.Props.actions
// @covers List.Props.searchBarAccessory
test("renders List passthrough props, children and element props as trailing Slots", () => {
  const { root, latest } = setup();
  const onSelectionChange = echoSelection;
  root.render(
    h(
      List,
      {
        navigationTitle: "Pulls",
        isLoading: true,
        searchText: "q",
        searchBarPlaceholder: "Search…",
        isShowingDetail: false,
        selectedItemId: "one",
        onSelectionChange,
        actions: h(ActionPanel, { title: "Panel" }),
        searchBarAccessory: h("List.Dropdown", { tooltip: "Filter" }),
      },
      h(List.Item, { id: "one", title: "One" }),
    ),
  );
  const list = latest();
  expect(list.type).toBe("List");
  expect(list.props).toEqual({
    navigationTitle: "Pulls",
    isLoading: true,
    searchText: "q",
    searchBarPlaceholder: "Search…",
    isShowingDetail: false,
    selectedItemId: "one",
    onSelectionChange: { $handler: "onSelectionChange" },
  });
  expect(list.children.map((child) => child.type)).toEqual(["List.Item", "Slot", "Slot"]);
  const [actionsSlot, accessorySlot] = byType(list, "Slot");
  expect(actionsSlot!.props).toEqual({ name: "actions" });
  expect(actionsSlot!.children).toHaveLength(1);
  expect(actionsSlot!.children[0]!.type).toBe("ActionPanel");
  expect(actionsSlot!.children[0]!.props).toEqual({ title: "Panel" });
  expect(accessorySlot!.props).toEqual({ name: "searchBarAccessory" });
  expect(accessorySlot!.children[0]!.type).toBe("List.Dropdown");
  expect(root.dispatch(list.id, "onSelectionChange", [null])).toBeNull();
  expect(root.dispatch(list.id, "onSelectionChange", ["one"])).toBe("one");
  root.unmount();
});

// @covers List.Item.Props.id
// @covers List.Item.Props.title
// @covers List.Item.Props.subtitle
// @covers List.Item.Props.keywords
// @covers List.Item.Props.icon
// @covers List.Item.Props.actions
// @covers List.Item.Props.detail
test("renders List.Item with JSON props and actions/detail Slots", () => {
  const { root, latest } = setup();
  root.render(
    h(List.Item, {
      id: "pr-1",
      title: { value: "Docs", tooltip: "The docs PR" },
      subtitle: { value: "#1", tooltip: "Number" },
      keywords: ["documentation"],
      icon: { source: "avatar.png", tintColor: "red" },
      actions: h(ActionPanel, null, h(Action, { title: "Go" })),
      detail: h("List.Item.Detail", { markdown: "Body" }),
    }),
  );
  const item = latest();
  expect(item.type).toBe("List.Item");
  expect(item.props).toEqual({
    id: "pr-1",
    title: { value: "Docs", tooltip: "The docs PR" },
    subtitle: { value: "#1", tooltip: "Number" },
    keywords: ["documentation"],
    icon: { source: "avatar.png", tintColor: "red" },
  });
  expect(item.children.map((child) => [child.type, child.props])).toEqual([
    ["Slot", { name: "actions" }],
    ["Slot", { name: "detail" }],
  ]);
  const [actionsSlot, detailSlot] = item.children;
  expect(actionsSlot!.children[0]!.type).toBe("ActionPanel");
  expect(actionsSlot!.children[0]!.children[0]!.type).toBe("Action");
  expect(detailSlot!.children[0]!.type).toBe("List.Item.Detail");
  root.unmount();
});

// @covers List.Section.Props.title
// @covers List.Section.Props.subtitle
// @covers List.Section.Props.children
test("renders List.Section above its items", () => {
  const { root, latest } = setup();
  root.render(
    h(
      List.Section,
      { title: "Lager", subtitle: "Bottom fermented" },
      h(List.Item, { title: "Camden" }),
    ),
  );
  const section = latest();
  expect(section.type).toBe("List.Section");
  expect(section.props).toEqual({ title: "Lager", subtitle: "Bottom fermented" });
  expect(section.children.map((child) => child.type)).toEqual(["List.Item"]);
  expect(section.children[0]!.props).toEqual({ title: "Camden" });
  root.unmount();
});

// @covers List.EmptyView.Props.title
// @covers List.EmptyView.Props.description
// @covers List.EmptyView.Props.icon
// @covers List.EmptyView.Props.actions
test("renders List.EmptyView with its own actions Slot", () => {
  const { root, latest } = setup();
  root.render(
    h(List.EmptyView, {
      title: "Nothing here",
      description: "Try another query",
      icon: "empty.png",
      actions: h(ActionPanel, null, h(Action, { title: "Reset" })),
    }),
  );
  const empty = latest();
  expect(empty.type).toBe("List.EmptyView");
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

// @covers ActionPanel.Props.title
// @covers ActionPanel.Props.children
// @covers ActionPanel.Section
// @covers ActionPanel.Section.Props
// @covers ActionPanel.Section.Props.title
// @covers ActionPanel.Section.Props.children
// @covers ActionPanel.Section.Children
// @covers Action
// @covers Action.Props
// @covers Action.Props.id
// @covers Action.Props.title
// @covers Action.Props.icon
// @covers Action.Props.shortcut
// @covers Action.Props.autoFocus
// @covers Action.Props.onAction
test("renders ActionPanel sections and dispatches plain Action onAction", () => {
  const { root, latest } = setup();
  root.render(
    h(
      ActionPanel,
      { title: "Panel" },
      h(
        ActionPanel.Section,
        { title: "Copy" },
        h(Action, {
          id: "go",
          title: "Go",
          icon: { fileIcon: "main.ts" },
          shortcut: { modifiers: ["cmd"], key: "g" },
          autoFocus: true,
          onAction: () => "done",
        }),
      ),
    ),
  );
  const panel = latest();
  expect(panel.type).toBe("ActionPanel");
  expect(panel.props).toEqual({ title: "Panel" });
  const section = panel.children[0]!;
  expect(section.type).toBe("ActionPanel.Section");
  expect(section.props).toEqual({ title: "Copy" });
  const action = section.children[0]!;
  expect(action.type).toBe("Action");
  expect(action.props).toEqual({
    id: "go",
    title: "Go",
    icon: { fileIcon: "main.ts" },
    shortcut: { modifiers: ["cmd"], key: "g" },
    autoFocus: true,
    onAction: { $handler: "onAction" },
  });
  expect(root.dispatch(action.id, "onAction", [])).toBe("done");
  root.unmount();
});

// @covers Action.CopyToClipboard
// @covers Action.CopyToClipboard.Props
// @covers Action.CopyToClipboard.Props.title
// @covers Action.CopyToClipboard.Props.icon
// @covers Action.CopyToClipboard.Props.shortcut
// @covers Action.CopyToClipboard.Props.transient
// @covers Action.CopyToClipboard.Props.concealed
// @covers Action.CopyToClipboard.Props.content
test("CopyToClipboard passes props through, defaults its title, keeps content private", () => {
  const { root, latest } = setup();
  root.render(h(CopyToClipboard, { content: "#1" }));
  expect(latest().type).toBe("Action.CopyToClipboard");
  expect(latest().props).toEqual({
    title: "Copy to Clipboard",
    onAction: { $handler: "onAction" },
  });
  root.render(
    h(CopyToClipboard, {
      content: { text: "secret" },
      title: "Copy token",
      icon: "clipboard.png",
      shortcut: { modifiers: ["shift"], key: "c" },
      transient: true,
      concealed: true,
    }),
  );
  // `transient` is the deprecated copy flag: it travels with the request, not
  // in the scene, while `concealed` stays visible to clients.
  expect(latest().props).toEqual({
    title: "Copy token",
    icon: "clipboard.png",
    shortcut: { modifiers: ["shift"], key: "c" },
    concealed: true,
    onAction: { $handler: "onAction" },
  });
  root.unmount();
});

// @covers Action.CopyToClipboard.Props.transient
// @covers Action.CopyToClipboard.Props.onCopy
// @covers Clipboard.copy
test("dispatching CopyToClipboard requests clipboard.copy, then calls onCopy", async () => {
  const events: string[] = [];
  setCapabilityRequester(async (name, params) => {
    events.push(`request ${name} ${JSON.stringify(params)}`);
    return null;
  });
  const { root, latest } = setup();
  root.render(
    h(CopyToClipboard, {
      content: "hello",
      transient: true,
      onCopy: (content) => events.push(`onCopy ${content}`),
    }),
  );
  expect(latest().type).toBe("Action.CopyToClipboard");
  await root.dispatch(latest().id, "onAction", []);
  expect(events).toEqual([
    'request clipboard.copy {"text":"hello","transient":true}',
    "onCopy hello",
  ]);
  root.unmount();
});

// @covers Clipboard.copy
test("Clipboard.copy rejects clearly without a capability requester", async () => {
  setCapabilityRequester(undefined);
  await expect(Clipboard.copy("x")).rejects.toThrow(
    "Cannot request capability 'clipboard.copy': no capability requester is installed",
  );
});

// @covers Action.CopyToClipboard.Props.onCopy
test("onCopy is not called when the copy capability fails", async () => {
  setCapabilityRequester(failingRequester);
  let copied = false;
  const { root, latest } = setup();
  root.render(h(CopyToClipboard, { content: "x", onCopy: () => (copied = true) }));
  await expect(root.dispatch(latest().id, "onAction", [])).rejects.toThrow("host refused");
  expect(copied).toBe(false);
  root.unmount();
});
