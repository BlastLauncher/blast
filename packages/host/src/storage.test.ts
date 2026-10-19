import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
  createStorage,
  createStorageHandlers,
  defaultDataDir,
  storageFile,
  type StorageValue,
} from "./storage.ts";

const directories: string[] = [];
async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "blast-storage-test-"));
  directories.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

test("values persist across sessions of one extension and stay isolated between extensions", async () => {
  const dataDir = await tempDir();
  const first = createStorage({ extensionName: "hello-list", dataDir });
  expect(await first.get("missing")).toBeUndefined();
  await first.set("count", 2);
  await first.set("flag", true);
  await first.set("fruit", "cherry");

  // A second session is a fresh store over the same file.
  const second = createStorage({ extensionName: "hello-list", dataDir });
  expect(await second.all()).toEqual({ count: 2, flag: true, fruit: "cherry" });
  expect(await second.get("count")).toBe(2);
  await second.remove("fruit");
  expect(await createStorage({ extensionName: "hello-list", dataDir }).all()).toEqual({
    count: 2,
    flag: true,
  });

  const other = createStorage({ extensionName: "other-extension", dataDir });
  expect(await other.all()).toEqual({});
  await other.set("count", 99);
  await other.clear();
  expect(await other.get("count")).toBeUndefined();
  expect(await first.get("count")).toBe(2);
});

test("allItems and clear see the same store, and clear empties it", async () => {
  const dataDir = await tempDir();
  const storage = createStorage({ extensionName: "hello-list", dataDir });
  // Clearing an empty store must not create a data directory at all.
  await storage.clear();
  expect(existsSync(join(dataDir, "storage"))).toBe(false);

  await storage.set("a", 1);
  await storage.set("b", "two");
  expect(await storage.all()).toEqual({ a: 1, b: "two" });
  await storage.remove("a");
  expect(await storage.all()).toEqual({ b: "two" });
  // Removing a key that is not there is a no-op, not an error.
  await storage.remove("a");
  await storage.clear();
  expect(await storage.all()).toEqual({});
  expect(JSON.parse(await readFile(storageFile(dataDir, "hello-list"), "utf8"))).toEqual({});
});

test("writes replace the file atomically and never lose concurrent updates", async () => {
  const dataDir = await tempDir();
  const storage = createStorage({ extensionName: "hello-list", dataDir });
  await storage.set("count", 0);
  await Promise.all(
    Array.from({ length: 25 }, (_, index) => storage.set(`key-${index}`, index as StorageValue)),
  );
  const items = await storage.all();
  expect(Object.keys(items)).toHaveLength(26);
  expect(items["key-24"]).toBe(24);
  // Every write is a temp file plus a rename: only the final file is left.
  const directory = join(dataDir, "storage");
  expect(await readdir(directory)).toEqual(["hello-list.json"]);
  expect(JSON.parse(await readFile(join(directory, "hello-list.json"), "utf8"))).toMatchObject(
    items,
  );
});

test("a corrupted store fails loudly instead of dropping data", async () => {
  const dataDir = await tempDir();
  await mkdir(join(dataDir, "storage"), { recursive: true });
  const file = storageFile(dataDir, "hello-list");
  await writeFile(file, "[1, 2]");
  const storage = createStorage({ extensionName: "hello-list", dataDir });
  await expect(storage.all()).rejects.toThrow("hello-list is not a JSON object");
  await writeFile(file, "{ not json");
  await expect(storage.get("count")).rejects.toThrow();
  // Writes must not overwrite a file the host could not read.
  await expect(storage.set("count", 1)).rejects.toThrow();
  expect(await readFile(file, "utf8")).toBe("{ not json");
});

test("storage handlers answer the five capabilities and normalize missing keys to null", async () => {
  const dataDir = await tempDir();
  const handlers = createStorageHandlers({ extensionName: "hello-list", dataDir });
  expect(Object.keys(handlers).toSorted()).toEqual([
    "storage.all",
    "storage.clear",
    "storage.get",
    "storage.remove",
    "storage.set",
  ]);
  expect(await handlers["storage.set"]!({ key: "count", value: 2 })).toBeUndefined();
  expect(await handlers["storage.get"]!({ key: "count" })).toBe(2);
  expect(await handlers["storage.get"]!({ key: "missing" })).toBeNull();
  expect(await handlers["storage.all"]!({})).toEqual({ count: 2 });
  expect(await handlers["storage.remove"]!({ key: "count" })).toBeUndefined();
  expect(await handlers["storage.all"]!({})).toEqual({});
});

test("the extension a request belongs to comes from the session, never from params", async () => {
  const dataDir = await tempDir();
  const handlers = createStorageHandlers({ extensionName: "hello-list", dataDir });
  await handlers["storage.set"]!({
    key: "count",
    value: 1,
    extension: "other-extension",
    extensionName: "other-extension",
    dataDir: "/tmp/elsewhere",
  });
  expect(await readdir(join(dataDir, "storage"))).toEqual(["hello-list.json"]);
  expect(existsSync(storageFile(dataDir, "other-extension"))).toBe(false);
  expect(await handlers["storage.get"]!({ key: "count", extension: "other-extension" })).toBe(1);
});

test("store and capability params are validated with actionable messages", async () => {
  const dataDir = await tempDir();
  const storage = createStorage({ extensionName: "hello-list", dataDir });
  await expect(storage.set("", 1)).rejects.toThrow("keys must be non-empty strings");
  await expect(storage.set("count", { nested: true } as unknown as StorageValue)).rejects.toThrow(
    "strings, numbers or booleans",
  );
  await expect(storage.set("count", Number.POSITIVE_INFINITY)).rejects.toThrow(
    "strings, numbers or booleans",
  );
  const handlers = createStorageHandlers({ extensionName: "hello-list", dataDir });
  await expect(handlers["storage.get"]!("count")).rejects.toThrow(
    "storage.get: params must be an object",
  );
  await expect(handlers["storage.get"]!({ key: "" })).rejects.toThrow(
    'storage.get: "key" must be a non-empty string',
  );
  await expect(handlers["storage.set"]!({ key: "count" })).rejects.toThrow(
    'storage.set: "value" must be a string, number or boolean',
  );
  await expect(handlers["storage.set"]!({ key: "count", value: null })).rejects.toThrow(
    'storage.set: "value" must be a string, number or boolean',
  );
});

test("storage paths stay inside the data directory and default to the XDG root", () => {
  expect(storageFile("/data", "hello-list")).toBe(join("/data", "storage", "hello-list.json"));
  // Scoped and hostile names stay one path segment.
  expect(storageFile("/data", "@scope/name")).toBe(
    join("/data", "storage", "%40scope%2fname.json"),
  );
  expect(storageFile("/data", "../../etc/passwd")).toBe(
    join("/data", "storage", "..%2f..%2fetc%2fpasswd.json"),
  );
  expect(storageFile("/data", "..")).toBe(join("/data", "storage", "...json"));
  expect(() => storageFile("/data", "")).toThrow("extension name is required");

  expect(defaultDataDir({ XDG_DATA_HOME: "/xdg" })).toBe("/xdg/blast");
  // The XDG spec ignores a relative data home.
  expect(defaultDataDir({ XDG_DATA_HOME: "relative" })).toBe(
    join(homedir(), ".local", "share", "blast"),
  );
  expect(defaultDataDir({})).toBe(join(homedir(), ".local", "share", "blast"));
});

test("internal storage survives sessions and cannot collide with LocalStorage keys", async () => {
  const dataDir = await tempDir();
  const options = { extensionName: "hello-list", dataDir };
  const handlers = createStorageHandlers(options);
  const key = 'blast:dropdown:["index","List.Dropdown","drink"]';
  const internal = { scope: "blast:internal", key };
  await handlers["storage.set"]!({ key, value: "local" });
  await handlers["storage.set"]!({ ...internal, value: "wine" });
  const next = createStorageHandlers(options);
  expect(await next["storage.get"]!(internal)).toBe("wine");
  expect(await next["storage.get"]!({ key })).toBe("local");
  expect(await next["storage.all"]!({})).toEqual({ [key]: "local" });
  await next["storage.clear"]!({});
  expect(await next["storage.get"]!(internal)).toBe("wine");
  expect(
    await next["storage.get"]!({ ...internal, key: key.replace("index", "other") }),
  ).toBeNull();
  const other = createStorageHandlers({ ...options, extensionName: "other" });
  expect(await other["storage.get"]!(internal)).toBeNull();
  // `storage.remove` must respect `scope` too: it is the only way for the
  // runtime to clear an internal key (e.g. a cleared Form draft).
  await next["storage.set"]!({ key, value: "restored" });
  await next["storage.remove"]!(internal);
  expect(await next["storage.get"]!(internal)).toBeNull();
  expect(await next["storage.get"]!({ key })).toBe("restored");
});
