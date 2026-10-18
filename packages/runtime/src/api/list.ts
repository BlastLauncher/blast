import { createElement, type ReactNode } from "react";
import { useDropdown } from "./dropdown.ts";
import { ListItemDetail } from "./detail.ts";
import { slot } from "./slot.ts";
import type { ColorLike, ImageLike } from "./types.ts";

/** `List.Item.Accessory`: a text, date or tag label with optional icon/tooltip. */
export interface ListAccessory {
  /** An optional text label, optionally colored. */
  text?: string | null | { value: string | null | undefined; color?: string };
  /** An optional date label (rendered relative to now), optionally colored. */
  date?: Date | null | { value: Date | null | undefined; color?: string };
  /** A string or date tag; the color also tints the background. */
  tag?: string | Date | null | { value: string | Date | null | undefined; color?: ColorLike };
  /** An optional image shown in front of the label. */
  icon?: ImageLike | null;
  /** An optional tooltip shown when the accessory is hovered. */
  tooltip?: string | null;
}

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
  /** Deprecated alias of filtering. */
  enableFiltering?: boolean;
  /** Clients request subsequent pages through onLoadMore. */
  pagination?: { pageSize: number; hasMore: boolean; onLoadMore: () => void };
  /**
   * Toggles client-side filtering of the items through the search bar; the
   * client decides how to honor it (see task 0020, "Out of scope").
   */
  filtering?: boolean | { keepSectionOrder: boolean };
  /**
   * Defines whether the `onSearchTextChange` handler fires on every keystroke
   * or with a throttling delay.
   */
  throttle?: boolean;
  /** Callback triggered when the search bar text changes. */
  onSearchTextChange?: (text: string) => void;
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
  /** Accessory items displayed on the right side of the item. */
  accessories?: ListAccessory[] | null;
  /** Deprecated single-accessory props, retained for clients. */
  accessoryIcon?: ImageLike;
  accessoryTitle?: string;
  /** File metadata for client Quick Look previews. */
  quickLook?: { name?: string | null; path: string };
  /** An ActionPanel; rendered as a `Slot` child named `actions`. */
  actions?: ReactNode;
  /** A `List.Item.Detail`; rendered as a `Slot` child named `detail`. */
  detail?: ReactNode;
}

export interface ListSectionProps {
  /** Deprecated internal section identifier. */
  id?: string;
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
  icon?: ImageLike | null;
  /** An ActionPanel; rendered as a `Slot` child named `actions`. */
  actions?: ReactNode;
}

export interface ListDropdownItemProps {
  /** Value of the dropdown item; passed to `onChange` when selected. */
  value: string;
  /** The title displayed for the item. */
  title: string;
  /** An optional icon displayed for the item. */
  icon?: ImageLike | null;
  /** Additional indexable strings for search. */
  keywords?: string[];
}

export interface ListDropdownSectionProps {
  /** The `List.Dropdown.Item` elements of the section. */
  children?: ReactNode;
  /** Title displayed above the section. */
  title?: string;
}

export interface ListDropdownProps {
  /** The dropdown sections or items. */
  children?: ReactNode;
  /** ID of the dropdown. */
  id?: string;
  /** Tooltip displayed when hovering the dropdown. */
  tooltip: string;
  /** Placeholder text shown in the dropdown search field. */
  placeholder?: string;
  /**
   * Persist the selected value per command and dropdown id across runs.
   */
  storeValue?: boolean;
  /** The current value of the dropdown. */
  value?: string;
  /** The default value of the dropdown, configured once per component lifecycle. */
  defaultValue?: string;
  /** Toggles client-side filtering of the dropdown items. */
  filtering?: boolean | { keepSectionOrder: boolean };
  /** Indicates whether a loading indicator should be shown next to the dropdown. */
  isLoading?: boolean;
  /** Defines whether `onSearchTextChange` fires on every keystroke or throttled. */
  throttle?: boolean;
  /** Callback triggered when the dropdown search field text changes. */
  onSearchTextChange?: (text: string) => void;
  /** Callback triggered when the dropdown selection changes. */
  onChange?: (newValue: string) => void;
}

const ListDropdownItem = function ListDropdownItem(props: ListDropdownItemProps) {
  return createElement("List.Dropdown.Item", props);
};

const ListDropdownSection = function ListDropdownSection(props: ListDropdownSectionProps) {
  return createElement("List.Dropdown.Section", props);
};

const ListDropdown = Object.assign(
  function ListDropdown(props: ListDropdownProps) {
    return useDropdown("List.Dropdown", props);
  },
  { Item: ListDropdownItem, Section: ListDropdownSection },
);

const ListItem = Object.assign(
  function ListItem(props: ListItemProps) {
    const { actions, detail, ...rest } = props;
    return createElement("List.Item", rest, slot("actions", actions), slot("detail", detail));
  },
  { Detail: ListItemDetail },
);

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
  { Item: ListItem, Section: ListSection, EmptyView: ListEmptyView, Dropdown: ListDropdown },
);
