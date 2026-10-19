import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, basename } from "node:path";
import { randomUUID } from "node:crypto";
import {
  defaultDataDir,
  storageFile,
  isStorageValue,
  type StorageItems,
  type StorageOptions,
} from "./storage.ts";

type Preferences = { extension: StorageItems; commands: Record<string, StorageItems> };

function items(value: unknown): value is StorageItems {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.values(value).every(isStorageValue)
  );
}

export function preferenceFile(dataDir: string, extensionName: string): string {
  return join(dataDir, "preferences", basename(storageFile(dataDir, extensionName)));
}

/** Plaintext preferences, isolated by extension and command, atomically saved as 0600. */
export function createPreferenceStore(options: StorageOptions) {
  const file = preferenceFile(options.dataDir ?? defaultDataDir(), options.extensionName);
  const read = async (): Promise<Preferences> => {
    try {
      const value = JSON.parse(await readFile(file, "utf8"));
      if (
        !value ||
        !items(value.extension) ||
        !value.commands ||
        typeof value.commands !== "object" ||
        Array.isArray(value.commands) ||
        !Object.values(value.commands).every(items)
      )
        throw new Error("Invalid preferences file");
      return value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return { extension: {}, commands: {} };
      throw error;
    }
  };
  return {
    read,
    values: async (command: string) => {
      const stored = await read();
      return { ...stored.extension, ...stored.commands[command] };
    },
    save: async (extension: StorageItems, command: string, values: StorageItems) => {
      if (![...Object.values(extension), ...Object.values(values)].every(isStorageValue))
        throw new Error("Invalid preference value");
      const stored = await read();
      stored.extension = { ...stored.extension, ...extension };
      stored.commands = {
        ...stored.commands,
        [command]: { ...stored.commands[command], ...values },
      };
      await mkdir(dirname(file), { recursive: true });
      const temporary = `${file}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, `${JSON.stringify(stored, null, 2)}\n`, { mode: 0o600 });
        await rename(temporary, file);
      } finally {
        await rm(temporary, { force: true });
      }
    },
  };
}
