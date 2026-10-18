import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { checkVendored, VENDOR_SOURCE, VENDOR_TYPES } from "./check-vendor.ts";
import { sha256Hex } from "./raycast-api.ts";

const TYPES = "export declare const Clipboard: unknown;\n";
const DIGEST = sha256Hex(new TextEncoder().encode(TYPES));

const roots: string[] = [];

function vendorRoot(files: Record<string, string | undefined> = {}): string {
  const root = mkdtempSync(join(tmpdir(), "blast-compat-"));
  roots.push(root);
  mkdirSync(dirname(join(root, VENDOR_TYPES)), { recursive: true });
  const all: Record<string, string | undefined> = {
    [VENDOR_TYPES]: TYPES,
    [VENDOR_SOURCE]: JSON.stringify(
      { package: "@raycast/api", version: "2.8.2", sha256: DIGEST },
      null,
      2,
    ),
    ...files,
  };
  for (const [path, text] of Object.entries(all)) {
    if (text === undefined) continue;
    writeFileSync(join(root, path), text);
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("checkVendored", () => {
  test("accepts a matching digest", () => {
    expect(checkVendored(vendorRoot())).toEqual([]);
  });

  test("fails when a single byte of the vendored file changed", () => {
    expect(checkVendored(vendorRoot({ [VENDOR_TYPES]: `${TYPES} ` }))).toEqual([
      `${VENDOR_TYPES}: sha256 ${sha256Hex(new TextEncoder().encode(`${TYPES} `))} does not match ${VENDOR_SOURCE} (${DIGEST}); run \`bun run compat:fetch\``,
    ]);
  });

  test("fails when the source metadata is missing", () => {
    expect(checkVendored(vendorRoot({ [VENDOR_SOURCE]: undefined }))).toEqual([
      `${VENDOR_SOURCE}: missing; run \`bun run compat:fetch\``,
    ]);
  });

  test("fails when the vendored file is missing", () => {
    expect(checkVendored(vendorRoot({ [VENDOR_TYPES]: undefined }))).toEqual([
      `${VENDOR_TYPES}: missing; run \`bun run compat:fetch\``,
    ]);
  });

  test("fails on malformed source metadata", () => {
    expect(checkVendored(vendorRoot({ [VENDOR_SOURCE]: "{not json" }))[0]).toStartWith(
      `${VENDOR_SOURCE}: invalid JSON`,
    );
    expect(checkVendored(vendorRoot({ [VENDOR_SOURCE]: '"a string"' }))).toEqual([
      `${VENDOR_SOURCE}: must be a JSON object`,
    ]);
    expect(
      checkVendored(vendorRoot({ [VENDOR_SOURCE]: JSON.stringify({ sha256: "abc" }) })),
    ).toEqual([`${VENDOR_SOURCE}: sha256 must be 64 lowercase hex characters`]);
  });
});
