import { createElement, type ReactNode } from "react";
import { slot } from "./slot.ts";
import type { ImageLike } from "./types.ts";

export interface ListProps {
  /** List sections or items. */
  children?: ReactNode;
  /** The main title for that view displayed in the host. */
  navigationTitle?: string;
  /** Indicates whether a loading bar should be shown below the search bar. */
  isLoading?: boolean;
  /** The text that will be displayed in the search bar. */
  searchText?: string;
  /** Placeholder text of the search bar. */
  searchBarPlaceholder?: string;
  /** Whether the list should show details for the selected item. */
  isShowingDetail?: boolean;
  /** Selects the item with the specified id. */
  selectedItemId?: string;
  /** Callback triggered when the item selection in the list changes. */
  onSelectionChange?: (id: string | null) => void;
  /** An ActionPanel; rendered as a `Slot` child named `actions`. */
  actions?: ReactNode;
  /** A search bar accessory; rendered as a `Slot` child named `searchBarAccessory`. */
  searchBarAccessory?: ReactNode;
}

export interface ListItemProps {
  /** Passed to the `onSelectionChange` handler of the List when selected. */
  id?: string;
  /** The main title displayed for the item, optionally with a tooltip. */
  title: string | { value: string; tooltip?: string | null };
  /** An optional subtitle, optionally with a tooltip. */
  subtitle?: string | { value?: string | null; tooltip?: string | null };
  /** Additional indexable strings for search. */
  keywords?: string[];
  /** An optional icon displayed for the item. */
  icon?: ImageLike | { value: ImageLike | null | undefined; tooltip: string };
  /** An ActionPanel; rendered as a `Slot` child named `actions`. */
  actions?: ReactNode;
  /** A `List.Item.Detail`; rendered as a `Slot` child named `detail`. */
  detail?: ReactNode;
}

export interface ListSectionProps {
  /** The `List.Item` elements of the section. */
  children?: ReactNode;
  /** Title displayed above the section. */
  title?: string;
  /** An optional subtitle displayed next to the title of the section. */
  subtitle?: string;
}

export interface ListEmptyViewProps {
  /** The main title displayed for the empty view. */
  title?: string;
  /** An optional description for why the empty view is shown. */
  description?: string;
  /** An optional icon displayed in the center of the empty view. */
  icon?: ImageLike;
  /** An ActionPanel; rendered as a `Slot` child named `actions`. */
  actions?: ReactNode;
}

function ListItem(props: ListItemProps) {
  const { actions, detail, ...rest } = props;
  return createElement("List.Item", rest, slot("actions", actions), slot("detail", detail));
}

function ListSection(props: ListSectionProps) {
  return createElement("List.Section", props);
}

function ListEmptyView(props: ListEmptyViewProps) {
  const { actions, ...rest } = props;
  return createElement("List.EmptyView", rest, slot("actions", actions));
}

export const List = Object.assign(
  function List(props: ListProps) {
    const { actions, searchBarAccessory, children, ...rest } = props;
    return createElement(
      "List",
      rest,
      children,
      slot("actions", actions),
      slot("searchBarAccessory", searchBarAccessory),
    );
  },
  { Item: ListItem, Section: ListSection, EmptyView: ListEmptyView },
);
