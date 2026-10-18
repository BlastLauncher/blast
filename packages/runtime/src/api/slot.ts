import { createElement, type ReactNode } from "react";

/**
 * Element-valued props (`actions`, `detail`, …) cannot live inside serializable
 * props, so the shim renders each one as a `Slot` host child named after the
 * prop, containing the element. See "Scene conventions" in docs/architecture.md.
 */
export function slot(name: string, element: ReactNode): ReactNode {
  if (element === null || element === undefined || typeof element === "boolean") return null;
  return createElement("Slot", { name }, element);
}
