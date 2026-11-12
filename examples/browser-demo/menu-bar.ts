import {
  menuRows,
  type ControllerView,
  type MenuRowView,
  type Platform,
} from "../../packages/client-core/src/index.ts";
import type { SceneNode } from "../../packages/protocol/src/index.ts";
import { escapeHtml, feedbackMarkup, keycap } from "../web-launcher/render.js";

// A menu-bar command draws as macOS does: a status item in the page's top bar
// and its menu dropping down beneath it, each open submenu beside its parent.

type MenuBar = NonNullable<ControllerView["menuBar"]>;

/**
 * Rows of every open level, outermost first. The controller only exposes the
 * deepest level, so parent levels are rebuilt from the scene; in each of them
 * the submenu that is open shows as selected.
 */
export function menuLevels(
  menu: SceneNode | undefined,
  bar: MenuBar,
  platform: Platform,
): MenuRowView[][] {
  const parents = bar.path.map((open, depth) =>
    menuRows(menu, bar.path.slice(0, depth), platform).map(
      (row): MenuRowView => ({
        id: row.node.id,
        kind: !row.item ? "section" : row.isSubmenu ? "submenu" : "item",
        title: row.title ?? "",
        subtitle: row.subtitle ?? "",
        iconLabel: row.iconLabel ?? "",
        ...(row.iconTint ? { iconTint: row.iconTint } : {}),
        shortcut: row.shortcut ?? "",
        disabled: row.disabled,
        selected: row.node.id === open,
      }),
    ),
  );
  return [...parents, bar.rows];
}

const rowMarkup = (
  row: MenuRowView,
  level: number,
  first: boolean,
  icons: boolean,
  open: boolean,
  hint?: (label: string) => string,
) => {
  if (row.kind === "section")
    return `${first ? "" : '<div class="menu-separator" role="separator"></div>'}${row.title ? `<div class="menu-section" role="presentation">${escapeHtml(row.title)}</div>` : ""}`;
  const submenu = row.kind === "submenu";
  const icon = icons
    ? `<span class="menu-icon" aria-hidden="true"${row.iconTint ? ` style="color:${escapeHtml(row.iconTint)}"` : ""}>${escapeHtml(row.iconLabel)}</span>`
    : "";
  return `<button type="button" role="menuitem" class="menu-item${row.selected ? " selected" : ""}" data-menu-id="${escapeHtml(row.id)}" data-menu-level="${level}"${row.disabled ? " disabled" : ""}${submenu ? ` aria-haspopup="menu" aria-expanded="${open && row.selected}"` : ""}>${icon}<span class="menu-title">${escapeHtml(row.title)}</span>${row.subtitle ? `<small>${escapeHtml(row.subtitle)}</small>` : ""}${keycap("kbd", row.shortcut, hint)}${submenu ? '<span class="menu-chevron" aria-hidden="true"></span>' : ""}</button>`;
};

/** The menu window: no launcher chrome, only the open menu levels and feedback. */
export function renderMenuBar(
  view: ControllerView,
  levels: MenuRowView[][],
  options: { reservedHint?: (label: string) => string } = {},
): string {
  const bar = view.menuBar;
  const label = bar?.tooltip || bar?.title || view.title || "Menu";
  const panels = levels
    .map((rows, level) => {
      const icons = rows.some((row) => row.kind !== "section" && row.iconLabel);
      const open = level < levels.length - 1;
      const body = rows.length
        ? rows
            .map((row, index) => rowMarkup(row, level, index === 0, icons, open, options.reservedHint))
            .join("")
        : '<div class="menu-section" role="presentation">No items</div>';
      return `<div class="menu-panel" role="menu" data-menu-level="${level}" aria-label="${escapeHtml(label)}">${body}</div>`;
    })
    .join("");
  const busy = bar?.loading ? "true" : "false";
  return `<main class="menu-window" data-kind="menu-bar" data-loading="${busy}" aria-busy="${busy}"><nav class="menu-bar" aria-label="${escapeHtml(label)}">${panels}</nav>${feedbackMarkup(view, options)}</main>`;
}

/** While a menu-bar command starts, its menu already hangs from the status item. */
export function renderMenuLoading(title: string): string {
  return `<main class="menu-window" data-kind="menu-bar" data-loading="true" aria-busy="true"><nav class="menu-bar menu-loading" aria-label="${escapeHtml(title)}"><div class="menu-panel" role="menu" data-menu-level="0" aria-label="${escapeHtml(title)}"><div class="menu-section" role="presentation">Loading…</div></div></nav></main>`;
}

export type StatusItem = { title: string; icon: string; iconUrl?: string; open: boolean };

/** The menu-bar command's item in the top bar; it toggles the menu. */
export function statusItemMarkup(item: StatusItem): string {
  const icon = item.iconUrl
    ? `<img src="${escapeHtml(item.iconUrl)}" alt="" width="16" height="16">`
    : escapeHtml(item.icon);
  return `<span class="status-item-icon" aria-hidden="true">${icon}</span><span class="status-item-title">${escapeHtml(item.title)}</span>`;
}

export type Box = { left: number; top: number; right: number; bottom: number };
export type Size = { width: number; height: number };
export type Placement = { left: number; top: number; maxHeight: number };
const MARGIN = 8;
/** Panel padding: a submenu's first row lines up with the row that opened it. */
const INSET = 5;

const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(value, Math.max(low, high)));

/** The top-level menu: under the status item, left edges aligned, kept on screen. */
export function placeMenu(anchor: Box, size: Size, viewport: Size): Placement {
  const top = anchor.bottom + 6;
  return {
    left: clamp(anchor.left, MARGIN, viewport.width - size.width - MARGIN),
    top,
    maxHeight: Math.max(0, viewport.height - top - MARGIN),
  };
}

/**
 * A submenu opens to the right of its parent, or to the left when that does not
 * fit; on a screen too narrow for either it drops below the row that opened it.
 */
export function placeSubmenu(parent: Box, row: Box, size: Size, viewport: Size): Placement {
  const right = parent.right - 2;
  const left = parent.left - size.width + 2;
  const side =
    right + size.width <= viewport.width - MARGIN
      ? right
      : left >= MARGIN
        ? left
        : undefined;
  const top = side === undefined ? row.bottom : row.top - INSET;
  const maxHeight = viewport.height - 2 * MARGIN;
  return {
    left: side ?? clamp(row.left + 16, MARGIN, viewport.width - size.width - MARGIN),
    top: clamp(top, MARGIN, viewport.height - Math.min(size.height, maxHeight) - MARGIN),
    maxHeight,
  };
}
