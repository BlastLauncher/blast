import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { checkInventory, generateInventory, INVENTORY_PATH } from "./generate-inventory.ts";
import { VENDOR_SOURCE, VENDOR_TYPES } from "./check-vendor.ts";
import { sha256Hex } from "./raycast-api.ts";

test("generation is byte-stable, includes provenance, and detects missing or edited JSON", () => {
  const root = mkdtempSync(join(tmpdir(), "blast-inventory-"));
  try {
    const types = "export declare const value: string;";
    const sha256 = sha256Hex(new TextEncoder().encode(types));
    mkdirSync(dirname(join(root, VENDOR_TYPES)), { recursive: true });
    writeFileSync(join(root, VENDOR_TYPES), types);
    writeFileSync(join(root, VENDOR_SOURCE), JSON.stringify({ version: "1.2.3", sha256 }));
    const output = generateInventory(root, {});
    expect(JSON.parse(output)).toMatchObject({ version: "1.2.3", sha256 });
    expect(generateInventory(root, {})).toBe(output);
    expect(checkInventory(root, {})[0]).toContain("missing or stale");
    writeFileSync(join(root, INVENTORY_PATH), output);
    expect(checkInventory(root, {})).toEqual([]);
    writeFileSync(join(root, INVENTORY_PATH), `${output} `);
    expect(checkInventory(root, {})[0]).toContain("missing or stale");
    writeFileSync(join(root, VENDOR_TYPES), `${types} `);
    expect(() => generateInventory(root, {})).toThrow("does not match");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("committed inventory matches regeneration from the pinned declarations", () => {
  expect(generateInventory(process.cwd())).toBe(readFileSync(INVENTORY_PATH, "utf8"));
});

test("generation fails on a fixture whose mapped alias has unmatched members", () => {
  const root = mkdtempSync(join(tmpdir(), "blast-alias-mismatch-"));
  try {
    const types = `
      export interface Current { shared: string }
      /** @deprecated */ export interface Legacy { shared: string; aliasOnly: boolean }
    `;
    const sha256 = sha256Hex(new TextEncoder().encode(types));
    mkdirSync(dirname(join(root, VENDOR_TYPES)), { recursive: true });
    writeFileSync(join(root, VENDOR_TYPES), types);
    writeFileSync(join(root, VENDOR_SOURCE), JSON.stringify({ version: "1.2.3", sha256 }));
    expect(() => generateInventory(root, { Legacy: "Current" })).toThrow(
      "Legacy.aliasOnly → Current.aliasOnly: missing member",
    );
    const result = JSON.parse(generateInventory(root, {}));
    expect(
      result.entries.find((entry: { path: string }) => entry.path === "Legacy.aliasOnly"),
    ).not.toHaveProperty("aliasTarget");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
