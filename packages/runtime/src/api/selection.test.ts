import { afterEach, expect, test } from "bun:test";
import { setCapabilityRequester } from "./capability.ts";
import {
  getSelectedText,
  getSelectedFinderItems,
  getFrontmostApplication,
  showInFinder,
  trash,
} from "./index.ts";
import type { JsonValue } from "../reconciler/index.ts";

afterEach(() => setCapabilityRequester(undefined));

// @covers getSelectedText
// @covers getSelectedFinderItems
// @covers getFrontmostApplication
// @covers FileSystemItem
// @covers showInFinder
// @covers trash
test("selection and file APIs request capabilities and preserve declared wire values", async () => {
  const requests: Array<[string, JsonValue]> = [];
  const app = {
    name: "Editor",
    path: "/apps/editor",
    localizedName: "Editor",
    bundleId: "editor",
    windowsAppId: "editor",
  };
  setCapabilityRequester(async (name, params) => {
    requests.push([name, params]);
    if (name === "selection.text") return "selected";
    if (name === "selection.files") return [{ path: "/tmp/a", extra: true }];
    if (name === "applications.frontmost") return { ...app, extra: true };
    return null;
  });
  expect(await getSelectedText()).toBe("selected");
  expect(await getSelectedFinderItems()).toEqual([{ path: "/tmp/a" }]);
  expect(await getFrontmostApplication()).toEqual(app);
  for (const path of ["/tmp/a", Buffer.from("/tmp/a"), new URL("file:///tmp/a")]) {
    await showInFinder(path);
    await trash(path);
  }
  await trash(["/tmp/a", Buffer.from("/tmp/b"), new URL("file:///tmp/c")]);
  await trash([]);
  expect(requests).toEqual([
    ["selection.text", {}],
    ["selection.files", {}],
    ["applications.frontmost", {}],
    ["finder.show", { path: "/tmp/a" }],
    ["trash", { paths: ["/tmp/a"] }],
    ["finder.show", { path: "/tmp/a" }],
    ["trash", { paths: ["/tmp/a"] }],
    ["finder.show", { path: "file:///tmp/a" }],
    ["trash", { paths: ["file:///tmp/a"] }],
    ["trash", { paths: ["/tmp/a", "/tmp/b", "file:///tmp/c"] }],
    ["trash", { paths: [] }],
  ]);
});

test("every selection and file API propagates denial", async () => {
  setCapabilityRequester(async (name) => {
    throw new Error("Capability denied: " + name);
  });
  for (const [call, capability] of [
    [getSelectedText, "selection.text"],
    [getSelectedFinderItems, "selection.files"],
    [getFrontmostApplication, "applications.frontmost"],
    [() => showInFinder("/tmp/a"), "finder.show"],
    [() => trash("/tmp/a"), "trash"],
  ] as const)
    await expect(call()).rejects.toThrow("Capability denied: " + capability);
});

test("selection APIs reject malformed answers and file APIs reject invalid paths before effects", async () => {
  let requests = 0;
  setCapabilityRequester(async () => {
    requests++;
    return null;
  });
  for (const call of [getSelectedText, getSelectedFinderItems, getFrontmostApplication])
    await expect(call()).rejects.toThrow();
  for (const path of ["", 5 as unknown as string]) {
    await expect(showInFinder(path)).rejects.toThrow();
    await expect(trash(["/tmp/a", path])).rejects.toThrow();
  }
  expect(requests).toBe(3);
  setCapabilityRequester(async () => "");
  await expect(getSelectedText()).rejects.toThrow("No text selected");
  setCapabilityRequester(async () => [{ path: 4 }]);
  await expect(getSelectedFinderItems()).rejects.toThrow("invalid FileSystemItem");
});
