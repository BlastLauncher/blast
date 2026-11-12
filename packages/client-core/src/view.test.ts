// @covers List.EmptyView.Props.actions
import { expect, test } from "bun:test";
import type { SceneMessage, SceneNode } from "@blastlauncher/protocol";
import { sceneToView } from "./view.ts";

function node(
  type: string,
  id: string,
  props: SceneNode["props"] = {},
  children: SceneNode[] = [],
): SceneNode {
  return { type, id, props, children };
}
const item = (id: string, props: SceneNode["props"] = {}) =>
  node("List.Item", id, { title: id, ...props });
function scene(props: SceneNode["props"] = {}): SceneMessage {
  return {
    type: "scene",
    revision: 1,
    root: node("Navigation", "nav", {}, [
      node("Navigation.Entry", "old", { active: false }, [item("hidden")]),
      node("Navigation.Entry", "entry", { active: true }, [
        node("List", "list", props, [
          node("List.Section", "section-a", { title: "First" }, [
            item("apple", { subtitle: "green" }),
            item("banana", { keywords: ["yellow"] }),
          ]),
          node("List.Section", "section-b", { title: "Second" }, [item("cherry")]),
          node("List.EmptyView", "empty", { title: "Nothing here", description: "Try again" }),
        ]),
      ]),
    ]),
  };
}

test("client substring filtering covers title, subtitle and keywords, preserves sections and chooses visible selection", () => {
  for (const [query, expected] of [
    ["APP", "apple"],
    ["GREEN", "apple"],
    ["YELLOW", "banana"],
  ] as const) {
    const view = sceneToView(scene(), { searchText: query, selectedId: "cherry" });
    expect(view.items.map((entry) => entry.id)).toEqual([expected]);
    expect(view.rows[0]?.text).toBe("First");
    expect(view.selected?.id).toBe(expected);
  }
  const view = sceneToView(scene(), { searchText: "", selectedId: "cherry" });
  expect(view.rows.map((row) => row.node.id)).toEqual([
    "section-a",
    "apple",
    "banana",
    "section-b",
    "cherry",
  ]);
  expect(view.selected?.id).toBe("cherry");
  expect(sceneToView(scene(), { searchText: "absent", selectedId: null }).emptyText).toBe(
    "Nothing here  Try again",
  );
});

test("extension filtering and disabled filtering preserve items; selectedItemId takes precedence", () => {
  for (const props of [{ filtering: false }, { onSearchTextChange: { $handler: "search" } }]) {
    expect(
      sceneToView(scene(props), { searchText: "absent", selectedId: null }).items,
    ).toHaveLength(3);
  }
  expect(
    sceneToView(scene({ selectedItemId: "banana" }), { searchText: "", selectedId: "cherry" })
      .selected?.id,
  ).toBe("banana");
});

test("unknown views and nodes are visible; primary action resolves Slots and falls back to List actions", () => {
  const action = node("Action", "run", { onAction: { $handler: "run" } });
  const actions = node("Slot", "actions", { name: "actions" }, [
    node("ActionPanel", "panel", {}, [action]),
  ]);
  const value: SceneMessage = {
    type: "scene",
    revision: 1,
    root: node("List", "list", { isLoading: true }, [
      item("apple"),
      node("Future", "future"),
      actions,
    ]),
  };
  let view = sceneToView(value, { searchText: "", selectedId: null });
  expect(view.primary).toBe(action);
  expect(view.rows[1]?.text).toBe("[Unsupported: Future]");
  expect(view.rows[1]).toMatchObject({
    title: "Future",
    item: false,
    unsupported: true,
  });
  expect(view.loading).toBe(true);
  value.root!.children[0]!.children.push(
    node("Slot", "own", { name: "actions" }, [node("Action.SubmitForm", "own-action")]),
  );
  view = sceneToView(value, { searchText: "", selectedId: null });
  expect(view.primary?.id).toBe("own-action");
  value.root = node("Future", "future");
  expect(sceneToView(value, { searchText: "", selectedId: null }).rows[0]?.text).toBe(
    "[Unsupported: Future]",
  );
});

test("detail metadata, panel sections and terminal shortcuts", async () => {
  const { detailText, actionRows } = await import("./view.ts");
  const { matchesShortcut, shortcutLabel } = await import("./shortcut.ts");
  const detail = node("Detail", "d", { markdown: "# Heading\nBody" }, [
    node("Detail.Metadata", "m", {}, [
      node("Detail.Metadata.Label", "l", { title: "Author", text: "Ada" }),
    ]),
  ]);
  expect(detailText(detail)).toBe("# Heading\nBody\nAuthor: Ada");
  expect(detailText(node("Slot", "detail-slot", { name: "detail" }, [detail]))).toBe(
    "# Heading\nBody\nAuthor: Ada",
  );
  const shortcut = { modifiers: ["ctrl"], key: "a" };
  expect(shortcutLabel(shortcut)).toBe("Ctrl+A");
  expect(matchesShortcut(shortcut, { name: "a", ctrl: true })).toBe(true);
  expect(matchesShortcut(shortcut, { name: "a", ctrl: true, shift: true })).toBe(false);
  expect(shortcutLabel({ modifiers: ["bogus"], key: "a" })).toBe("");
  const rows = actionRows(
    node("ActionPanel", "p", {}, [
      node("ActionPanel.Section", "s", { title: "Section" }, [
        node("Action", "a", { title: "Run", shortcut }),
      ]),
    ]),
    "ru",
  );
  expect(rows.map((row) => row.text.trim())).toEqual(["Section", "Run Ctrl+A"]);
});

test("the command title is the fallback when the scene has no navigation title", () => {
  const state = { searchText: "", selectedId: null, fallbackTitle: "View People" };
  expect(sceneToView(scene(), state).title).toBe("View People");
  expect(sceneToView(scene({ navigationTitle: "Humaans People" }), state).title).toBe(
    "Humaans People",
  );
  expect(sceneToView(scene(), { searchText: "", selectedId: null }).title).toBe("Blast");
});

const panel = (id: string) =>
  node("Slot", "slot-actions", { name: "actions" }, [
    node("ActionPanel", `${id}-panel`, {}, [node("Action", id, { title: id })]),
  ]);

const withEmptyView = (children: SceneNode[]): SceneMessage => ({
  type: "scene",
  revision: 1,
  root: node("List", "list", {}, [
    panel("list-action"),
    ...children,
    node("List.EmptyView", "empty", { title: "Nothing" }, [panel("restart")]),
  ]),
});

test("an empty list's EmptyView actions are the panel and primary, over the list's own", () => {
  const empty = sceneToView(withEmptyView([]), { searchText: "", selectedId: null });
  expect(empty.actions?.id).toBe("slot-actions");
  expect(empty.actions?.children[0]?.id).toBe("restart-panel");
  expect(empty.primary?.id).toBe("restart");
  // Once a row exists the EmptyView is hidden and the list's actions apply.
  const full = sceneToView(withEmptyView([item("row")]), { searchText: "", selectedId: null });
  expect(full.primary?.id).toBe("list-action");
});
