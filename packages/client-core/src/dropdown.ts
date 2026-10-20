import type { SceneNode } from "@blastlauncher/protocol";
import { slot, text } from "./nodes.ts";
import { filteringOf, rankGroups, score, type FilteringOptions, type Group } from "./rank.ts";

// The search-bar dropdown accessory (`List.Dropdown` / `Grid.Dropdown` inside
// the `searchBarAccessory` Slot). The runtime owns the value: it always sends
// the current `value` prop, and the client answers with an `onChange` event.

export type DropdownOption = {
  node: SceneNode;
  value: string;
  title: string;
  /** The enclosing section's title, empty for loose items. */
  section: string;
  /** The enclosing section's node id, empty for loose items. */
  sectionId: string;
};

export function searchBarDropdown(view: SceneNode | undefined): SceneNode | undefined {
  const accessory = view ? slot(view, "searchBarAccessory") : undefined;
  return accessory?.children.find(
    (child) => child.type === "List.Dropdown" || child.type === "Grid.Dropdown",
  );
}

export function dropdownOptions(dropdown: SceneNode | undefined): DropdownOption[] {
  const options: DropdownOption[] = [];
  function visit(node: SceneNode, section: string, sectionId: string) {
    if (node.type.endsWith("Dropdown.Section")) {
      const title = text(node.props.title);
      node.children.forEach((child) => visit(child, title, node.id));
    } else if (node.type.endsWith("Dropdown.Item")) {
      options.push({
        node,
        value: text(node.props.value),
        title: text(node.props.title),
        section,
        sectionId,
      });
    }
  }
  dropdown?.children.forEach((child) => visit(child, "", ""));
  return options;
}

/**
 * Filter and rank dropdown options for `query`: title, then keywords, then
 * value, per `rank.ts`. Sections follow `keepSectionOrder`; an empty query
 * keeps declaration order.
 */
export function filterOptions(
  options: DropdownOption[],
  query: string,
  filtering: FilteringOptions = { enabled: true, keepSectionOrder: false },
): DropdownOption[] {
  const groups: Group<DropdownOption, string>[] = [];
  for (const option of options) {
    const last = groups[groups.length - 1];
    // Consecutive options of one section (or consecutive loose ones) form a group.
    if (last?.section === option.sectionId) last.items.push(option);
    else groups.push({ section: option.sectionId, items: [option] });
  }
  return rankGroups(
    groups,
    query,
    (option) =>
      score(
        {
          title: option.title,
          subtitle: option.value,
          keywords: Array.isArray(option.node.props.keywords)
            ? option.node.props.keywords.map(text)
            : [],
        },
        query,
      ),
    filtering,
  ).flatMap((group) => group.items);
}

/**
 * The options a dropdown shows for `query`: client-filtered per the
 * dropdown's `filtering`, or all of them when it owns the search
 * (`onSearchTextChange`, forwarded with `searchDispatch`) or sets `filtering: false`.
 */
export function visibleOptions(dropdown: SceneNode | undefined, query: string): DropdownOption[] {
  return filterOptions(dropdownOptions(dropdown), query, filteringOf(dropdown));
}

/** The title shown next to the search bar for the dropdown's current value. */
export function dropdownLabel(dropdown: SceneNode | undefined, options: DropdownOption[]): string {
  const value = text(dropdown?.props.value ?? dropdown?.props.defaultValue);
  return options.find((option) => option.value === value)?.title || value;
}
