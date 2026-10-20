// Serializes `EMBEDDER_PROTOCOL_SCHEMA` (the single source of truth in
// `packages/protocol/src/embedder-schema.ts`) into the checked-in file with a
// stable key order: the literal's insertion order, two-space indented.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { EMBEDDER_PROTOCOL_SCHEMA } from "../../packages/protocol/src/embedder-schema.ts";

export const SCHEMA_FILE = "packages/protocol/schema/embedder-v1.schema.json";

export function serialize(): string {
  return `${JSON.stringify(EMBEDDER_PROTOCOL_SCHEMA, null, 2)}\n`;
}

export function writeSchema(root: string): void {
  const path = join(root, SCHEMA_FILE);
  mkdirSync(join(root, "packages/protocol/schema"), { recursive: true });
  writeFileSync(path, serialize());
}

export function checkSchema(root: string): string[] {
  const path = join(root, SCHEMA_FILE);
  if (!existsSync(path)) return [`${SCHEMA_FILE}: missing; run \`bun run protocol:schema\``];
  const written = readFileSync(path, "utf8");
  if (written !== serialize()) {
    return [`${SCHEMA_FILE}: stale; run \`bun run protocol:schema\` and commit the result`];
  }
  return [];
}
