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

export type UIState = { searchText: string; selectedId: string | null };
export type Row = {
  node: SceneNode;
  text: string;
  item: boolean;
  title?: string;
  subtitle?: string;
  accessories?: string;
  shortcut?: string;
  icon?: boolean;
  count?: number;
  isSubmenu?: boolean;
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

function itemAccessories(node: SceneNode): string {
  const accessories = node.props.accessories;
  const labels = Array.isArray(accessories)
    ? accessories.map((value) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return "";
        return [text(value.text), text(value.tag), value.icon ? "◇" : ""].filter(Boolean).join(" ");
      })
    : [];
  return labels.filter(Boolean).join("  ");
}

function itemText(node: SceneNode): string {
  const accessories = node.props.accessories;
  const labels = Array.isArray(accessories)
    ? accessories.map((value) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return "";
        return [text(value.text), text(value.tag), value.icon ? "◇" : ""].filter(Boolean).join(" ");
      })
    : [];
  return [node.props.icon ? "◇" : "", text(node.props.title), text(node.props.subtitle), ...labels]
    .filter(Boolean)
    .join("  ");
}

function itemRow(node: SceneNode): Row {
  return {
    node,
    text: itemText(node),
    item: true,
    title: text(node.props.title),
    subtitle: text(node.props.subtitle),
    accessories: itemAccessories(node),
    icon: Boolean(node.props.icon),
  };
}

function sectionRow(node: SceneNode): Row {
  const title = [text(node.props.title), text(node.props.subtitle)].filter(Boolean).join(" — ");
  return { node, text: title, title, item: false };
}

export function sceneToView(scene: SceneMessage | undefined, state: UIState) {
  const list = activeNode(scene?.root);
  const rows: Row[] = [];
  const query = state.searchText;
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
    for (const group of groups) {
      const header = group.section ? sectionRow(group.section) : undefined;
      if (header) rows.push(header);
      for (const node of group.items) rows.push(itemRow(node));
      if (header) header.count = group.items.length;
    }
    // Children that are neither items nor sections have no list rendering.
    for (const node of list.children)
      if (!["List.Item", "List.Section", "List.EmptyView", "Slot"].includes(node.type))
        rows.push({ node, text: `[Unsupported: ${node.type}]`, item: false });
  } else if (!grid && list && list.type !== "Detail")
    rows.push({ node: list, text: `[Unsupported: ${list.type}]`, item: false });
  const items = grid ? grid.cells : rows.filter((row) => row.item).map((row) => row.node);
  const desired = list?.props.selectedItemId ?? state.selectedId;
  const selected = items.find((item) => (item.props.id ?? item.id) === desired) ?? items[0];
  const empty = list?.children.find(
    (node) => node.type === "List.EmptyView" || node.type === "Grid.EmptyView",
  );
  return {
    list,
    grid,
    accessory: searchBarDropdown(list),
    navigation: scene?.root?.type === "Navigation" ? scene.root : undefined,
    actions:
      (selected ? slot(selected, "actions") : undefined) ??
      (list ? slot(list, "actions") : undefined),
    detail:
      list?.type === "Detail"
        ? detailText(list)
        : list?.props.isShowingDetail
          ? detailText(selected ? slot(selected, "detail") : undefined)
          : "",
    rows,
    items,
    selected,
    title:
      text(list?.props.navigationTitle) ||
      (list?.type === "MenuBarExtra"
        ? [text(list.props.title), text(list.props.tooltip)].filter(Boolean).join(" — ")
        : "") ||
      "Blast",
    loading: list?.props.isLoading === true || !scene,
    emptyText: empty
      ? [empty.props.icon ? "◇" : "", text(empty.props.title), text(empty.props.description)]
          .filter(Boolean)
          .join("  ")
      : "No results",
    primary:
      firstAction(selected ? slot(selected, "actions") : undefined) ??
      firstAction(list ? slot(list, "actions") : undefined),
  };
}

function actionRow(node: SceneNode, platform: Platform): Row {
  const isSubmenu = node.type === "ActionPanel.Submenu";
  const title = text(node.props.title);
  const label = shortcutLabel(node.props.shortcut, platform);
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
    const row = actionRow(node, platform);
    return score({ title: text(node.props.title) }, query) > 0 ? [row] : [];
  }
  const groups: Group<SceneNode>[] = [];
  actionGroups(node, groups, {});
  return rankGroups(
    groups,
    query,
    (action) => score({ title: text(action.props.title) }, query),
    filtering,
  ).flatMap((group) => {
    const items = group.items.map((action) => actionRow(action, platform));
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
