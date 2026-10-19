/** @jsxImportSource @opentui/react */
import type { SceneNode } from "@blastlauncher/protocol";
import { handler, text } from "./nodes.ts";
import { shortcutLabel } from "./view.ts";

// `MenuBarExtra` as a navigable menu. Sections are headers, Items run their
// `onAction` with the `left-click` event the runtime dispatches, and Submenus
// open a level; the client keeps the path of open submenu ids.

export type MenuRow = { node: SceneNode; text: string; item: boolean; disabled: boolean };

/** The rows of the menu level addressed by `path` (ids of open Submenus). */
export function menuRows(menu: SceneNode | undefined, path: string[]): MenuRow[] {
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
      rows.push({
        node,
        item: true,
        disabled: !handler(node.props.onAction),
        text: [
          text(node.props.title),
          text(node.props.subtitle),
          shortcutLabel(node.props.shortcut),
        ]
          .filter(Boolean)
          .join("  "),
      });
    } else if (node.type === "MenuBarExtra.Submenu") {
      rows.push({ node, item: true, disabled: false, text: `${text(node.props.title)} ›` });
    } else if (node.type === "MenuBarExtra.Section") {
      const start = rows.length;
      rows.push({ node, item: false, disabled: true, text: text(node.props.title) });
      node.children.forEach(visit);
      // Empty sections drop, like List sections do.
      if (rows.length === start + 1) rows.splice(start, 1);
    }
    // `MenuBarExtra.Separator` renders nothing in a text menu.
  }
  level.children.forEach(visit);
  return rows;
}

export function MenuBarView({ rows, selectedId }: { rows: MenuRow[]; selectedId: string | null }) {
  return (
    <>
      {rows.map((row) => (
        <text
          key={row.node.id}
          id={row.node.id}
          height={1}
          flexShrink={0}
          {...(row.node.id === selectedId ? { bg: "#234567" } : {})}
          {...(row.item && row.disabled ? { fg: "#777777" } : {})}
        >
          {row.item ? (row.node.id === selectedId ? "› " : "  ") : ""}
          {row.text}
        </text>
      ))}
      {rows.length === 0 && <text flexShrink={0}>No menu items</text>}
    </>
  );
}
