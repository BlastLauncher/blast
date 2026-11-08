import { parsePreferences, type Preference } from "../../packages/host/src/preference-fields.ts";
import type { CommandMode } from "../../packages/protocol/src/index.ts";

export type CatalogManifest = {
  name: string;
  preferences: Preference[];
  commands: Record<string, Preference[]>;
  modes?: Record<string, CommandMode>;
};
export type CatalogBundle = {
  path: string;
  bytes: number;
  sha256: string;
  files?: Record<string, CatalogBundle>;
  manifest?: CatalogManifest;
};
export type BundleIndex = {
  buildSha: string;
  bundles: Record<string, CatalogBundle>;
  runtime?: CatalogBundle;
};

export function bundleKey(extension: string, command: string): string {
  return `${extension}/${command}`;
}

export function parseBundleIndex(value: unknown): BundleIndex {
  if (!value || typeof value !== "object") throw new Error("Invalid browser bundle index");
  const input = value as Record<string, unknown>;
  if (typeof input.buildSha !== "string" || !input.bundles || typeof input.bundles !== "object")
    throw new Error("Invalid browser bundle index shape");
  const runtimeValue = input.runtime;
  let runtime: CatalogBundle | undefined;
  if (runtimeValue !== undefined) {
    if (!runtimeValue || typeof runtimeValue !== "object")
      throw new Error("Invalid runtime bundle");
    const item = runtimeValue as Record<string, unknown>;
    if (
      item.path !== "bundles/runtime.js" ||
      typeof item.bytes !== "number" ||
      !Number.isInteger(item.bytes) ||
      typeof item.sha256 !== "string" ||
      !/^[0-9a-f]{64}$/.test(item.sha256)
    )
      throw new Error("Invalid runtime bundle");
    runtime = { path: item.path, bytes: item.bytes, sha256: item.sha256 };
  }
  const bundles: Record<string, CatalogBundle> = {};
  for (const [key, entryValue] of Object.entries(input.bundles as Record<string, unknown>)) {
    if (!entryValue || typeof entryValue !== "object")
      throw new Error(`Invalid bundle entry: ${key}`);
    const item = entryValue as Record<string, unknown>;
    if (
      typeof item.path !== "string" ||
      !/^bundles\/[^/]+\/[^/]+\.js$/.test(item.path) ||
      typeof item.bytes !== "number" ||
      !Number.isInteger(item.bytes) ||
      item.bytes < 0 ||
      typeof item.sha256 !== "string" ||
      !/^[0-9a-f]{64}$/.test(item.sha256)
    )
      throw new Error(`Invalid bundle entry shape: ${key}`);
    const files: Record<string, CatalogBundle> = {};
    if (item.files !== undefined) {
      if (!item.files || typeof item.files !== "object")
        throw new Error(`Invalid bundle files: ${key}`);
      for (const [name, fileValue] of Object.entries(item.files as Record<string, unknown>)) {
        if (!fileValue || typeof fileValue !== "object")
          throw new Error(`Invalid bundle file: ${key}/${name}`);
        const file = fileValue as Record<string, unknown>;
        if (
          typeof file.path !== "string" ||
          !file.path.startsWith("bundles/") ||
          typeof file.bytes !== "number" ||
          !Number.isInteger(file.bytes) ||
          file.bytes < 0 ||
          typeof file.sha256 !== "string" ||
          !/^[0-9a-f]{64}$/.test(file.sha256)
        )
          throw new Error(`Invalid bundle file shape: ${key}/${name}`);
        files[name] = { path: file.path, bytes: file.bytes, sha256: file.sha256 };
      }
    }
    let manifest: CatalogManifest | undefined;
    if (item.manifest !== undefined) {
      if (!item.manifest || typeof item.manifest !== "object")
        throw new Error(`Invalid bundle manifest: ${key}`);
      const declared = item.manifest as Record<string, unknown>;
      if (
        typeof declared.name !== "string" ||
        !declared.commands ||
        typeof declared.commands !== "object"
      )
        throw new Error(`Invalid bundle manifest shape: ${key}`);
      const commands: Record<string, Preference[]> = {};
      const modes: Record<string, CommandMode> = {};
      const declaredModes = declared.modes;
      if (declaredModes !== undefined && (!declaredModes || typeof declaredModes !== "object"))
        throw new Error(`Invalid bundle manifest modes: ${key}`);
      for (const [name, mode] of Object.entries((declaredModes ?? {}) as Record<string, unknown>)) {
        if (
          mode !== "view" &&
          mode !== "no-view" &&
          mode !== "menu-bar" &&
          mode !== "model-provider"
        )
          throw new Error(`Invalid bundle manifest mode: ${key}/${name}`);
        modes[name] = mode;
      }
      for (const [name, preferences] of Object.entries(
        declared.commands as Record<string, unknown>,
      ))
        commands[name] = parsePreferences(preferences, `Bundle ${key} command ${name} preferences`);
      manifest = {
        name: declared.name,
        preferences: parsePreferences(declared.preferences, `Bundle ${key} preferences`),
        commands,
        ...(Object.keys(modes).length ? { modes } : {}),
      };
    }
    bundles[key] = {
      path: item.path,
      bytes: item.bytes,
      sha256: item.sha256,
      ...(Object.keys(files).length ? { files } : {}),
      ...(manifest ? { manifest } : {}),
    };
  }
  return { buildSha: input.buildSha, bundles, ...(runtime ? { runtime } : {}) };
}

export async function sha256Hex(value: ArrayBuffer): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", value);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function bundleMatches(
  index: BundleIndex | undefined,
  buildSha: string | undefined,
  key: string,
  bytes: ArrayBuffer,
): Promise<boolean> {
  const entry = index?.bundles[key];
  return Boolean(
    entry &&
    buildSha === index?.buildSha &&
    entry.bytes === bytes.byteLength &&
    (await sha256Hex(bytes)) === entry.sha256,
  );
}
