// Pure helpers for vendoring @raycast/api type declarations: pick a release
// out of the registry document and check a downloaded tarball against its
// Subresource Integrity digest. No network or filesystem access here, so the
// logic is unit-testable offline.
import { createHash } from "node:crypto";

export const PACKAGE_NAME = "@raycast/api";
export const REGISTRY_URL = `https://registry.npmjs.org/${PACKAGE_NAME}`;

export type Release = {
  version: string;
  license: string;
  tarball: string;
  integrity: string;
};

/** Provenance recorded next to the vendored declarations. */
export type VendorSource = {
  package: string;
  version: string;
  license: string;
  tarball: string;
  integrity: string;
  sha256: string;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requireString(source: Record<string, unknown>, key: string, at: string): string {
  const value = source[key];
  if (typeof value !== "string" || value === "") throw new Error(`${at}: missing ${key}`);
  return value;
}

/**
 * Resolve the release to vendor. Without a requested version this is
 * `dist-tags.latest`; with one it must exist in `versions`.
 */
export function selectRelease(metadata: unknown, requested?: string): Release {
  if (!isRecord(metadata)) throw new Error("registry metadata is not an object");
  const versions = metadata.versions;
  if (!isRecord(versions)) throw new Error("registry metadata: missing versions");

  let version = requested;
  if (version === undefined || version === "") {
    const tags = metadata["dist-tags"];
    const latest = isRecord(tags) ? tags.latest : undefined;
    if (typeof latest !== "string" || latest === "") {
      throw new Error("registry metadata: missing dist-tags.latest");
    }
    version = latest;
  }

  const entry = versions[version];
  if (!isRecord(entry)) throw new Error(`unknown ${PACKAGE_NAME} version: ${version}`);
  const at = `${PACKAGE_NAME}@${version}`;
  const dist = entry.dist;
  if (!isRecord(dist)) throw new Error(`${at}: missing dist`);

  return {
    version,
    license: requireString(entry, "license", at),
    tarball: requireString(dist, "tarball", `${at} dist`),
    integrity: requireString(dist, "integrity", `${at} dist`),
  };
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

const INTEGRITY_DIGEST = /^(sha256|sha384|sha512)-([A-Za-z0-9+/]+={0,2})$/;

/** Split an SRI attribute (space separated `algo-base64` digests). */
export function parseIntegrity(integrity: string): Array<{ algorithm: string; digest: string }> {
  const digests: Array<{ algorithm: string; digest: string }> = [];
  for (const token of integrity.split(/\s+/)) {
    if (token === "") continue;
    const match = INTEGRITY_DIGEST.exec(token);
    const algorithm = match?.[1];
    const digest = match?.[2];
    if (!algorithm || !digest) throw new Error(`unsupported integrity digest: ${token}`);
    digests.push({ algorithm, digest });
  }
  if (digests.length === 0) throw new Error("integrity string is empty");
  return digests;
}

/** Throws unless the bytes match at least one digest in `integrity`. */
export function verifyIntegrity(bytes: Uint8Array, integrity: string): void {
  const digests = parseIntegrity(integrity);
  const algorithms = [...new Set(digests.map((entry) => entry.algorithm))];
  const actual = algorithms.map(
    (algorithm) => `${algorithm}-${createHash(algorithm).update(bytes).digest("base64")}`,
  );
  if (digests.some((entry) => actual.includes(`${entry.algorithm}-${entry.digest}`))) return;
  throw new Error(`integrity mismatch: registry says ${integrity}, tarball is ${actual.join(" ")}`);
}
