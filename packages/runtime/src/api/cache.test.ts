import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Cache } from "./index.ts";
import { environment } from "./environment.ts";

const directories: string[] = [];
const originalSupport = environment.supportPath;
afterEach(() => {
  environment.supportPath = originalSupport;
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function setup() {
  const dir = mkdtempSync(join(tmpdir(), "blast-cache-"));
  directories.push(dir);
  environment.supportPath = dir;
  return dir;
}

// @covers Cache
// @covers Cache.Options
// @covers Cache.Options.namespace
// @covers Cache.constructor
// @covers Cache.STORAGE_DIRECTORY_NAME
// @covers Cache.DEFAULT_CAPACITY
// @covers Cache.storageDirectory
// @covers Cache.set
// @covers Cache.get
// @covers Cache.has
// @covers Cache.isEmpty
// @covers Cache.clear
test("default directory, independent namespaces, escaped names and fresh instances", () => {
  const dir = setup();
  const cache = new Cache();
  expect(Cache.DEFAULT_CAPACITY).toBe(10 * 1024 * 1024);
  expect(cache.storageDirectory).toBe(join(dir, Cache.STORAGE_DIRECTORY_NAME));
  expect(cache.isEmpty).toBe(true);
  expect(cache.get("missing")).toBeUndefined();
  cache.set("../__proto__", "value");
  cache.set("empty", "");
  expect(new Cache().get("../__proto__")).toBe("value");
  expect(cache.has("empty")).toBe(true);
  const namespaced = new Cache({ namespace: "../other" });
  expect(namespaced.storageDirectory).toBe(join(cache.storageDirectory, "%2E%2E%2Fother"));
  expect(namespaced.isEmpty).toBe(true);
  namespaced.set("key", "separate");
  cache.clear();
  expect(cache.isEmpty).toBe(true);
  expect(new Cache({ namespace: "../other" }).get("key")).toBe("separate");
  expect(readdirSync(cache.storageDirectory).filter((file) => file.endsWith(".tmp"))).toEqual([]);
});

// @covers Cache.Options
// @covers Cache.Options.capacity
// @covers Cache.set
// @covers Cache.get
// @covers Cache.has
test("LRU counts UTF-8 bytes, get refreshes persisted order and has leaves order alone", () => {
  setup();
  const cache = new Cache({ capacity: 6 });
  cache.set("a", "é");
  cache.set("b", "four");
  cache.get("a");
  new Cache({ capacity: 6 }).set("c", "new");
  expect(cache.has("b")).toBe(false);
  expect(cache.has("a")).toBe(true);
  cache.set("d", "ok");
  expect(cache.has("a")).toBe(false);
  cache.set("c", "x");
  cache.set("e", "abc");
  expect(cache.get("d")).toBe("ok");
  cache.set("oversize", "1234567");
  expect(cache.isEmpty).toBe(true);
  new Cache({ capacity: 0 }).set("empty", "");
  expect(cache.get("empty")).toBe("");
});

// @covers Cache.subscribe
// @covers Cache.Subscriber
// @covers Cache.Subscription
// @covers Cache.remove
// @covers Cache.clear
test("subscriptions receive set/remove/clear across instances, suppress clear and unsubscribe", () => {
  setup();
  const cache = new Cache();
  const other = new Cache();
  const events: unknown[] = [];
  const unsubscribe = cache.subscribe((key, data) => events.push([key, data]));
  other.set("a", "value");
  expect(cache.remove("a")).toBe(true);
  expect(cache.remove("a")).toBe(false);
  cache.clear({ notifySubscribers: false });
  other.clear();
  expect(events).toEqual([
    ["a", "value"],
    ["a", undefined],
    ["a", undefined],
    [undefined, undefined],
  ]);
  unsubscribe();
  unsubscribe();
  other.set("b", "ignored");
  expect(events).toHaveLength(4);
});

// @covers Cache.Options.directory
test("deprecated directory option works and invalid/corrupt storage is not overwritten", () => {
  const directory = setup();
  environment.supportPath = undefined;
  expect(() => new Cache()).toThrow("assigned support directory");
  const cache = new Cache({ directory });
  for (const capacity of [-1, NaN, Infinity])
    expect(() => new Cache({ directory, capacity })).toThrow("capacity");
  const file = join(cache.storageDirectory, "entries.json");
  writeFileSync(file, "{}");
  expect(() => cache.set("key", "data")).toThrow("Invalid Cache entries");
  writeFileSync(file, "broken");
  expect(() => cache.has("key")).toThrow();
});
