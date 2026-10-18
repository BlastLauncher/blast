import type { JsonValue } from "@blastlauncher/protocol";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { CapabilityHandler } from "./broker.ts";
import { defaultDataDir, storageFile, type StorageOptions } from "./storage.ts";

// Shared by sessions in this host process to serialize read/modify/write cycles.
const queues = new Map<string, Promise<unknown>>();
export function oauthTokenFile(options: StorageOptions): string {
  return storageFile(join(options.dataDir ?? defaultDataDir(), "oauth"), options.extensionName);
}

export function createOAuthHandlers(options: StorageOptions): Record<string, CapabilityHandler> {
  const file = oauthTokenFile(options);
  const serialize = <T>(operation: () => Promise<T>): Promise<T> => {
    const next = (queues.get(file) ?? Promise.resolve()).then(operation, operation);
    queues.set(file, next);
    void next
      .finally(() => {
        if (queues.get(file) === next) queues.delete(file);
      })
      .catch(() => undefined);
    return next;
  };
  const read = async (): Promise<Record<string, JsonValue>> => {
    try {
      const value: unknown = JSON.parse(await readFile(file, "utf8"));
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("Invalid OAuth token store");
      return value as Record<string, JsonValue>;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw new Error("Cannot read OAuth token store", { cause: error });
    }
  };
  const write = async (value: Record<string, JsonValue>) => {
    await mkdir(dirname(file), { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
      await rename(temporary, file);
    } finally {
      await rm(temporary, { force: true });
    }
  };
  const handler =
    (operation: "get" | "set" | "remove"): CapabilityHandler =>
    (params) =>
      serialize(async () => {
        if (
          !params ||
          typeof params !== "object" ||
          Array.isArray(params) ||
          typeof params.providerId !== "string" ||
          !params.providerId
        )
          throw new Error("OAuth providerId must be a non-empty string");
        const key = params.providerId;
        const items = await read();
        if (operation === "get") return Object.hasOwn(items, key) ? items[key] : null;
        if (operation === "remove") delete items[key];
        else {
          const tokens = params.tokens;
          if (
            !tokens ||
            typeof tokens !== "object" ||
            Array.isArray(tokens) ||
            typeof tokens.accessToken !== "string"
          )
            throw new Error("Invalid OAuth token set");
          for (const field of ["refreshToken", "idToken", "scope"])
            if (tokens[field] !== undefined && typeof tokens[field] !== "string")
              throw new Error("Invalid OAuth token set");
          if (
            tokens.expiresIn !== undefined &&
            (typeof tokens.expiresIn !== "number" || !Number.isFinite(tokens.expiresIn))
          )
            throw new Error("Invalid OAuth token expiry");
          const stored: Record<string, JsonValue> = {
            accessToken: tokens.accessToken,
            updatedAt: new Date().toISOString(),
          };
          for (const field of ["refreshToken", "idToken", "scope", "expiresIn"])
            if (tokens[field] !== undefined) stored[field] = tokens[field];
          Object.defineProperty(items, key, {
            value: stored,
            enumerable: true,
            configurable: true,
            writable: true,
          });
        }
        await write(items);
      });
  return {
    "oauth.tokens.get": handler("get"),
    "oauth.tokens.set": handler("set"),
    "oauth.tokens.remove": handler("remove"),
  };
}
