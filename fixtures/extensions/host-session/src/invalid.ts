import { writeSync } from "node:fs";
import { getPreferenceValues } from "@raycast/api";
export default async function command() {
  writeSync(1, getPreferenceValues().wire);
  await new Promise(() => {});
}
