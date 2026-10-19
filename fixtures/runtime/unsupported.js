import { Action, List, render, randomId } from "@raycast/api";
import { createElement } from "react";

export default function Command() {
  return createElement(render);
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
