import type { SceneMessage, SceneNode } from "@blastlauncher/protocol";
import { isFiltering, matchesQuery, slot, text } from "./nodes.ts";
import { gridLayout } from "./grid.ts";
import { searchBarDropdown } from "./dropdown.ts";

export {
  event,
  handler,
  handlerEvent,
  isFiltering,
  matchesQuery,
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

function active(node: SceneNode | null | undefined): SceneNode | undefined {
  if (node?.type === "Navigation")
    return active(
      node.children.find((child) => child.type === "Navigation.Entry" && child.props.active),
    );
  if (node?.type === "Navigation.Entry") return active(node.children[0]);
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

export function sceneToView(scene: SceneMessage | undefined, state: UIState) {
  const list = active(scene?.root);
  const rows: Row[] = [];
  const query = state.searchText.toLowerCase();
  const filtering = isFiltering(list);
  const grid = list?.type === "Grid" ? gridLayout(list, query, filtering) : undefined;
  function visit(node: SceneNode) {
    if (node.type === "Slot") return;
    if (node.type === "List.Item") {
      if (!filtering || matchesQuery(node, query))
        rows.push({
          node,
          text: itemText(node),
          item: true,
          title: text(node.props.title),
          subtitle: text(node.props.subtitle),
          accessories: itemAccessories(node),
          icon: Boolean(node.props.icon),
        });
    } else if (node.type === "List.Section") {
      const start = rows.length;
      const sectionTitle = [text(node.props.title), text(node.props.subtitle)]
        .filter(Boolean)
        .join(" — ");
      rows.push({
        node,
        text: sectionTitle,
        title: sectionTitle,
        item: false,
      });
      node.children.forEach(visit);
      if (rows.length === start + 1) {
        rows.splice(start, 1);
      } else {
        const count = rows.slice(start + 1).filter((r) => r.item).length;
        const header = rows[start];
        if (header) header.count = count;
      }
    } else if (node.type !== "List.EmptyView") {
      rows.push({ node, text: `[Unsupported: ${node.type}]`, item: false });
    }
  }
  if (list?.type === "List") list.children.forEach(visit);
  else if (!grid && list && list.type !== "Detail")
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

export function actionRows(node: SceneNode | undefined, query = ""): Row[] {
  if (!node) return [];
  if (
    node.type === "ActionPanel.Submenu" ||
    node.type === "Action" ||
    node.type.startsWith("Action.")
  ) {
    const title = `${text(node.props.title)}${node.type === "ActionPanel.Submenu" ? " ›" : ""}`;
    const label = shortcutLabel(node.props.shortcut);
    return text(node.props.title).toLowerCase().includes(query.toLowerCase())
      ? [
          {
            node,
            item: true,
            title,
            shortcut: label,
            text: `${title} ${label}`.trim(),
          },
        ]
      : [];
  }
  const children = node.children.flatMap((child) => actionRows(child, query));
  return children.length && node.type === "ActionPanel.Section"
    ? [
        { node, item: false, title: text(node.props.title), text: text(node.props.title) },
        ...children,
      ]
    : children;
}

type TerminalKey = {
  name: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  option?: boolean;
  super?: boolean;
};

function shortcut(value: unknown): { key: string; modifiers: string[] } | undefined {
  if (!value || typeof value !== "object" || !("key" in value) || !("modifiers" in value)) return;
  const { key, modifiers } = value;
  if (
    typeof key !== "string" ||
    !Array.isArray(modifiers) ||
    !modifiers.every((m) => m === "ctrl" || m === "shift")
  )
    return;
  const names: Record<string, string> = {
    enter: "return",
    escape: "escape",
    space: "space",
    backspace: "backspace",
    tab: "tab",
    arrowUp: "up",
    arrowDown: "down",
    arrowLeft: "left",
    arrowRight: "right",
  };
  const name = names[key] ?? (/^[a-z0-9]$/.test(key) ? key : undefined);
  return name ? { key: name, modifiers } : undefined;
}

export function shortcutLabel(value: unknown): string {
  const mapped = shortcut(value);
  return mapped ? [...mapped.modifiers, mapped.key].join("+") : "";
}

export function matchesShortcut(value: unknown, key: TerminalKey): boolean {
  const mapped = shortcut(value);
  return (
    !!mapped &&
    mapped.key === key.name &&
    !!key.ctrl === mapped.modifiers.includes("ctrl") &&
    !!key.shift === mapped.modifiers.includes("shift") &&
    !key.meta &&
    !key.option &&
    !key.super
  );
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
