// Offline guard for the vendored declarations: `compat/raycast-api/index.d.ts`
// must still hash to `compat/raycast-api/source.json.sha256`. Run by the
// `compat` step in scripts/verify.ts, so a hand-edited or half-copied file
// fails the gate instead of silently skewing coverage.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isRecord, sha256Hex } from "./raycast-api.ts";

export const VENDOR_DIR = "compat/raycast-api";
export const VENDOR_SOURCE = `${VENDOR_DIR}/source.json`;
export const VENDOR_TYPES = `${VENDOR_DIR}/index.d.ts`;
export const SHA256_HEX = /^[0-9a-f]{64}$/;

const FETCH_HINT = "run `bun run compat:fetch`";

/** Returns human-readable problems; empty means the vendored file is intact. */
export function checkVendored(root: string): string[] {
  const sourcePath = join(root, VENDOR_SOURCE);
  const typesPath = join(root, VENDOR_TYPES);
  for (const [path, file] of [
    [sourcePath, VENDOR_SOURCE],
    [typesPath, VENDOR_TYPES],
  ] as const) {
    if (!existsSync(path)) return [`${file}: missing; ${FETCH_HINT}`];
  }

  let source: unknown;
  try {
    source = JSON.parse(readFileSync(sourcePath, "utf8"));
  } catch (error) {
    return [`${VENDOR_SOURCE}: invalid JSON (${error instanceof Error ? error.message : error})`];
  }
  if (!isRecord(source)) return [`${VENDOR_SOURCE}: must be a JSON object`];
  const expected = source.sha256;
  if (typeof expected !== "string" || !SHA256_HEX.test(expected)) {
    return [`${VENDOR_SOURCE}: sha256 must be 64 lowercase hex characters`];
  }

  const actual = sha256Hex(readFileSync(typesPath));
  if (actual !== expected) {
    return [
      `${VENDOR_TYPES}: sha256 ${actual} does not match ${VENDOR_SOURCE} (${expected}); ${FETCH_HINT}`,
    ];
  }
  return [];
}

if (import.meta.main) {
  const errors = checkVendored(process.cwd());
  for (const error of errors) console.error(`compat: ${error}`);
  if (errors.length > 0) process.exit(1);
  console.log("compat: ok");
}
