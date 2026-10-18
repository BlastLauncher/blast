import { afterEach, expect, test } from "bun:test";
import type { JsonValue } from "../reconciler/index.ts";
import { setCapabilityRequester } from "./capability.ts";
import { openCommandPreferences, openExtensionPreferences } from "./index.ts";

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
