import { Clipboard } from "@raycast/api";

export default async function Command() {
  return Clipboard.readImage();
}
