import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkStubs, generateStubs, STUBS_PATH } from "./generate-stubs.ts";

test("stub generation is stable, skips types, and detects stale or missing output", () => {
  const root = mkdtempSync(join(tmpdir(), "blast-stubs-"));
  try {
    mkdirSync(join(root, "compat"));
    mkdirSync(join(root, "packages/runtime/src/api"), { recursive: true });
    writeFileSync(
      join(root, "compat/raycast-api.inventory.json"),
      JSON.stringify({
        entries: [
          { path: "Z", kind: "component" },
          { path: "A", kind: "function" },
          { path: "Z.Child", kind: "component" },
          { path: "Props", kind: "interface" },
          { path: "Alias", kind: "type" },
        ],
      }),
    );
    writeFileSync(
      join(root, "packages/runtime/src/api/index.ts"),
      "export const Z = Modern.Item;\n",
    );
    const output = generateStubs(root);
    expect(generateStubs(root)).toBe(output);
    expect(output).toContain('export const A = api("A");');
    expect(output).not.toContain("export const Z");
    expect(output).not.toMatch(/Props|Alias|Z.Child/);
    expect(checkStubs(root)).toHaveLength(1);
    writeFileSync(join(root, STUBS_PATH), output);
    expect(checkStubs(root)).toEqual([]);
    writeFileSync(join(root, STUBS_PATH), output + "\n");
    expect(checkStubs(root)).toHaveLength(1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("committed stubs match the pinned inventory", () => {
  expect(checkStubs(process.cwd())).toEqual([]);
});
