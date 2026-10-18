import { createElement, type ReactNode } from "react";
import type { ColorLike, ImageLike } from "./types.ts";

export interface MetadataLabelProps {
  /** The title of the item. */
  title: string;
  /** An icon to illustrate the value of the item. */
  icon?: ImageLike | null;
  /**
   * The text value of the item. Specifying `color` displays the text in the
   * provided color, defaulting to `Color.PrimaryText`.
   */
  text?: string | { value: string; color?: ColorLike | null };
}

export interface MetadataLinkProps {
  /** The title shown above the item. */
  title: string;
  /** The target of the link. */
  target: string;
  /** The text value of the item. */
  text: string;
}

export interface MetadataProps {
  /** The elements of the Metadata view. */
  children?: ReactNode;
}

export interface MetadataSeparatorProps {}

export interface MetadataTagListProps {
  /** The title shown above the item. */
  title: string;
  /** The tags contained in the TagList. */
  children?: ReactNode;
}

export interface MetadataTagListItemProps {
  /** The optional tag icon. Required if the tag has no text. */
  icon?: ImageLike | null;
  /** The optional tag text. Required if the tag has no icon. */
  text?: string;
  /** Changes the text color to the provided color and sets a transparent background with the same color. */
  color?: ColorLike | null;
  /** Callback that is triggered when the item is clicked. */
  onAction?: () => void;
}

export interface MetadataComponents {
  (props: MetadataProps): ReactNode;
  Label: (props: MetadataLabelProps) => ReactNode;
  Link: (props: MetadataLinkProps) => ReactNode;
  Separator: (props: MetadataSeparatorProps) => ReactNode;
  TagList: {
    (props: MetadataTagListProps): ReactNode;
    Item: (props: MetadataTagListItemProps) => ReactNode;
  };
}

/**
 * `Detail.Metadata` and `List.Item.Detail.Metadata` render the same props, but
 * scene element types are the public Raycast paths, so the namespace is built
 * from the path of the view that owns it.
 */
export function createMetadata(prefix: "Detail" | "List.Item.Detail"): MetadataComponents {
  const path = `${prefix}.Metadata`;
  function Metadata(props: MetadataProps) {
    return createElement(path, props);
  }
  function Label(props: MetadataLabelProps) {
    return createElement(`${path}.Label`, props);
  }
  function Link(props: MetadataLinkProps) {
    return createElement(`${path}.Link`, props);
  }
  function Separator(props: MetadataSeparatorProps) {
    return createElement(`${path}.Separator`, props);
  }
  function TagList(props: MetadataTagListProps) {
    return createElement(`${path}.TagList`, props);
  }
  function TagListItem(props: MetadataTagListItemProps) {
    return createElement(`${path}.TagList.Item`, props);
  }
  return Object.assign(Metadata, {
    Label,
    Link,
    Separator,
    TagList: Object.assign(TagList, { Item: TagListItem }),
  });
}
