import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { parseManifest, type ExtensionManifest } from "./index.js";

export const CATALOG_CACHE_VERSION = 1;

export interface CachedExtensionEntry {
  /** Absolute catalog root containing the extension directory. */
  readonly root: string;
  /** Absolute extension directory. */
  readonly directory: string;
  /**
   * Raw manifest file content. The parsed `ExtensionManifest` shape is not
   * re-parseable (record-keyed preferences), so the cache stores raw bytes
   * and replays the exact live `JSON.parse` + `parseManifest` path on load.
   */
  readonly manifestRaw: string;
  readonly manifestMtimeMs: number;
  readonly manifestSize: number;
}

interface CatalogCacheFile {
  readonly version: number;
  readonly manifestFileName: string;
  readonly roots: readonly string[];
  readonly entries: readonly CachedExtensionEntry[];
}

export interface CatalogCacheKey {
  readonly cachePath: string;
  readonly manifestFileName: string;
  readonly roots: readonly string[];
}

/**
 * Reads a persistent catalog index. Returns `undefined` for any missing,
 * corrupt, versioned-out, misconfigured, or over-permissive cache: callers
 * fall back to a full scan. Manifests are parsed through the live
 * `parseManifest` path on use, so a tampered cache can only drop entries,
 * never inject them.
 */
export async function readCatalogCache(key: CatalogCacheKey): Promise<Map<string, CachedExtensionEntry> | undefined> {
  let raw: string;
  try {
    const stats = await stat(key.cachePath);
    if ((stats.mode & 0o077) !== 0) {
      return undefined;
    }
    raw = await readFile(key.cachePath, "utf8");
  } catch {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed) || parsed.version !== CATALOG_CACHE_VERSION) {
    return undefined;
  }
  if (parsed.manifestFileName !== key.manifestFileName || !isStringArray(parsed.roots)) {
    return undefined;
  }
  if (parsed.roots.length !== key.roots.length || parsed.roots.some((root, index) => root !== key.roots[index])) {
    return undefined;
  }
  if (!Array.isArray(parsed.entries)) {
    return undefined;
  }

  const entries = new Map<string, CachedExtensionEntry>();
  for (const entry of parsed.entries) {
    if (!isRecord(entry) || typeof entry.root !== "string" || typeof entry.directory !== "string") {
      continue;
    }
    if (typeof entry.manifestMtimeMs !== "number" || typeof entry.manifestSize !== "number") {
      continue;
    }
    if (typeof entry.manifestRaw !== "string" || entry.manifestRaw.length === 0) {
      continue;
    }
    entries.set(entry.directory, {
      root: entry.root,
      directory: entry.directory,
      manifestRaw: entry.manifestRaw,
      manifestMtimeMs: entry.manifestMtimeMs,
      manifestSize: entry.manifestSize,
    });
  }
  return entries;
}

/**
 * Parses raw manifest content through the live manifest path. Returns
 * `undefined` for unreadable, invalid, or command-less manifests.
 */
export function parseCachedManifest(raw: string): ExtensionManifest | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  const manifest = parseManifest(parsed);
  if (manifest === undefined || manifest.commands.length === 0) {
    return undefined;
  }
  return manifest;
}

/**
 * Checks a cached entry against the live manifest file. Returns `"fresh"`
 * when the raw bytes can be reused, `"stale"` when the file must be
 * re-read, and `"gone"` when the extension no longer resolves.
 */
export async function checkCachedEntry(
  entry: CachedExtensionEntry,
  manifestFileName: string,
): Promise<"fresh" | "stale" | "gone"> {
  let stats;
  try {
    stats = await stat(path.join(entry.directory, manifestFileName));
  } catch {
    return "gone";
  }
  if (!stats.isFile() || stats.mtimeMs !== entry.manifestMtimeMs || stats.size !== entry.manifestSize) {
    return "stale";
  }
  return "fresh";
}

/**
 * Persists a catalog index atomically with owner-only permissions. Never
 * throws: cache failures must not break catalog discovery.
 */
export async function writeCatalogCache(key: CatalogCacheKey, entries: readonly CachedExtensionEntry[]): Promise<void> {
  try {
    const file: CatalogCacheFile = {
      version: CATALOG_CACHE_VERSION,
      manifestFileName: key.manifestFileName,
      roots: [...key.roots],
      entries: entries.map((entry) => ({ ...entry })),
    };
    await mkdir(path.dirname(key.cachePath), { recursive: true });
    const staging = `${key.cachePath}.tmp-${process.pid}`;
    await writeFile(staging, `${JSON.stringify(file)}\n`, { mode: 0o600 });
    await rename(staging, key.cachePath);
  } catch {
    await rm(`${key.cachePath}.tmp-${process.pid}`, { force: true }).catch(() => {});
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry): entry is string => typeof entry === "string");
}
