/** @jsxImportSource @opentui/react */
import { TextAttributes } from "@opentui/core";
import type { SceneNode } from "@blastlauncher/protocol";
import { handler, shortcutLabel, text } from "@blastlauncher/client-core";
import { theme } from "./theme.ts";

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
      const title = text(node.props.title);
      const subtitle = text(node.props.subtitle);
      const shortcut = shortcutLabel(node.props.shortcut);
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

export function MenuBarView({ rows, selectedId }: { rows: MenuRow[]; selectedId: string | null }) {
  return (
    <>
      {rows.map((row) => {
        const isSelected = row.node.id === selectedId;
        if (!row.item) {
          return (
            <box key={row.node.id} id={row.node.id} height={1} flexShrink={0} width="100%">
              <text flexGrow={1} fg={theme.colors.textMuted} attributes={TextAttributes.BOLD}>
                {row.title ?? row.text}
              </text>
            </box>
          );
        }
        return (
          <box
            key={row.node.id}
            id={row.node.id}
            flexDirection="row"
            width="100%"
            height={1}
            flexShrink={0}
            {...(isSelected ? { backgroundColor: theme.colors.selectionBg } : {})}
          >
            <text
              flexShrink={0}
              wrapMode="none"
              fg={row.disabled ? theme.colors.textMuted : theme.colors.accent}
              {...(isSelected ? { backgroundColor: theme.colors.selectionBg } : {})}
            >
              {isSelected ? `${theme.glyphs.pointer} ` : "  "}
            </text>
            <text
              flexShrink={0}
              wrapMode="none"
              fg={row.disabled ? theme.colors.textMuted : theme.colors.text}
              {...(isSelected ? { attributes: TextAttributes.BOLD } : {})}
              {...(isSelected ? { backgroundColor: theme.colors.selectionBg } : {})}
            >
              {row.title ?? row.text}
            </text>
            {row.subtitle ? (
              <text
                flexShrink={1}
                wrapMode="none"
                fg={theme.colors.textMuted}
                {...(isSelected ? { backgroundColor: theme.colors.selectionBg } : {})}
              >
                {`  ${row.subtitle}`}
              </text>
            ) : null}
            <box
              flexGrow={1}
              flexShrink={0}
              {...(isSelected ? { backgroundColor: theme.colors.selectionBg } : {})}
            />
            {row.isSubmenu ? (
              <text
                flexShrink={0}
                wrapMode="none"
                fg={theme.colors.textMuted}
                {...(isSelected ? { backgroundColor: theme.colors.selectionBg } : {})}
              >
                {row.shortcut ? `${row.shortcut}  ${theme.glyphs.pointer}` : theme.glyphs.pointer}
              </text>
            ) : row.shortcut ? (
              <text
                flexShrink={0}
                wrapMode="none"
                fg={theme.colors.textMuted}
                {...(isSelected ? { backgroundColor: theme.colors.selectionBg } : {})}
              >
                {row.shortcut}
              </text>
            ) : null}
          </box>
        );
      })}
      {rows.length === 0 && (
        <text flexShrink={0} fg={theme.colors.textMuted}>
          No menu items
        </text>
      )}
    </>
  );
}
