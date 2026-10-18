import { createElement, type ReactNode } from "react";
import { createMetadata } from "./metadata.ts";
import { slot } from "./slot.ts";

export interface DetailProps {
  markdown?: string | null;
  /** A `Detail.Metadata`; rendered as a `Slot` child named `metadata`. */
  metadata?: ReactNode;
  /** An ActionPanel; rendered as a `Slot` child named `actions`. */
  actions?: ReactNode;
  navigationTitle?: string;
  isLoading?: boolean;
}

export interface ListItemDetailProps {
  /** Indicates whether a loading bar should be shown above the detail. */
  isLoading?: boolean;
  /** The CommonMark string rendered when the parent item is selected. */
  markdown?: string | null;
  /** A `List.Item.Detail.Metadata`; rendered as a `Slot` child named `metadata`. */
  metadata?: ReactNode;
}

export const Detail = Object.assign(
  function Detail(props: DetailProps) {
    const { actions, metadata, ...rest } = props;
    return createElement("Detail", rest, slot("actions", actions), slot("metadata", metadata));
  },
  { Metadata: createMetadata("Detail") },
);

export const ListItemDetail = Object.assign(
  function ListItemDetail(props: ListItemDetailProps) {
    const { metadata, ...rest } = props;
    return createElement("List.Item.Detail", rest, slot("metadata", metadata));
  },
  { Metadata: createMetadata("List.Item.Detail") },
);
