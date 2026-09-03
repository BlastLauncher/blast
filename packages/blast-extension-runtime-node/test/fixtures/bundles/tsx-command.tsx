import { List, Icon } from "@raycast/api";

export default function Command() {
  return List;
}

export function command() {
  return `${List}:${Icon.Circle}`;
}
