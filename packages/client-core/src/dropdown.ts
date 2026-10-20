import type { SceneNode } from "@blastlauncher/protocol";
import { slot, text } from "./nodes.ts";

// The search-bar dropdown accessory (`List.Dropdown` / `Grid.Dropdown` inside
// the `searchBarAccessory` Slot). The runtime owns the value: it always sends
// the current `value` prop, and the client answers with an `onChange` event.

export type DropdownOption = { node: SceneNode; value: string; title: string; section: string };

export function searchBarDropdown(view: SceneNode | undefined): SceneNode | undefined {
  const accessory = view ? slot(view, "searchBarAccessory") : undefined;
  return accessory?.children.find(
    (child) => child.type === "List.Dropdown" || child.type === "Grid.Dropdown",
  );
}

export function dropdownOptions(dropdown: SceneNode | undefined): DropdownOption[] {
  const options: DropdownOption[] = [];
  function visit(node: SceneNode, section: string) {
    if (node.type.endsWith("Dropdown.Section")) {
      const title = text(node.props.title);
      node.children.forEach((child) => visit(child, title));
    } else if (node.type.endsWith("Dropdown.Item")) {
      options.push({ node, value: text(node.props.value), title: text(node.props.title), section });
    }
  }
  dropdown?.children.forEach((child) => visit(child, ""));
  return options;
}

export function filterOptions(options: DropdownOption[], query: string): DropdownOption[] {
  const needle = query.toLowerCase();
  if (!needle) return options;
  return options.filter(
    (option) =>
      option.title.toLowerCase().includes(needle) || option.value.toLowerCase().includes(needle),
  );
}

/** The title shown next to the search bar for the dropdown's current value. */
export function dropdownLabel(dropdown: SceneNode | undefined, options: DropdownOption[]): string {
  const value = text(dropdown?.props.value ?? dropdown?.props.defaultValue);
  return options.find((option) => option.value === value)?.title || value;
}
