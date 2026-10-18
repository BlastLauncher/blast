import { Clipboard, getPreferenceValues } from "@raycast/api";
export default async function command() {
  await Clipboard.copy(String(getPreferenceValues().text));
}
