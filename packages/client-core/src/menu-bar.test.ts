// @covers MenuBarExtra
// @covers MenuBarExtra.Props
// @covers MenuBarExtra.Props.isLoading
import { expect, test } from "bun:test";
import type { HandlerRef, SceneMessage, SceneNode } from "@blastlauncher/protocol";
import { MENU_BAR_START, menuBarStep, menuBarView, menuRows } from "./menu-bar.ts";

const node = (
  id: string,
  type: string,
  props: SceneNode["props"] = {},
  children: SceneNode[] = [],
): SceneNode => ({ id, type, props, children });
const action = { $handler: "click" } satisfies HandlerRef;
const menu = (props: SceneNode["props"] = {}) =>
  node(
    "menu",
    "MenuBarExtra",
    { title: "Ready", tooltip: "Status", onSelectionChange: { $handler: "sel" }, ...props },
    [
      node("s", "MenuBarExtra.Section", { title: "Tools" }, [
        node("sub", "MenuBarExtra.Submenu", { title: "More" }, [
          node("click", "MenuBarExtra.Item", { title: "Click", onAction: action }),
        ]),
        node("off", "MenuBarExtra.Item", { title: "Disabled" }),
      ]),
      node("sep", "MenuBarExtra.Separator"),
      node("solo", "MenuBarExtra.Item", {
        title: "Solo",
        onAction: action,
        shortcut: {
          macOS: { modifiers: ["cmd"], key: "s" },
          Windows: { modifiers: ["ctrl"], key: "s" },
        },
      }),
    ],
  );
const sceneOf = (root: SceneNode): SceneMessage => ({ type: "scene", revision: 1, root });

test("menuRows flattens the level at path, marking disabled items", () => {
  const root = menuRows(menu(), []);
  expect(root.map((row) => row.text)).toEqual(["Tools", "More ›", "Disabled", "Solo  Ctrl+S"]);
  expect(root.map((row) => row.item)).toEqual([false, true, true, true]);
  expect(root.map((row) => row.disabled)).toEqual([true, false, true, false]);
  expect(menuRows(menu(), ["sub"]).map((row) => row.text)).toEqual(["Click"]);
  expect(menuRows(menu(), [], "macOS").at(-1)?.shortcut).toBe("⌘S");
  expect(menuRows(node("m", "MenuBarExtra"), [])).toEqual([]);
  expect(menuRows(node("l", "List"), [])).toEqual([]);
});

test("menuBarView exposes rows, the first item as selection, title and loading", () => {
  const view = menuBarView(sceneOf(menu({ isLoading: true })));
  expect(view.rows.map((row) => row.title)).toEqual(["Tools", "More", "Disabled", "Solo"]);
  expect(view.items.map((row) => row.node.id)).toEqual(["sub", "off", "solo"]);
  expect(view.selected?.node.id).toBe("sub");
  expect([view.isLoading, view.title, view.tooltip]).toEqual([true, "Ready", "Status"]);
  expect(menuBarView(sceneOf(menu())).isLoading).toBe(false);
  const none = menuBarView(sceneOf(node("l", "List")));
  expect([none.menu, none.rows, none.selected, none.isLoading]).toEqual([
    undefined,
    [],
    undefined,
    false,
  ]);
  expect(menuBarView(undefined).rows).toEqual([]);
});

test("the reducer moves the selection and emits onSelectionChange", () => {
  const scene = sceneOf(menu());
  const down = menuBarStep(scene, MENU_BAR_START, { type: "move", delta: 1 });
  expect(down.state.selectedId).toBe("off");
  expect(down.events).toEqual([{ node: "menu", handler: "sel", args: ["off"] }]);
  const end = menuBarStep(scene, { path: [], selectedId: "solo" }, { type: "move", delta: 1 });
  expect(end.events).toEqual([]);
  expect(end.state.selectedId).toBe("solo");
  const up = menuBarStep(scene, { path: [], selectedId: "solo" }, { type: "move", delta: -1 });
  expect(up.state.selectedId).toBe("off");
});

test("activate opens a submenu, back closes it, and items run onAction with left-click", () => {
  const scene = sceneOf(menu());
  const open = menuBarStep(scene, MENU_BAR_START, { type: "activate" });
  expect(open.state).toEqual({ path: ["sub"], selectedId: null });
  expect(open.events).toEqual([]);
  expect(menuBarView(scene, open.state).selected?.node.id).toBe("click");
  const run = menuBarStep(scene, open.state, { type: "activate" });
  expect(run.events).toEqual([{ node: "click", handler: "click", args: [{ type: "left-click" }] }]);
  expect(menuBarStep(scene, { path: [], selectedId: "off" }, { type: "activate" }).events).toEqual(
    [],
  );
  const back = menuBarStep(scene, open.state, { type: "back", escape: true });
  expect(back.state).toEqual({ path: [], selectedId: null });
  expect(back.leave).toBe(false);
});

test("back at the top level leaves only on escape", () => {
  const scene = sceneOf(menu());
  expect(menuBarStep(scene, MENU_BAR_START, { type: "back" }).leave).toBe(false);
  expect(menuBarStep(scene, MENU_BAR_START, { type: "back", escape: true }).leave).toBe(true);
});
