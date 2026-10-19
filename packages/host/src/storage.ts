// Host-side local storage for `LocalStorage` (docs/decisions/0001). Values live
// in one JSON file per extension below the host data directory. The extension
// name comes from the session, never from capability params, so a command can
// only reach its own namespace.

import type { JsonValue } from "@blastlauncher/protocol";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import type { CapabilityHandler } from "./broker.ts";

/** The types `LocalStorage.Value` allows. */
export type StorageValue = string | number | boolean;
export type StorageItems = Record<string, StorageValue>;

export type StorageOptions = {
  /** Owning extension; the host takes it from the session's manifest name. */
  extensionName: string;
  /** Root of Blast's data directory; defaults to {@link defaultDataDir}. */
  dataDir?: string;
};

export type Storage = {
  get(key: string): Promise<StorageValue | undefined>;
  set(key: string, value: StorageValue): Promise<void>;
  remove(key: string): Promise<void>;
  all(): Promise<StorageItems>;
  clear(): Promise<void>;
};

/** `$XDG_DATA_HOME/blast`, or `~/.local/share/blast` when unset or relative. */
export function defaultDataDir(env: NodeJS.ProcessEnv = process.env): string {
  const xdg = env.XDG_DATA_HOME;
  const root =
    xdg !== undefined && xdg !== "" && isAbsolute(xdg) ? xdg : join(homedir(), ".local", "share");
  return join(root, "blast");
}

/**
 * The storage file of one extension. Names are untrusted, so anything outside
 * the safe set is percent-encoded: a scoped or hostile name stays one path
 * segment inside the storage directory.
 */
export function storageFile(dataDir: string, extensionName: string): string {
  if (extensionName === "") throw new Error("An extension name is required for local storage");
  const encoded = extensionName.replace(/[^A-Za-z0-9._-]/g, (char) => {
    return `%${char.codePointAt(0)!.toString(16)}`;
  });
  return join(dataDir, "storage", `${encoded}.json`);
}

export function isStorageValue(value: unknown): value is StorageValue {
  return (
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value)) ||
    typeof value === "boolean"
  );
}

function isStorageItems(value: unknown): value is StorageItems {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(isStorageValue)
  );
}

function checkKey(key: string): string {
  if (typeof key !== "string" || key === "")
    throw new Error("Local storage keys must be non-empty strings");
  return key;
}

/** One store per session; the file is read on every call so two sessions of the
 * same extension see each other's writes. */
export function createStorage(options: StorageOptions): Storage {
  const file = storageFile(options.dataDir ?? defaultDataDir(), options.extensionName);
  // Mutations are read-modify-write, so they must not interleave; reads join the
  // same queue and never observe a half-applied change.
  let tail: Promise<unknown> = Promise.resolve();
  const serialize = <T>(operation: () => Promise<T>): Promise<T> => {
    const next = tail.then(operation, operation);
    tail = next.catch(() => undefined);
    return next;
  };
  const read = async (): Promise<StorageItems> => {
    let text: string;
    try {
      text = await readFile(file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw error;
    }
    const items: unknown = JSON.parse(text);
    if (!isStorageItems(items)) {
      throw new Error(
        `Local storage for ${options.extensionName} is not a JSON object of strings, numbers and booleans`,
      );
    }
    return items;
  };
  let writes = 0;
  const write = async (items: StorageItems): Promise<void> => {
    await mkdir(dirname(file), { recursive: true });
    // Atomic replace: a crash or a full disk must not leave a truncated file
    // that the next session would read as corrupt.
    const temporary = `${file}.${process.pid}-${++writes}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(items, null, 2)}\n`, "utf8");
      await rename(temporary, file);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  };
  return {
    get: (key) =>
      serialize(async () => {
        return (await read())[checkKey(key)];
      }),
    set: (key, value) =>
      serialize(async () => {
        if (!isStorageValue(value))
          throw new Error("Local storage values must be strings, numbers or booleans");
        const items = await read();
        items[checkKey(key)] = value;
        await write(items);
      }),
    remove: (key) =>
      serialize(async () => {
        const items = await read();
        const name = checkKey(key);
        if (!(name in items)) return;
        delete items[name];
        await write(items);
      }),
    all: () => serialize(read),
    clear: () =>
      serialize(async () => {
        if (Object.keys(await read()).length === 0) return;
        await write({});
      }),
  };
}

function readParams(params: JsonValue, api: string): Record<string, JsonValue> {
  if (typeof params !== "object" || params === null || Array.isArray(params)) {
    throw new Error(`${api}: params must be an object`);
  }
  return params;
}

// Params carry a key and a value only. Identity is never read from them: the
// extension a request belongs to is fixed when the session starts.
function requireKey(params: JsonValue, api: string): string {
  const key = readParams(params, api).key;
  if (typeof key !== "string" || key === "")
    throw new Error(`${api}: "key" must be a non-empty string`);
  return key;
}

function requireValue(params: JsonValue, api: string): StorageValue {
  const value = readParams(params, api).value;
  if (!isStorageValue(value))
    throw new Error(`${api}: "value" must be a string, number or boolean`);
  return value;
}

/** The `storage.*` capability handlers for one session. */
export function createStorageHandlers(options: StorageOptions): Record<string, CapabilityHandler> {
  const storage = createStorage(options);
  // A separate root makes internal keys disjoint from every LocalStorage key.
  const internal = createStorage({
    ...options,
    dataDir: join(options.dataDir ?? defaultDataDir(), "internal"),
  });
  const store = (params: JsonValue, api: string) =>
    readParams(params, api).scope === "blast:internal" ? internal : storage;
  return {
    // A missing key is `undefined` in the extension API; the wire says `null`.
    "storage.get": async (params) =>
      (await store(params, "storage.get").get(requireKey(params, "storage.get"))) ?? null,
    "storage.set": async (params) => {
      await store(params, "storage.set").set(
        requireKey(params, "storage.set"),
        requireValue(params, "storage.set"),
      );
    },
    "storage.remove": async (params) => {
      await store(params, "storage.remove").remove(requireKey(params, "storage.remove"));
    },
    "storage.all": () => storage.all(),
    "storage.clear": () => storage.clear(),
  };
}
