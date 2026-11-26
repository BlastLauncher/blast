import type { SceneMessage, SceneNode } from "@blastlauncher/protocol";
import { slot, text } from "./nodes.ts";
import { gridLayout } from "./grid.ts";
import { searchBarDropdown } from "./dropdown.ts";
import {
  filteringOf,
  groupsOf,
  rankGroups,
  score,
  searchable,
  type FilteringOptions,
  type Group,
} from "./rank.ts";
import { shortcutLabel, type Platform } from "./shortcut.ts";
import { iconView, type IconOptions, type IconView } from "./icons.ts";

/** Raycast's built-in shortcuts for actions without an explicit shortcut. */
export function defaultActionShortcut(node: SceneNode, index: number): unknown {
  if (node.props.shortcut !== undefined) return node.props.shortcut;
  if (node.type === "Action.CopyToClipboard") return { modifiers: ["cmd"], key: "c" };
  if (index === 1) return { modifiers: ["cmd"], key: "return" };
  return undefined;
}

export {
  event,
  handler,
  handlerEvent,
  isFiltering,
  paginationOf,
  selectionId,
  slot,
  text,
} from "./nodes.ts";

export type UIState = {
  searchText: string;
  selectedId: string | null;
  /** Shown when the scene has no navigation title, typically the command title. */
  fallbackTitle?: string;
  icons?: IconOptions;
};
export type Row = {
  node: SceneNode;
  text: string;
  item: boolean;
  title?: string;
  subtitle?: string;
  accessories?: string;
  shortcut?: string;
  icon?: boolean;
  iconView?: IconView;
  count?: number;
  isSubmenu?: boolean;
  /** A node type this client has no renderer for; `text` keeps the raw marker. */
  unsupported?: boolean;
};

export function firstAction(node: SceneNode | undefined): SceneNode | undefined {
  if (!node) return;
  if (node.type === "Action" || node.type.startsWith("Action.")) return node;
  // Submenus require opening, which belongs to the action-panel client.
  if (node.type === "ActionPanel.Submenu") return;
  for (const child of node.children) {
    const action = firstAction(child);
    if (action) return action;
  }
}

export function activeNode(node: SceneNode | null | undefined): SceneNode | undefined {
  if (node?.type === "Navigation")
    return activeNode(
      node.children.find((child) => child.type === "Navigation.Entry" && child.props.active),
    );
  if (node?.type === "Navigation.Entry") return activeNode(node.children[0]);
  return node ?? undefined;
}

function itemAccessoryLabels(node: SceneNode, icons: IconOptions): string[] {
  const accessories = node.props.accessories;
  if (!Array.isArray(accessories) || accessories.length === 0) return [];
  const labels: string[] = [];
  for (let i = 0; i < accessories.length; i++) {
    const value = accessories[i];
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const t = text(value.text);
    const tag = text(value.tag);
    const ic = value.icon ? iconView(value.icon, icons).label : "";
    const joined = [t, tag, ic].filter(Boolean).join(" ");
    if (joined) labels.push(joined);
  }
  return labels;
}

const itemRowCache = new WeakMap<SceneNode, { key: string; row: Row }>();

function iconOptionsKey(icons: IconOptions): string {
  return `${icons.appearance ?? ""}\0${icons.assetsDir ?? ""}`;
}

function itemRow(node: SceneNode, icons: IconOptions, iconsKey: string): Row {
  const cached = itemRowCache.get(node);
  if (cached && cached.key === iconsKey) return cached.row;
  const title = text(node.props.title);
  const subtitle = text(node.props.subtitle);
  const hasIcon = Boolean(node.props.icon);
  const resolvedIcon = hasIcon ? iconView(node.props.icon, icons) : undefined;
  const accLabels = itemAccessoryLabels(node, icons);
  const accessories = accLabels.join("  ");
  const parts: string[] = [];
  if (resolvedIcon?.label) parts.push(resolvedIcon.label);
  if (title) parts.push(title);
  if (subtitle) parts.push(subtitle);
  for (let i = 0; i < accLabels.length; i++) parts.push(accLabels[i]!);
  const row: Row = {
    node,
    text: parts.join("  "),
    item: true,
    title,
    subtitle,
    accessories,
    icon: hasIcon,
    ...(resolvedIcon ? { iconView: resolvedIcon } : {}),
  };
  itemRowCache.set(node, { key: iconsKey, row });
  return row;
}

function sectionRow(node: SceneNode): Row {
  const title = [text(node.props.title), text(node.props.subtitle)].filter(Boolean).join(" — ");
  return { node, text: title, title, item: false };
}

/**
 * A scene node the client cannot draw. `title` is the bare node type for a
 * friendly notice; `text` keeps `[Unsupported: <type>]` for diagnostics and
 * headless clients that only print one string per row.
 */
function unsupportedRow(node: SceneNode): Row {
  return {
    node,
    title: node.type,
    text: `[Unsupported: ${node.type}]`,
    item: false,
    unsupported: true,
  };
}

/** Selection-independent view projection; cached per `(scene, searchText)` by controller. */
export type BaseView = {
  list: SceneNode | undefined;
  grid: ReturnType<typeof gridLayout> | undefined;
  accessory: SceneNode | undefined;
  navigation: SceneNode | undefined;
  rows: Row[];
  items: SceneNode[];
  itemIndexBySelectionId: Map<string, number>;
  itemIndexByNodeId: Map<string, number>;
  rowIndexByNodeId: Map<string, number>;
  empty: SceneNode | undefined;
  title: string;
  loading: boolean;
  emptyText: string;
};

export function buildBaseView(
  scene: SceneMessage | undefined,
  state: Pick<UIState, "searchText" | "fallbackTitle" | "icons">,
): BaseView {
  const list = activeNode(scene?.root);
  const rows: Row[] = [];
  const query = state.searchText;
  const icons = state.icons ?? {};
  const iconsKey = iconOptionsKey(icons);
  const filtering = filteringOf(list);
  const grid = list?.type === "Grid" ? gridLayout(list, query, filtering) : undefined;
  if (list?.type === "List") {
    const groups = rankGroups(
      groupsOf(
        list,
        (node) => node.type === "List.Item",
        (node) => node.type === "List.Section",
      ),
      query,
      (node) => score(searchable(node), query),
      filtering,
    );
    for (let g = 0; g < groups.length; g++) {
      const group = groups[g]!;
      const header = group.section ? sectionRow(group.section) : undefined;
      if (header) rows.push(header);
      for (let i = 0; i < group.items.length; i++) {
        rows.push(itemRow(group.items[i]!, icons, iconsKey));
      }
      if (header) header.count = group.items.length;
    }
    // Children that are neither items nor sections have no list rendering.
    for (let i = 0; i < list.children.length; i++) {
      const node = list.children[i]!;
      if (
        node.type !== "List.Item" &&
        node.type !== "List.Section" &&
        node.type !== "List.EmptyView" &&
        node.type !== "Slot"
      )
        rows.push(unsupportedRow(node));
    }
  } else if (!grid && list && list.type !== "Detail") rows.push(unsupportedRow(list));

  const itemIndexBySelectionId = new Map<string, number>();
  const itemIndexByNodeId = new Map<string, number>();
  const rowIndexByNodeId = new Map<string, number>();
  let items: SceneNode[];
  if (grid) {
    items = grid.cells;
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const sel = String(item.props.id ?? item.id);
      if (!itemIndexBySelectionId.has(sel)) itemIndexBySelectionId.set(sel, i);
      itemIndexByNodeId.set(item.id, i);
    }
  } else {
    items = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      if (!row.item) continue;
      const item = row.node;
      const idx = items.length;
      items.push(item);
      const sel = String(item.props.id ?? item.id);
      if (!itemIndexBySelectionId.has(sel)) itemIndexBySelectionId.set(sel, idx);
      itemIndexByNodeId.set(item.id, idx);
      rowIndexByNodeId.set(item.id, i);
    }
  }

  const empty = list?.children.find(
    (node) => node.type === "List.EmptyView" || node.type === "Grid.EmptyView",
  );
  return {
    list,
    grid,
    accessory: searchBarDropdown(list),
    navigation: scene?.root?.type === "Navigation" ? scene.root : undefined,
    rows,
    items,
    itemIndexBySelectionId,
    itemIndexByNodeId,
    rowIndexByNodeId,
    empty,
    title:
      text(list?.props.navigationTitle) ||
      (list?.type === "MenuBarExtra"
        ? [text(list.props.title), text(list.props.tooltip)].filter(Boolean).join(" — ")
        : "") ||
      state.fallbackTitle ||
      "Blast",
    loading: list?.props.isLoading === true || !scene,
    emptyText: empty
      ? [
          empty.props.icon ? iconView(empty.props.icon, icons).label : "",
          text(empty.props.title),
          text(empty.props.description),
        ]
          .filter(Boolean)
          .join("  ")
      : "No results",
  };
}

export function selectFromBase(base: BaseView, selectedId: string | null) {
  const { list, items, empty } = base;
  const desired = list?.props.selectedItemId ?? selectedId;
  let selected: SceneNode | undefined;
  if (desired !== null && desired !== undefined) {
    const key = typeof desired === "string" || typeof desired === "number" ? String(desired) : null;
    const idx = key !== null ? base.itemIndexBySelectionId.get(key) : undefined;
    selected =
      idx !== undefined ? items[idx] : items.find((item) => (item.props.id ?? item.id) === desired);
  }
  selected ??= items[0];
  const selectedActions = selected ? slot(selected, "actions") : undefined;
  const emptyActions = !selected && empty ? slot(empty, "actions") : undefined;
  const listActions = list ? slot(list, "actions") : undefined;
  return {
    ...base,
    actions: selectedActions ?? emptyActions ?? listActions,
    detail:
      list?.type === "Detail"
        ? detailText(list)
        : list?.props.isShowingDetail
          ? detailText(selected ? slot(selected, "detail") : undefined)
          : "",
    selected,
    primary: firstAction(selectedActions) ?? firstAction(emptyActions) ?? firstAction(listActions),
  };
}

export function sceneToView(scene: SceneMessage | undefined, state: UIState) {
  return selectFromBase(buildBaseView(scene, state), state.selectedId);
}

function actionRow(node: SceneNode, platform: Platform, index: number): Row {
  const isSubmenu = node.type === "ActionPanel.Submenu";
  const title = text(node.props.title);
  const label = shortcutLabel(defaultActionShortcut(node, index), platform);
  return {
    node,
    item: true,
    title,
    shortcut: label,
    isSubmenu,
    text: `${title}${isSubmenu ? " ›" : ""} ${label}`.trim(),
  };
}

function isAction(node: SceneNode): boolean {
  return (
    node.type === "ActionPanel.Submenu" || node.type === "Action" || node.type.startsWith("Action.")
  );
}

// Actions under `node`, grouped by `ActionPanel.Section`; wrappers (the
// ActionPanel itself, slots) are looked through, a Submenu is one action.
function actionGroups(
  node: SceneNode,
  groups: Group<SceneNode>[],
  loose: { current?: Group<SceneNode> | undefined },
) {
  for (const child of node.children) {
    if (isAction(child)) {
      if (!loose.current) groups.push((loose.current = { items: [] }));
      loose.current.items.push(child);
    } else if (child.type === "ActionPanel.Section") {
      loose.current = undefined;
      const items: SceneNode[] = [];
      const inner: Group<SceneNode>[] = [];
      actionGroups(child, inner, {});
      for (const group of inner) items.push(...group.items);
      groups.push({ section: child, items });
    } else actionGroups(child, groups, loose);
  }
}

/**
 * The rows of an action container (ActionPanel, Section, or a Submenu's
 * contents), filtered and ranked by title for `query` per its `filtering`.
 * A lone action is its own single row. Pass `platform` for shortcut labels.
 */
export function actionRows(
  node: SceneNode | undefined,
  query = "",
  platform: Platform = "Linux",
  filtering: FilteringOptions = { enabled: true, keepSectionOrder: false },
): Row[] {
  if (!node) return [];
  if (isAction(node)) {
    const row = actionRow(node, platform, 0);
    return score({ title: text(node.props.title) }, query) > 0 ? [row] : [];
  }
  const groups: Group<SceneNode>[] = [];
  actionGroups(node, groups, {});
  let index = 0;
  return rankGroups(
    groups,
    query,
    (action) => score({ title: text(action.props.title) }, query),
    filtering,
  ).flatMap((group) => {
    const items = group.items.map((action) => actionRow(action, platform, index++));
    return group.section
      ? [
          {
            node: group.section,
            item: false,
            title: text(group.section.props.title),
            text: text(group.section.props.title),
          },
          ...items,
        ]
      : items;
  });
}

/**
 * What an opened action panel level lists: a Submenu shows its own contents
 * under its `filtering`; anything else is the panel (or a Section) itself.
 */
export function panelRows(
  node: SceneNode | undefined,
  query = "",
  platform: Platform = "Linux",
): Row[] {
  return node?.type === "ActionPanel.Submenu"
    ? actionRows({ ...node, type: "ActionPanel" }, query, platform, filteringOf(node))
    : actionRows(node, query, platform);
}

export function detailText(node: SceneNode | undefined): string {
  if (!node) return "";
  const lines = [text(node.props.markdown)];
  function visit(child: SceneNode) {
    if (child.type === "Slot" && child.props.name === "actions") return;
    if (typeof child.props.markdown === "string") lines.push(child.props.markdown);
    const value = [text(child.props.text), text(child.props.value), text(child.props.target)]
      .filter(Boolean)
      .join(" ");
    const label = text(child.props.title ?? child.props.label);
    if (label || value) lines.push([label, value].filter(Boolean).join(": "));
    child.children.forEach(visit);
  }
  node.children.forEach(visit);
  return lines.filter(Boolean).join("\n");
}
