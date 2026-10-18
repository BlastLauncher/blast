// `getPreferenceValues()`, `openExtensionPreferences()` and
// `openCommandPreferences()` from `@raycast/api`. The runtime installs the
// values from `init` before the extension is imported; opening the preference
// window has no desktop equivalent, so it is a capability.
import type { JsonValue } from "@blastlauncher/protocol";
import { requestCapability } from "./capability.ts";

export type PreferenceValues = Record<string, JsonValue>;

let preferences: PreferenceValues = {};

/** Installs the preference values from `init`. */
export function setPreferenceValues(next: PreferenceValues): void {
  preferences = next;
}

/** The preference values for this command, as a fresh shallow copy. */
export function getPreferenceValues<Values extends PreferenceValues = PreferenceValues>(): Values {
  return { ...preferences } as Values;
}

/** Opens Raycast's preference window and selects the current extension. */
export async function openExtensionPreferences(): Promise<void> {
  await requestCapability("preferences.open", { scope: "extension" });
}

/** Opens Raycast's preference window and selects the current command. */
export async function openCommandPreferences(): Promise<void> {
  await requestCapability("preferences.open", { scope: "command" });
}
