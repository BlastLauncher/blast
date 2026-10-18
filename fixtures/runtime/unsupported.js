import { Action, List, WindowManagement, getDefaultApplication } from "@raycast/api";
import { createElement } from "react";

export default function Command() {
  return createElement(WindowManagement);
}
export function EventCommand() {
  return createElement(
    List,
    null,
    createElement(Action, {
      title: "Unsupported sync",
      onAction: () => getDefaultApplication("/tmp/report.pdf"),
    }),
    createElement(Action, {
      title: "Unsupported async",
      onAction: async () => getDefaultApplication("/tmp/report.pdf"),
    }),
  );
}
