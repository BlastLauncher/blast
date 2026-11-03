import { List } from "@raycast/api";
import { createElement, use } from "react";

const value = new Promise((resolve) => setTimeout(() => resolve("settled"), 20));

export default function Command() {
  const title = use(value);
  return createElement(
    List,
    { navigationTitle: title },
    createElement(List.Item, { title: `${title} command` }),
  );
}
