import { getSelectedText } from "@raycast/api";
export default async function Command() {
  return getSelectedText();
}
