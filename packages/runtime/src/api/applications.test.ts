import { afterEach, expect, test } from "bun:test";
import type { JsonValue } from "../reconciler/index.ts";
import { setCapabilityRequester } from "./capability.ts";
import { getApplications, getDefaultApplication } from "./index.ts";

afterEach(() => setCapabilityRequester(undefined));

// @covers getApplications
// @covers Application
// @covers Application.name
// @covers Application.path
// @covers Application.localizedName
// @covers Application.bundleId
// @covers Application.windowsAppId
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

// @covers getDefaultApplication
test("getDefaultApplication asks applications.default for one path", async () => {
  const requests: Array<{ name: string; params: JsonValue }> = [];
  const editor = { name: "Editor", path: "/Applications/Editor.app", bundleId: "org.editor" };
  setCapabilityRequester(async (name, params) => {
    requests.push({ name, params });
    return { ...editor, extra: true };
  });
  expect(await getDefaultApplication("/tmp/report.txt")).toEqual(editor);
  expect(await getDefaultApplication(Buffer.from("/tmp/a.md"))).toEqual(editor);
  await expect(getDefaultApplication("")).rejects.toThrow(
    "getDefaultApplication: path must not be empty",
  );
  expect(requests).toEqual([
    { name: "applications.default", params: { path: "/tmp/report.txt" } },
    { name: "applications.default", params: { path: "/tmp/a.md" } },
  ]);
});

// @covers getDefaultApplication
test("getDefaultApplication rejects when no application exists and on a malformed answer", async () => {
  setCapabilityRequester(() =>
    Promise.reject(new Error("No default application for /tmp/report.txt")),
  );
  await expect(getDefaultApplication("/tmp/report.txt")).rejects.toThrow(
    "No default application for /tmp/report.txt",
  );
  setCapabilityRequester(() =>
    Promise.reject(new Error("Capability denied: applications.default")),
  );
  await expect(getDefaultApplication("/tmp/report.txt")).rejects.toThrow(
    "Capability denied: applications.default",
  );
  setCapabilityRequester(async () => ({ path: "/Applications/Editor.app" }));
  await expect(getDefaultApplication("/tmp/report.txt")).rejects.toThrow(
    "the host returned an invalid Application",
  );
});
