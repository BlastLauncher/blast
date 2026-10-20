import { Action, Clipboard, List } from "@raycast/api";
import { createElement } from "react";

export function EventCommand() {
  return createElement(
    List,
    null,
    createElement(Action, {
      title: "Unsupported sync",
      onAction: () => Clipboard.readImage(),
    }),
    createElement(Action, {
      title: "Unsupported async",
      onAction: async () => Clipboard.readImage(),
    }),
  );
}

export { EventCommand as default };
