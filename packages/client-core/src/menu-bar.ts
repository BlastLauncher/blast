import type { SceneMessage, SceneNode } from "@blastlauncher/protocol";
import { handler, handlerEvent, event, selectionId, text, type OutboundEvent } from "./nodes.ts";
import { shortcutLabel, type Platform } from "./shortcut.ts";
import { activeNode } from "./view.ts";

// `MenuBarExtra` as a navigable menu. Sections are headers, Items run their
// `onAction` with the `left-click` event the runtime dispatches, and Submenus
// open a level; the client keeps the path of open submenu ids.

export type MenuRow = {
  node: SceneNode;
  text: string;
  item: boolean;
  disabled: boolean;
  title?: string;
  subtitle?: string;
  shortcut?: string;
  isSubmenu?: boolean;
};

/** What the client remembers between frames: open submenus and the selection. */
export type MenuBarState = { path: string[]; selectedId: string | null };
export const MENU_BAR_START: MenuBarState = { path: [], selectedId: null };

export type MenuBarView = {
  /** The MenuBarExtra node, when the active view is one. */
  menu: SceneNode | undefined;
  /** Rows of the open level, section headers included. */
  rows: MenuRow[];
  /** Selectable rows: everything but the section headers. */
  items: MenuRow[];
  /** The highlighted row; the first item until the client selects another. */
  selected: MenuRow | undefined;
  path: string[];
  isLoading: boolean;
  title: string;
  tooltip: string;
};

/** The rows of the menu level addressed by `path` (ids of open Submenus). */
export function menuRows(
  menu: SceneNode | undefined,
  path: string[],
  platform: Platform = "Linux",
): MenuRow[] {
  if (menu?.type !== "MenuBarExtra") return [];
  let level = menu;
  for (const id of path) {
    // A Submenu may sit inside a Section, so search the level's subtree.
    let next: SceneNode | undefined;
    (function find(node: SceneNode) {
      for (const child of node.children) {
        if (next) return;
        if (child.type === "MenuBarExtra.Submenu" && child.id === id) next = child;
        else find(child);
      }
    })(level);
    if (!next) break;
    level = next;
  }
  const rows: MenuRow[] = [];
  function visit(node: SceneNode) {
    if (node.type === "MenuBarExtra.Item") {
      const title = text(node.props.title);
      const subtitle = text(node.props.subtitle);
      const shortcut = shortcutLabel(node.props.shortcut, platform);
      rows.push({
        node,
        item: true,
        disabled: !handler(node.props.onAction),
        title,
        subtitle,
        shortcut,
        text: [title, subtitle, shortcut].filter(Boolean).join("  "),
      });
    } else if (node.type === "MenuBarExtra.Submenu") {
      const title = text(node.props.title);
      rows.push({
        node,
        item: true,
        disabled: false,
        title,
        isSubmenu: true,
        text: `${title} ›`,
      });
    } else if (node.type === "MenuBarExtra.Section") {
      const start = rows.length;
      const title = text(node.props.title);
      rows.push({ node, item: false, disabled: true, title, text: title });
      node.children.forEach(visit);
      // Empty sections drop, like List sections do.
      if (rows.length === start + 1) rows.splice(start, 1);
    }
    // `MenuBarExtra.Separator` renders nothing in a text menu.
  }
  level.children.forEach(visit);
  return rows;
}

/** The menu of the active view as rows, selection and loading state. */
export function menuBarView(
  scene: SceneMessage | undefined,
  state: MenuBarState = MENU_BAR_START,
  platform: Platform = "Linux",
): MenuBarView {
  const active = activeNode(scene?.root);
  const menu = active?.type === "MenuBarExtra" ? active : undefined;
  const rows = menuRows(menu, state.path, platform);
  const items = rows.filter((row) => row.item);
  return {
    menu,
    rows,
    items,
    selected: items.find((row) => selectionId(row.node) === state.selectedId) ?? items[0],
    path: state.path,
    isLoading: menu?.props.isLoading === true,
    title: text(menu?.props.title),
    tooltip: text(menu?.props.tooltip),
  };
}

export type MenuBarAction =
  | { type: "move"; delta: 1 | -1 }
  /** Enter or →: open the selected submenu, or run the selected item. */
  | { type: "activate" }
  /** ← closes the open submenu; Esc does too, and leaves the menu from the top level. */
  | { type: "back"; escape?: boolean };

export type MenuBarStep = {
  state: MenuBarState;
  /** Events for the runtime: `onSelectionChange` on a move, `onAction` on activate. */
  events: OutboundEvent[];
  /** Esc at the top level: the client should close the menu. */
  leave: boolean;
};

/** The menu-bar navigation reducer. Pure: the client sends `events` itself. */
export function menuBarStep(
  scene: SceneMessage | undefined,
  state: MenuBarState,
  action: MenuBarAction,
  platform: Platform = "Linux",
): MenuBarStep {
  const view = menuBarView(scene, state, platform);
  const same: MenuBarStep = { state, events: [], leave: false };
  if (action.type === "back") {
    if (state.path.length)
      return { ...same, state: { path: state.path.slice(0, -1), selectedId: null } };
    return { ...same, leave: action.escape === true };
  }
  if (action.type === "move") {
    const at = view.items.findIndex((row) => row.node === view.selected?.node);
    const next = view.items[Math.max(0, Math.min(view.items.length - 1, at + action.delta))];
    const nextId = next ? selectionId(next.node) : null;
    if (!next || nextId === selectionId(view.selected?.node)) return same;
    return {
      ...same,
      state: { ...state, selectedId: nextId },
      events: [event(view.menu, "onSelectionChange", [nextId])].filter((e) => e !== undefined),
    };
  }
  const choice = view.selected;
  if (choice?.node.type === "MenuBarExtra.Submenu")
    return { ...same, state: { path: [...state.path, choice.node.id], selectedId: null } };
  if (choice && !choice.disabled)
    return {
      ...same,
      events: [
        handlerEvent(choice.node, choice.node.props.onAction, [{ type: "left-click" }]),
      ].filter((e) => e !== undefined),
    };
  return same;
}
