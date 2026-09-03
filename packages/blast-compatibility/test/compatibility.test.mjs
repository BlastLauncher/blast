import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { buildCensusReport, readManifestSummary, scanCorpus, scanExtension } from "../dist/index.js";

const fixturesRoot = fileURLToPath(new URL("./fixtures", import.meta.url));
const extensionA = path.join(fixturesRoot, "extension-a");
const extensionB = path.join(fixturesRoot, "extension-b");
const extensionC = path.join(fixturesRoot, "extension-c");

test("summarizes manifests leniently", async (context) => {
  await context.test("a rich manifest", async () => {
    const manifest = await readManifestSummary(path.join(extensionA, "package.json"));
    assert.equal(manifest?.name, "fixture-a");
    assert.equal(manifest?.apiDependencyRange, "^1.71.0");
    assert.deepEqual(manifest?.categories, ["Productivity", "Developer Tools"]);
    assert.deepEqual(
      manifest?.commands.map((command) => [command.name, command.mode]),
      [
        ["index", "view"],
        ["quick", "no-view"],
      ],
    );
    assert.deepEqual(
      manifest?.preferences.map((preference) => [preference.name, preference.type, preference.required]),
      [
        ["token", "password", true],
        ["city", "textfield", undefined],
      ],
    );
  });

  await context.test("missing and broken manifests", async () => {
    assert.equal(await readManifestSummary(path.join(fixturesRoot, "does-not-exist.json")), undefined);
    assert.equal(await readManifestSummary(path.join(extensionC, "package.json")), undefined);
  });
});

test("collects @raycast/api imports from source files", async () => {
  const scan = await scanExtension(extensionA);

  assert.equal(scan.sourceFiles, 2);
  assert.deepEqual(scan.apiImports, [
    { api: "List", count: 3 },
    { api: "<dynamic>", count: 1 },
    { api: "<namespace>", count: 1 },
    { api: "<require>", count: 1 },
    { api: "Action", count: 1 },
    { api: "ActionPanel", count: 1 },
    { api: "Clipboard", count: 1 },
    { api: "Icon", count: 1 },
  ]);
});

test("reports extensions without API imports", async () => {
  const scan = await scanExtension(extensionB);
  assert.deepEqual(scan.apiImports, []);
  assert.equal(scan.sourceFiles, 1);
  assert.equal(scan.manifest?.name, "fixture-b");
});

test("scans extension sources even when the manifest is broken", async () => {
  const scan = await scanExtension(extensionC);
  assert.equal(scan.manifest, undefined);
  assert.deepEqual(scan.apiImports, [{ api: "Detail", count: 1 }]);
});

test("scans corpus directories with package.json only", async () => {
  const scans = await scanCorpus(fixturesRoot);
  assert.deepEqual(
    scans.map((scan) => scan.directory.split(path.sep).pop()),
    ["extension-a", "extension-b", "extension-c"],
  );
});

test("builds deterministic census reports", async () => {
  const scans = await scanCorpus(fixturesRoot);
  const report = buildCensusReport(scans, { corpusRevision: "revision-1", corpusUrl: "https://example.test/corpus" });
  const repeat = buildCensusReport(scans.toReversed(), {
    corpusRevision: "revision-1",
    corpusUrl: "https://example.test/corpus",
  });

  assert.deepEqual(report, repeat);
  assert.equal(report.protocolVersion, 1);
  assert.equal(report.corpusRevision, "revision-1");
  assert.deepEqual(report.extensions, { total: 3, withManifest: 2, withApiImports: 2 });
  assert.equal(report.apiUsage[0]?.api, "List");
  assert.deepEqual(
    report.apiUsage.find((entry) => entry.api === "List"),
    { api: "List", extensionCount: 1, usageCount: 3 },
  );
  assert.deepEqual(
    report.apiUsage.find((entry) => entry.api === "Detail"),
    { api: "Detail", extensionCount: 1, usageCount: 1 },
  );
  assert.deepEqual(report.commandModes, { "no-view": 1, view: 1 });
  assert.deepEqual(report.preferenceTypes, { password: 1, textfield: 1 });
  assert.deepEqual(report.apiDependencyRanges, [{ range: "^1.71.0", extensionCount: 1 }]);
});
