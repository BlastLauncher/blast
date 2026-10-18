import { createElement, type ReactNode } from "react";
import { useDropdown } from "./dropdown.ts";
import { GridFit, GridInset, GridItemSize } from "./enums.generated.ts";
import { slot } from "./slot.ts";
import type { ColorLike, ImageLike } from "./types.ts";

/** `Grid.ItemSize`: the size of the grid's items; deprecated for `columns`. */
export type GridItemSize = (typeof GridItemSize)[keyof typeof GridItemSize];

/** `Grid.Inset`: space between an item's content and its borders. */
export type GridInset = (typeof GridInset)[keyof typeof GridInset];

/** `Grid.Fit`: how item content fits its cell. */
export type GridFit = (typeof GridFit)[keyof typeof GridFit];

/** Allowed `aspectRatio` values, widened from the `GridAspectRatio` enum. */
export type GridAspectRatio = "1" | "3/2" | "2/3" | "4/3" | "3/4" | "16/9" | "9/16";

/** `Grid.Item.Props.content`: an image, a color, or either with a tooltip. */
export type GridItemContent =
  | ImageLike
  | { color: ColorLike }
  | { value: ImageLike | { color: ColorLike }; tooltip: string };

/** `Grid.Item.Accessory`: an optional icon with a tooltip, under the item. */
export interface GridItemAccessory {
  /** An optional image shown underneath the item. */
  icon?: ImageLike | null;
  /** An optional tooltip shown when the accessory is hovered. */
  tooltip?: string | null;
}

export interface GridProps {
  /** Grid sections or items. */
  children?: ReactNode;
  /** The main title for that view displayed in the host. */
  navigationTitle?: string;
  /** Indicates whether a loading bar should be shown below the search bar. */
  isLoading?: boolean;
  /** The text that will be displayed in the search bar. */
  searchText?: string;
  /** Placeholder text of the search bar. */
  searchBarPlaceholder?: string;
  /**
   * Toggles client-side filtering of the items through the search bar; the
   * client decides how to honor it (see task 0020, "Out of scope").
   */
  filtering?: boolean | { keepSectionOrder: boolean };
  /** Deprecated; use `filtering` instead. */
  enableFiltering?: boolean;
  /**
   * Defines whether the `onSearchTextChange` handler fires on every keystroke
   * or with a throttling delay.
   */
  throttle?: boolean;
  /** Callback triggered when the search bar text changes. */
  onSearchTextChange?: (text: string) => void;
  /** Callback triggered when the item selection in the grid changes. */
  onSelectionChange?: (id: string | null) => void;
  /** Selects the item with the specified id. */
  selectedItemId?: string;
  /** Column count for the grid's sections. */
  columns?: number;
  /** Deprecated; use `columns` instead. */
  itemSize?: GridItemSize;
  /** Aspect ratio for the `Grid.Item` elements. */
  aspectRatio?: GridAspectRatio;
  /** Fit for the `Grid.Item` element content. */
  fit?: GridFit;
  /** Space between a `Grid.Item`'s content and its borders. */
  inset?: GridInset;
  /**
   * Pagination configuration; `onLoadMore` fires when the client loads the
   * next page (Blast records the request like any other handler).
   */
  pagination?: { pageSize: number; hasMore: boolean; onLoadMore: () => void };
  /** An ActionPanel; rendered as a `Slot` child named `actions`. */
  actions?: ReactNode;
  /** A search bar accessory; rendered as a `Slot` child named `searchBarAccessory`. */
  searchBarAccessory?: ReactNode;
}

export interface GridItemProps {
  /** Passed to the `onSelectionChange` handler of the Grid when selected. */
  id?: string;
  /** An image or color, optionally with a tooltip, representing the content. */
  content: GridItemContent;
  /** An optional title displayed below the content. */
  title?: string;
  /** An optional subtitle displayed below the title. */
  subtitle?: string;
  /** Additional indexable strings for search. */
  keywords?: string[];
  /** An optional accessory displayed underneath the item. */
  accessory?: GridItemAccessory;
  /** Optional information to preview files with Quick Look. */
  quickLook?: { name?: string | null; path: string };
  /** An ActionPanel; rendered as a `Slot` child named `actions`. */
  actions?: ReactNode;
}

export interface GridSectionProps {
  /** The `Grid.Item` elements of the section. */
  children?: ReactNode;
  /** Title displayed above the section. */
  title?: string;
  /** An optional subtitle displayed next to the title of the section. */
  subtitle?: string;
  /** Column count for the section. */
  columns?: number;
  /** Aspect ratio for the section's `Grid.Item` elements. */
  aspectRatio?: GridAspectRatio;
  /** Fit for the section's `Grid.Item` element content. */
  fit?: GridFit;
  /** Space between the section's `Grid.Item` content and its borders. */
  inset?: GridInset;
}

export interface GridEmptyViewProps {
  /** The main title displayed for the empty view. */
  title?: string;
  /** An optional description for why the empty view is shown. */
  description?: string;
  /** An optional icon displayed in the center of the empty view. */
  icon?: ImageLike | null;
  /** An ActionPanel; rendered as a `Slot` child named `actions`. */
  actions?: ReactNode;
}

export interface GridDropdownItemProps {
  /** Value of the dropdown item; passed to `onChange` when selected. */
  value: string;
  /** The title displayed for the item. */
  title: string;
  /** An optional icon displayed for the item. */
  icon?: ImageLike | null;
  /** Additional indexable strings for search. */
  keywords?: string[];
}

export interface GridDropdownSectionProps {
  /** The `Grid.Dropdown.Item` elements of the section. */
  children?: ReactNode;
  /** Title displayed above the section. */
  title?: string;
}

export interface GridDropdownProps {
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

const GridDropdownItem = function GridDropdownItem(props: GridDropdownItemProps) {
  return createElement("Grid.Dropdown.Item", props);
};

const GridDropdownSection = function GridDropdownSection(props: GridDropdownSectionProps) {
  return createElement("Grid.Dropdown.Section", props);
};

const GridDropdown = Object.assign(
  function GridDropdown(props: GridDropdownProps) {
    return useDropdown("Grid.Dropdown", props);
  },
  { Item: GridDropdownItem, Section: GridDropdownSection },
);

const GridItem = function GridItem(props: GridItemProps) {
  const { actions, ...rest } = props;
  return createElement("Grid.Item", rest, slot("actions", actions));
};

function GridSection(props: GridSectionProps) {
  return createElement("Grid.Section", props);
}

function GridEmptyView(props: GridEmptyViewProps) {
  const { actions, ...rest } = props;
  return createElement("Grid.EmptyView", rest, slot("actions", actions));
}

export const Grid = Object.assign(
  function Grid(props: GridProps) {
    const { actions, searchBarAccessory, children, ...rest } = props;
    return createElement(
      "Grid",
      rest,
      children,
      slot("actions", actions),
      slot("searchBarAccessory", searchBarAccessory),
    );
  },
  {
    Item: GridItem,
    Section: GridSection,
    EmptyView: GridEmptyView,
    Dropdown: GridDropdown,
    Inset: GridInset,
    ItemSize: GridItemSize,
    Fit: GridFit,
  },
);
