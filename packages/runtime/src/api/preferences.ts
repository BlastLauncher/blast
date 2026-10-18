// `getPreferenceValues()` from `@raycast/api`. The runtime installs the values
// from `init` before the extension is imported.
import type { JsonValue } from "@blastlauncher/protocol";

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
