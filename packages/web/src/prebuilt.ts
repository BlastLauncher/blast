import type { BrowserBundleFile } from "./browser-bundle.ts";
import {
  bundleKey,
  bundleMatches,
  parseBundleIndex,
  sha256Hex,
  type BundleIndex,
  type CatalogBundle,
  type CatalogManifest,
} from "./bundles.ts";
import { resolveExtensionSource } from "./extension-files.ts";
import { isTextExtension, parseExtensionSource } from "./source.ts";

/** Where a deployment serves its prebuilt bundles (see `WebMountOptions.bundlesUrl`). */
export type BundleLocation = { bundlesUrl: string; buildUrl?: string | undefined };
export type PrebuiltCommand = {
  code: string;
  files: Map<string, BrowserBundleFile>;
  manifest: CatalogManifest;
};

const indexes = new Map<string, Promise<BundleIndex | undefined>>();
const runtimes = new Map<string, Promise<string | undefined>>();
const locationKey = (location: BundleLocation) =>
  `${location.bundlesUrl}\n${location.buildUrl ?? ""}`;
const urlFor = (path: string, location: BundleLocation) =>
  new URL(path, new URL(location.bundlesUrl, globalThis.location.href));

/** Fetches a file the index lists; undefined unless its size and digest match. */
async function verified(entry: CatalogBundle, location: BundleLocation) {
  const response = await fetch(urlFor(entry.path, location));
  if (!response.ok) return undefined;
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength !== entry.bytes || (await sha256Hex(bytes)) !== entry.sha256)
    return undefined;
  return bytes;
}

/**
 * The validated index, fetched once per location. A `buildUrl` whose `sha`
 * differs from the index's `buildSha` means the index came from another
 * deploy (a stale cache), so it is ignored.
 */
export function loadBundleIndex(location: BundleLocation): Promise<BundleIndex | undefined> {
  const key = locationKey(location);
  let pending = indexes.get(key);
  if (!pending) {
    pending = (async () => {
      const [indexResponse, buildResponse] = await Promise.all([
        fetch(new URL(location.bundlesUrl, globalThis.location.href)),
        location.buildUrl ? fetch(new URL(location.buildUrl, globalThis.location.href)) : null,
      ]);
      if (!indexResponse.ok || (buildResponse && !buildResponse.ok)) return undefined;
      const index = parseBundleIndex(await indexResponse.json());
      if (buildResponse) {
        const build = (await buildResponse.json()) as { sha?: unknown };
        if (build.sha !== index.buildSha) return undefined;
      }
      return index;
    })().catch(() => undefined);
    // Only a usable index is kept; a failed fetch is retried by the next launch.
    void pending.then((index) => index ?? indexes.delete(key));
    indexes.set(key, pending);
  }
  return pending;
}

/** The shared runtime the prebuilt bundles import from, when the index has one. */
export function loadPrebuiltRuntime(location: BundleLocation): Promise<string | undefined> {
  const key = locationKey(location);
  let pending = runtimes.get(key);
  if (!pending) {
    pending = (async () => {
      const index = await loadBundleIndex(location);
      const bytes = index?.runtime ? await verified(index.runtime, location) : undefined;
      return bytes ? new TextDecoder().decode(bytes) : undefined;
    })().catch(() => undefined);
    void pending.then((code) => code ?? runtimes.delete(key));
    runtimes.set(key, pending);
  }
  return pending;
}

/** Bundles are keyed by Store name, so only `raycast/extensions` sources have one. */
export function storeExtensionName(source: string): string | undefined {
  try {
    const parsed = parseExtensionSource(resolveExtensionSource(source));
    const [folder, name, ...rest] = parsed.path.split("/");
    return parsed.owner === "raycast" &&
      parsed.repo === "extensions" &&
      folder === "extensions" &&
      name &&
      rest.length === 0
      ? name
      : undefined;
  } catch {
    return undefined;
  }
}

/** A verified prebuilt command, or undefined to fall back to fetching and bundling sources. */
export async function loadPrebuiltCommand(
  location: BundleLocation,
  source: string,
  command: string,
): Promise<PrebuiltCommand | undefined> {
  try {
    const extension = storeExtensionName(source);
    const index = extension ? await loadBundleIndex(location) : undefined;
    if (!extension || !index) return undefined;
    const key = bundleKey(extension, command);
    const entry = index.bundles[key];
    // An entry without manifest data predates 0133; the source path has the full package.json.
    if (!entry?.manifest) return undefined;
    const response = await fetch(urlFor(entry.path, location));
    if (!response.ok) return undefined;
    const bytes = await response.arrayBuffer();
    if (!(await bundleMatches(index, index.buildSha, key, bytes))) return undefined;
    const files = new Map<string, BrowserBundleFile>();
    for (const [name, file] of Object.entries(entry.files ?? {})) {
      const fileBytes = await verified(file, location);
      if (!fileBytes) return undefined;
      files.set(
        `/${name}`,
        isTextExtension(name) ? new TextDecoder().decode(fileBytes) : new Uint8Array(fileBytes),
      );
    }
    return { code: new TextDecoder().decode(bytes), files, manifest: entry.manifest };
  } catch {
    return undefined;
  }
}
