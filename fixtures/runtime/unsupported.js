import { Action, Clipboard, Form, List } from "@raycast/api";
import { createElement } from "react";

export default function Command() {
  return createElement(Form.FilePicker);
}
export function EventCommand() {
  return createElement(
    List,
    null,
    createElement(Action, { title: "Unsupported sync", onAction: () => Clipboard.read() }),
    createElement(Action, { title: "Unsupported async", onAction: async () => Clipboard.read() }),
  );
}
