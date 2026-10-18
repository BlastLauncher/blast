import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { buildDeclarationCompatibilityReport, buildDeclarationInventory } from "../dist/index.js";

const fixturesRoot = fileURLToPath(new URL("./fixtures/declarations", import.meta.url));
const raycastDeclaration = path.join(fixturesRoot, "raycast.d.ts");
const adapterDeclaration = path.join(fixturesRoot, "adapter.d.ts");

test("inventories merged declaration namespaces and runtime members", () => {
  const inventory = buildDeclarationInventory(raycastDeclaration);
  assert.deepEqual(
    inventory.topLevel.map((member) => member.path),
    ["Cache", "Color", "Component", "Config", "Icon"],
  );
  assert.ok(inventory.nested.some((member) => member.path === "Color.Name"));
  assert.ok(inventory.nested.some((member) => member.path === "Color.Red"));
  assert.ok(inventory.nested.some((member) => member.path === "Cache.get"));
  assert.ok(inventory.nested.some((member) => member.path === "Icon.Remove"));
  assert.ok(!inventory.nested.some((member) => member.path === "Component.displayName"));
  assert.ok(!inventory.nested.some((member) => member.path === "Cache.secret"));
});

test("compares declaration shape, honors open records, and reports observed imports", () => {
  const options = {
    adapterDeclarationPath: adapterDeclaration,
    adapterLabel: "adapter.d.ts",
    observedApiImports: ["Cache", "Color", "Config", "Icon", "<namespace>"],
    raycastDeclarationPath: raycastDeclaration,
    raycastLabel: "raycast.d.ts",
  };
  const report = buildDeclarationCompatibilityReport(options);
  const repeat = buildDeclarationCompatibilityReport(options);

  assert.deepEqual(report, repeat);
  assert.equal(report.comparison.topLevel.missing.length, 0);
  assert.deepEqual(
    report.comparison.nested.missing.map((member) => member.path),
    ["Cache.get", "Icon.Remove"],
  );
  assert.deepEqual(report.observed.unrepresentedApiNames, []);
  assert.equal(report.finishLine.passed, false);
  assert.equal(report.comparison.nested.coverage < 1, true);
  assert.ok(report.adapter.nested.some((member) => member.path === "Config.*"));
});

test("checks the runtime export set when a built adapter is supplied", () => {
  const report = buildDeclarationCompatibilityReport({
    adapterDeclarationPath: adapterDeclaration,
    adapterRuntimeExports: ["Cache", "Color", "Component", "Config", "Icon"],
    raycastDeclarationPath: raycastDeclaration,
  });

  assert.deepEqual(report.runtime?.missing, []);
  assert.deepEqual(report.runtime?.extra, []);
  assert.equal(report.finishLine.runtimeExportBlockers.length, 0);
  assert.equal(report.finishLine.passed, false);
});
