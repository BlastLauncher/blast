export type CatalogBundle = { path: string; bytes: number; sha256: string };
export type BundleIndex = { buildSha: string; bundles: Record<string, CatalogBundle> };

export function bundleKey(extension: string, command: string): string {
  return `${extension}/${command}`;
}

export function parseBundleIndex(value: unknown): BundleIndex {
  if (!value || typeof value !== "object") throw new Error("Invalid browser bundle index");
  const input = value as Record<string, unknown>;
  if (typeof input.buildSha !== "string" || !input.bundles || typeof input.bundles !== "object")
    throw new Error("Invalid browser bundle index shape");
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
    bundles[key] = { path: item.path, bytes: item.bytes, sha256: item.sha256 };
  }
  return { buildSha: input.buildSha, bundles };
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
