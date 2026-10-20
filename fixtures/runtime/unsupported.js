import { Clipboard } from "@raycast/api";

// An API from a future @raycast/api release: the stub must fail loudly.
export default function Command() {
  Clipboard.readImage();
  return null;
}
