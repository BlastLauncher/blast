import { afterEach, expect, test } from "bun:test";
import type { JsonValue } from "../reconciler/index.ts";
import { setCapabilityRequester } from "./capability.ts";
import {
  getPreferenceValues,
  openCommandPreferences,
  openExtensionPreferences,
  preferences,
} from "./index.ts";
import type { Preference, Preferences } from "./index.ts";
import { setPreferenceValues } from "./preferences.ts";

afterEach(() => setCapabilityRequester(undefined));

// @covers openExtensionPreferences
// @covers openCommandPreferences
test("opening preferences requests preferences.open with the scope", async () => {
  const requests: Array<{ name: string; params: JsonValue }> = [];
  setCapabilityRequester(async (name, params) => {
    requests.push({ name, params });
    return null;
  });
  await openExtensionPreferences();
  await openCommandPreferences();
  expect(requests).toEqual([
    { name: "preferences.open", params: { scope: "extension" } },
    { name: "preferences.open", params: { scope: "command" } },
  ]);
});

// @covers openExtensionPreferences
// @covers openCommandPreferences
test("opening preferences rejects when the host denies it", async () => {
  setCapabilityRequester(() => Promise.reject(new Error("Capability denied: preferences.open")));
  await expect(openExtensionPreferences()).rejects.toThrow("Capability denied: preferences.open");
  await expect(openCommandPreferences()).rejects.toThrow("Capability denied: preferences.open");
});

// @covers Preference
// @covers Preference.name
// @covers Preference.type
// @covers Preference.required
// @covers Preference.title
// @covers Preference.description
// @covers Preference.value
// @covers Preference.default
// @covers Preference.placeholder
// @covers Preference.label
// @covers Preference.data
// @covers Preferences
test("Preference keeps every declared manifest field", () => {
  const item: Preference = {
    name: "token",
    type: "password",
    required: true,
    title: "API token",
    description: "Sent with every request",
    value: "secret",
    default: "",
    placeholder: "sk-…",
    label: "Token",
    data: [{ title: "One", value: "one" }],
  };
  const all: Preferences = { token: item };
  expect(all.token).toEqual(item);
  expect(Object.keys(item)).toEqual([
    "name",
    "type",
    "required",
    "title",
    "description",
    "value",
    "default",
    "placeholder",
    "label",
    "data",
  ]);
});

// @covers preferences
// @covers Preferences
test("the deprecated preferences object carries the same values as getPreferenceValues", () => {
  setPreferenceValues({ maxItems: 20, pinned: true });
  expect(preferences.maxItems!.value).toBe(20);
  expect(preferences.pinned!.value).toBe(true);
  // The meta fields the init message does not carry fall back to the name.
  expect(preferences.maxItems!).toMatchObject({
    name: "maxItems",
    title: "maxItems",
    type: "textfield",
    required: false,
    description: "",
  });
  // A later install replaces the values in place, keeping module-level imports live.
  const installed = preferences;
  setPreferenceValues({ maxItems: 5 });
  expect(installed).toBe(preferences);
  expect("pinned" in preferences).toBe(false);
  expect(Object.keys(preferences)).toEqual(["maxItems"]);
  expect(preferences.maxItems!.value).toBe(5);
  expect(getPreferenceValues()).toEqual({ maxItems: 5 });
  setPreferenceValues({});
  expect(Object.keys(preferences)).toEqual([]);
});
