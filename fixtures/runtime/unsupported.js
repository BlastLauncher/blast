import { Action, Form, List, showInFinder } from "@raycast/api";
import { createElement } from "react";

export default function Command() {
  return createElement(Form.FilePicker);
}
export function EventCommand() {
  return createElement(
    List,
    null,
    createElement(Action, {
      title: "Unsupported sync",
      onAction: () => showInFinder("/tmp/report.pdf"),
    }),
    createElement(Action, {
      title: "Unsupported async",
      onAction: async () => showInFinder("/tmp/report.pdf"),
    }),
  );
}
