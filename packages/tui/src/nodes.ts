import type { HandlerRef, JsonValue, SceneNode } from "@blastlauncher/protocol";

// Primitives shared by every view module (List, Grid, dropdown); view.ts
// re-exports these so existing imports keep working.
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
export function selectionId(node: SceneNode | undefined): string | null {
  return node ? text(node.props.id ?? node.id) : null;
}
export function event(node: SceneNode | undefined, name: string, args: JsonValue[] = []) {
  const ref = node?.props[name];
  return node && handler(ref) ? { node: node.id, handler: ref.$handler, args } : undefined;
}
/** Client-side filtering is on unless the view opts out or owns it. */
export function isFiltering(node: SceneNode | undefined): boolean {
  return node?.props.filtering !== false && !handler(node?.props.onSearchTextChange);
}
/** Case-insensitive substring match over title, subtitle and keywords. */
export function matchesQuery(node: SceneNode, query: string): boolean {
  const keywords = Array.isArray(node.props.keywords) ? node.props.keywords.map(text) : [];
  return [text(node.props.title), text(node.props.subtitle), ...keywords].some((value) =>
    value.toLowerCase().includes(query),
  );
}
