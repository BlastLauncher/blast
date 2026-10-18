import { captureException, captureMemorySnapshot } from "@raycast/api";
export default function Command() {
  captureException(new Error("diagnostic fixture"));
  captureMemorySnapshot("fixture checkpoint");
}
