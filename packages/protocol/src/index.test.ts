import { expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import * as protocol from "./index.ts";

const API = [
  "PROTOCOL_VERSION",
  "DEFAULT_MAX_LINE_BYTES",
  "encodeMessage",
  "createLineDecoder",
  "parseHostMessage",
  "parseRuntimeMessage",
];

test("index re-exports the documented surface", () => {
  for (const name of API) expect(Object.keys(protocol)).toContain(name);
  expect(protocol.PROTOCOL_VERSION).toBe(1);
});

test("the package has no dependencies and its source imports nothing from node", () => {
  const manifest = JSON.parse(
    readFileSync(join(import.meta.dir, "..", "package.json"), "utf8"),
  ) as Record<string, unknown>;
  expect(manifest["name"]).toBe("@blastlauncher/protocol");
  expect(manifest["private"]).toBe(true);
  expect(manifest["type"]).toBe("module");
  for (const field of ["dependencies", "peerDependencies", "optionalDependencies"]) {
    expect(manifest[field], field).toBeUndefined();
  }

  const sources = readdirSync(import.meta.dir)
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .toSorted();
  expect(sources).toEqual(["framing.ts", "index.ts", "messages.ts"]);
  for (const name of sources) {
    const source = readFileSync(join(import.meta.dir, name), "utf8");
    expect(source, name).not.toMatch(/from\s+["']node:/);
    expect(source, name).not.toMatch(/\brequire\s*\(/);
  }
});
