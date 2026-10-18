import * as RaycastAPI from "@raycast/api";
import { List as L } from "@raycast/api";

const api = require("@raycast/api");

export function useTitle(): string {
  return `${L !== undefined} ${typeof api.List}`;
}

export { List } from "@raycast/api";

export const namespace = RaycastAPI;
