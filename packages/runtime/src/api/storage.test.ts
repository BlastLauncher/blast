import { afterEach, expect, test } from "bun:test";
import type { JsonValue } from "../reconciler/index.ts";
import { setCapabilityRequester } from "./capability.ts";
import * as implemented from "./implemented.ts";
import {
  LocalStorage,
  allLocalStorageItems,
  clearLocalStorage,
  getLocalStorageItem,
  removeLocalStorageItem,
  setLocalStorageItem,
  type LocalStorageValue,
} from "./index.ts";

afterEach(() => setCapabilityRequester(undefined));

// @covers LocalStorage
// @covers LocalStorage.Value
// @covers LocalStorage.Values
// @covers LocalStorage.getItem
// @covers LocalStorage.setItem
// @covers LocalStorage.removeItem
// @covers LocalStorage.allItems
// @covers LocalStorage.clear
test("LocalStorage delegates every method to its capability and hides missing keys as undefined", async () => {
  const requests: Array<[string, JsonValue]> = [];
  const items: Record<string, LocalStorageValue> = { count: 2, fruit: "cherry", fresh: true };
  setCapabilityRequester(async (name, params) => {
    requests.push([name, params]);
    if (name === "storage.get") return items[String(params.key)] ?? null;
    if (name === "storage.all") return items;
    return null;
  });
  await LocalStorage.setItem("count", 2);
  await LocalStorage.setItem("fruit", "cherry");
  await LocalStorage.setItem("fresh", true);
  expect(await LocalStorage.getItem<number>("count")).toBe(2);
  expect(await LocalStorage.getItem<string>("fruit")).toBe("cherry");
  expect(await LocalStorage.getItem("missing")).toBeUndefined();
  expect(await LocalStorage.allItems()).toEqual(items);
  await LocalStorage.removeItem("fruit");
  await LocalStorage.clear();
  expect(requests).toEqual([
    ["storage.set", { key: "count", value: 2 }],
    ["storage.set", { key: "fruit", value: "cherry" }],
    ["storage.set", { key: "fresh", value: true }],
    ["storage.get", { key: "count" }],
    ["storage.get", { key: "fruit" }],
    ["storage.get", { key: "missing" }],
    ["storage.all", {}],
    ["storage.remove", { key: "fruit" }],
    ["storage.clear", {}],
  ]);
});

// @covers LocalStorage.setItem
// @covers LocalStorage.getItem
// @covers LocalStorage.removeItem
test("LocalStorage rejects empty keys and unsupported values before asking the host", async () => {
  const requests: unknown[] = [];
  setCapabilityRequester(async (name, params) => {
    requests.push([name, params]);
    return null;
  });
  await expect(LocalStorage.getItem("")).rejects.toThrow("must be a non-empty string");
  await expect(LocalStorage.removeItem("")).rejects.toThrow("must be a non-empty string");
  await expect(LocalStorage.setItem("", 1)).rejects.toThrow("must be a non-empty string");
  for (const value of [{ nested: true }, [1, 2], null, Number.NaN, Number.POSITIVE_INFINITY]) {
    await expect(LocalStorage.setItem("count", value as never)).rejects.toThrow(
      "must be a string, number or boolean",
    );
  }
  expect(requests).toEqual([]);
});

// @covers LocalStorage.getItem
test("LocalStorage surfaces a host denial instead of reporting an empty store", async () => {
  setCapabilityRequester(() => Promise.reject(new Error("Capability denied: storage.get")));
  await expect(LocalStorage.getItem("count")).rejects.toThrow("Capability denied: storage.get");
});

// @covers allLocalStorageItems
// @covers clearLocalStorage
// @covers getLocalStorageItem
// @covers removeLocalStorageItem
// @covers setLocalStorageItem
test("the deprecated storage helpers are the LocalStorage members", () => {
  expect(implemented.getLocalStorageItem).toBe(implemented.LocalStorage.getItem);
  expect(implemented.setLocalStorageItem).toBe(implemented.LocalStorage.setItem);
  expect(implemented.removeLocalStorageItem).toBe(implemented.LocalStorage.removeItem);
  expect(implemented.allLocalStorageItems).toBe(implemented.LocalStorage.allItems);
  expect(implemented.clearLocalStorage).toBe(implemented.LocalStorage.clear);
  for (const alias of [
    getLocalStorageItem,
    setLocalStorageItem,
    removeLocalStorageItem,
    allLocalStorageItems,
    clearLocalStorage,
  ]) {
    expect(typeof alias).toBe("function");
  }
});
