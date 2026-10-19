import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkVendored, VENDOR_SOURCE, VENDOR_TYPES } from "./check-vendor.ts";
import { inventory, KINDS } from "./inventory.ts";
import { applyStructuralAliases, STRUCTURAL_ALIASES } from "./aliases.ts";
import { isRecord } from "./raycast-api.ts";

export const INVENTORY_PATH = "compat/raycast-api.inventory.json";

export function generateInventory(root: string, aliases = STRUCTURAL_ALIASES): string {
  const errors = checkVendored(root);
  if (errors.length) throw new Error(errors.join("\n"));
  const source: unknown = JSON.parse(readFileSync(join(root, VENDOR_SOURCE), "utf8"));
  if (!isRecord(source) || typeof source.version !== "string" || !source.version)
    throw new Error(`${VENDOR_SOURCE}: missing version`);
  const result = inventory(readFileSync(join(root, VENDOR_TYPES), "utf8"));
  applyStructuralAliases(result.entries, aliases);
  return `${JSON.stringify({ version: source.version, sha256: source.sha256, ...result }, null, 2)}\n`;
}

export function checkInventory(root: string, aliases = STRUCTURAL_ALIASES): string[] {
  const expected = generateInventory(root, aliases);
  const path = join(root, INVENTORY_PATH);
  return existsSync(path) && readFileSync(path, "utf8") === expected
    ? []
    : [`${INVENTORY_PATH}: missing or stale; run \`bun run compat:inventory\``];
}

if (import.meta.main) {
  const root = process.cwd();
  const output = generateInventory(root);
  writeFileSync(join(root, INVENTORY_PATH), output);
  const result = JSON.parse(output) as ReturnType<typeof inventory>;
  console.log(
    `inventory: ${KINDS.map((kind) => `${kind}=${result.entries.filter((entry) => entry.kind === kind).length}`).join(", ")}; external=${result.external.length}`,
  );
}
