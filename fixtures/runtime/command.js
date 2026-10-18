import { Action, ActionPanel, List } from "@raycast/api";
import { useEffect, useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
import { jsxDEV } from "react/jsx-dev-runtime";

console.log("fixture %s", "loaded");
console.warn("fixture warning");
console.assert(false, "fixture assertion");
export default function Command() {
  const [count, setCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const [crash, setCrash] = useState(false);
  useEffect(() => () => console.info("unmounted"), []);
  if (crash) throw new Error("async render failed");
  return jsx(List, {
    navigationTitle: `${count}:${copied}`,
    children: jsxDEV(
      List.Item,
      {
        title: "Fixture",
        actions: jsxs(ActionPanel, {
          children: [
            jsx(Action, { title: "Increment", onAction: () => setCount(count + 1) }),
            jsx(Action.CopyToClipboard, { content: "hello", onCopy: () => setCopied(true) }),
            jsx(Action, {
              title: "Throw",
              onAction: () => {
                throw new Error("handler failed");
              },
            }),
            jsx(Action, {
              title: "Async crash",
              onAction: () => {
                setTimeout(() => setCrash(true), 0);
              },
            }),
            jsx(Action, {
              title: "Uncaught",
              onAction: () => {
                setTimeout(() => {
                  throw new Error("uncaught");
                }, 0);
              },
            }),
            jsx(Action, {
              title: "Unhandled",
              onAction: () => {
                void Promise.reject(new Error("unhandled"));
              },
            }),
          ],
        }),
      },
      undefined,
      false,
      undefined,
      undefined,
    ),
  });
}
