import type { HandlerRef, JsonValue, SceneMessage, SceneNode } from "@blastlauncher/protocol";

export type UIState = { searchText: string; selectedId: string | null };
export type Row = { node: SceneNode; text: string; item: boolean };
export function handler(value: unknown): value is HandlerRef {
  return value !== null && typeof value === "object" && "$handler" in value;
}
export function text(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value && typeof value === "object" && "value" in value) return text(value.value);
  return "";
}
export function slot(node: SceneNode, name: string): SceneNode | undefined {
  return node.children.find((child) => child.type === "Slot" && child.props.name === name);
}
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
  const filtering = list?.props.filtering !== false && !handler(list?.props.onSearchTextChange);
  function visit(node: SceneNode) {
    if (node.type === "Slot") return;
    if (node.type === "List.Item") {
      const keywords = Array.isArray(node.props.keywords) ? node.props.keywords.map(text) : [];
      if (
        !filtering ||
        [text(node.props.title), text(node.props.subtitle), ...keywords].some((value) =>
          value.toLowerCase().includes(query),
        )
      )
        rows.push({ node, text: itemText(node), item: true });
    } else if (node.type === "List.Section") {
      const start = rows.length;
      rows.push({
        node,
        text: [text(node.props.title), text(node.props.subtitle)].filter(Boolean).join(" — "),
        item: false,
      });
      node.children.forEach(visit);
      if (rows.length === start + 1) rows.splice(start, 1);
    } else if (node.type !== "List.EmptyView") {
      rows.push({ node, text: `[Unsupported: ${node.type}]`, item: false });
    }
  }
  if (list?.type === "List") list.children.forEach(visit);
  else if (list) rows.push({ node: list, text: `[Unsupported: ${list.type}]`, item: false });
  const items = rows.filter((row) => row.item).map((row) => row.node);
  const desired = list?.props.selectedItemId ?? state.selectedId;
  const selected = items.find((item) => (item.props.id ?? item.id) === desired) ?? items[0];
  const empty = list?.children.find((node) => node.type === "List.EmptyView");
  return {
    list,
    rows,
    items,
    selected,
    title: text(list?.props.navigationTitle) || "Blast",
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
export function selectionId(node: SceneNode | undefined): string | null {
  return node ? text(node.props.id ?? node.id) : null;
}
export function event(node: SceneNode | undefined, name: string, args: JsonValue[] = []) {
  const ref = node?.props[name];
  return node && handler(ref) ? { node: node.id, handler: ref.$handler, args } : undefined;
}
