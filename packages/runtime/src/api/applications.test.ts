import { afterEach, expect, test } from "bun:test";
import type { JsonValue } from "../reconciler/index.ts";
import { setCapabilityRequester } from "./capability.ts";
import { getApplications } from "./index.ts";

afterEach(() => setCapabilityRequester(undefined));

// @covers getApplications
// @covers Application
test("getApplications asks applications.list with an optional path and keeps the declared fields", async () => {
  const requests: Array<{ name: string; params: JsonValue }> = [];
  const safari = {
    name: "Safari",
    path: "/Applications/Safari.app",
    localizedName: "Safari",
    bundleId: "com.apple.Safari",
    windowsAppId: "Safari",
  };
  setCapabilityRequester(async (name, params) => {
    requests.push({ name, params });
    // The wire may carry more than the declarations promise; only the declared
    // fields reach the extension.
    return [{ ...safari, isRunning: true }];
  });
  expect(await getApplications()).toEqual([safari]);
  expect(await getApplications("/tmp/report.txt")).toEqual([safari]);
  expect(await getApplications(Buffer.from("/tmp/report.txt"))).toEqual([safari]);
  expect(await getApplications(new URL("file:///tmp/report.txt"))).toEqual([safari]);
  expect(requests).toEqual([
    { name: "applications.list", params: {} },
    { name: "applications.list", params: { path: "/tmp/report.txt" } },
    { name: "applications.list", params: { path: "/tmp/report.txt" } },
    { name: "applications.list", params: { path: "file:///tmp/report.txt" } },
  ]);
});

// @covers getApplications
test("getApplications rejects a malformed answer, an empty path and a denial", async () => {
  const requests: Array<{ name: string; params: JsonValue }> = [];
  setCapabilityRequester(async (name, params) => {
    requests.push({ name, params });
    return null;
  });
  await expect(getApplications("")).rejects.toThrow("getApplications: path must not be empty");
  expect(requests).toEqual([]);
  await expect(getApplications()).rejects.toThrow("the host returned a non-array");

  setCapabilityRequester(async () => [{ name: "nameless" }]);
  await expect(getApplications()).rejects.toThrow("the host returned an invalid Application");

  setCapabilityRequester(() => Promise.reject(new Error("Capability denied: applications.list")));
  await expect(getApplications()).rejects.toThrow("Capability denied: applications.list");
});
