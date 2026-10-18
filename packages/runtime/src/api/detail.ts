import { createElement, type ReactNode } from "react";
import { slot } from "./slot.ts";

export interface DetailProps {
  markdown?: string | null;
  metadata?: ReactNode;
  actions?: ReactNode;
  navigationTitle?: string;
  isLoading?: boolean;
}

export function Detail(props: DetailProps) {
  const { actions, metadata, ...rest } = props;
  return createElement("Detail", rest, slot("actions", actions), slot("metadata", metadata));
}
