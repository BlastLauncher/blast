// `getPreferenceValues()`, `openExtensionPreferences()` and
// `openCommandPreferences()` from `@raycast/api`. The runtime installs the
// values from `init` before the extension is imported; opening the preference
// window has no desktop equivalent, so it is a capability.
import type { JsonValue } from "@blastlauncher/protocol";
import { requestCapability } from "./capability.ts";

export type PreferenceValues = Record<string, JsonValue>;

/** The preference kinds the manifest defines, exactly as the declarations list them. */
export type PreferenceType =
  | "appPicker"
  | "checkbox"
  | "dropdown"
  | "password"
  | "textfield"
  | "file"
  | "directory";

/** `Preference`: one manifest preference item with the value this command got. */
export interface Preference {
  /** The name of the preference. */
  name: string;
  /** The type of the preference. */
  type: PreferenceType;
  /** Specifies if the preference is required. */
  required: boolean;
  /** The title of the preference. */
  title: string;
  /** The description of the preference. */
  description: string;
  /** The value of the preference. */
  value?: unknown;
  /** The default value when there is no `value`. */
  default?: unknown;
  /** A placeholder used for text fields and passwords. */
  placeholder?: string;
  /** A label used for checkboxes. */
  label?: string;
  /** The data used for dropdowns. */
  data?: unknown[];
}

/** `Preferences`: the deprecated record of preference items. */
export type Preferences = Record<string, Preference>;

let preferenceValues: PreferenceValues = {};

/**
 * The deprecated `preferences` object. It is mutated in place rather than
 * replaced so extension modules that import it keep seeing the values from
 * `init`; each entry's `value` is the same value `getPreferenceValues()` returns.
 */
export const preferences: Preferences = {};

function installPreferences(values: PreferenceValues): void {
  for (const name of Object.keys(preferences)) delete preferences[name];
  for (const [name, value] of Object.entries(values)) {
    // `init` carries values only, so the manifest metadata the declarations
    // require falls back to the preference's name and the text-field defaults.
    preferences[name] = {
      name,
      type: "textfield",
      required: false,
      title: name,
      description: "",
      value,
    };
  }
}

/** Installs the preference values from `init`. */
export function setPreferenceValues(next: PreferenceValues): void {
  preferenceValues = next;
  installPreferences(next);
}

/** The preference values for this command, as a fresh shallow copy. */
export function getPreferenceValues<Values extends PreferenceValues = PreferenceValues>(): Values {
  return { ...preferenceValues } as Values;
}

/** Opens Raycast's preference window and selects the current extension. */
export async function openExtensionPreferences(): Promise<void> {
  await requestCapability("preferences.open", { scope: "extension" });
}

/** Opens Raycast's preference window and selects the current command. */
export async function openCommandPreferences(): Promise<void> {
  await requestCapability("preferences.open", { scope: "command" });
}
