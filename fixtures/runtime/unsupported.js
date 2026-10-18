import { Action, List, FormTextField, randomId } from "@raycast/api";
import { createElement } from "react";

export default function Command() {
  return createElement(FormTextField);
}
export function EventCommand() {
  return createElement(
    List,
    null,
    createElement(Action, {
      title: "Unsupported sync",
      onAction: () => randomId(),
    }),
    createElement(Action, {
      title: "Unsupported async",
      onAction: async () => randomId(),
    }),
  );
}
