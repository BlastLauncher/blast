import { List } from "@raycast/api";
import { createElement, use } from "react";

const value = new Promise((_, reject) =>
  setTimeout(() => reject(new Error("suspense rejected")), 20),
);

export default function Command() {
  const title = use(value);
  return createElement(List, { navigationTitle: title });
}
