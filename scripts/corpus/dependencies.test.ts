// Offline tests for the dependency aggregation. Fixture manifests and sources
// only: `bun test` must never read the corpus checkout or the network.
import { expect, test } from "bun:test";
import {
  aggregateDependencies,
  extensionDependencies,
  majorOf,
  renderDependenciesMd,
  trackedPackage,
  type ExtensionDependencies,
} from "./dependencies.ts";
import { PROVIDED_PACKAGES } from "@blastlauncher/shared-deps";
import { dependencyWarnings, isDependencyCompatible } from "@blastlauncher/shared-deps";
import { packageName } from "./imports.ts";
import type { Manifest } from "./selection.ts";

const source = (text: string, file = "src/index.tsx") => ({ file, source: text });

test("a declared range maps to its major bucket", () => {
  expect(majorOf("^2.6.1")).toBe("2");
  expect(majorOf("2.6.1")).toBe("2");
  expect(majorOf("~1.2")).toBe("1");
  expect(majorOf(">=3.0.0 <4")).toBe("3");
  expect(majorOf("1.x")).toBe("1");
  for (const range of ["latest", "*", "", "workspace:*", "https://example.com/x.tgz", 7])
    expect(majorOf(range)).toBe("other");
});

test("only packages Blast could pin are tracked", () => {
  for (const name of ["@raycast/api", "@raycast/utils", "react", "node:fs", "@types/node"])
    expect(trackedPackage(name)).toBe(false);
  for (const name of ["axios", "react-dom", "@scope/pkg", "lodash"])
    expect(trackedPackage(name)).toBe(true);
});

test("declared dependencies are the runtime ones, beyond the provided packages and types", () => {
  const manifest = {
    dependencies: {
      "@raycast/api": "^1.0.0",
      "@raycast/utils": "2.3.2",
      react: "^18",
      zod: "^3.22.4",
      "node-fetch": "^2",
      "@types/node": "20.x",
    },
    devDependencies: { vitest: "^1" },
  } as Manifest;
  const deps = extensionDependencies(manifest, [source('import { zod } from "zod";')]);
  expect(deps.declared).toEqual({ "node-fetch": "2", zod: "3" });
  expect(deps.imported).toEqual(["zod"]);
  expect(extensionDependencies(undefined, []).declared).toEqual({});
});

test("pre-release-only shared ranges are not satisfied by a stable provided major", () => {
  expect(dependencyWarnings({ cheerio: "^1.0.0-rc.12" })).toEqual([
    "Shared dependency cheerio: declared ^1.0.0-rc.12, provided 1.2.0 (major mismatch)",
  ]);
  expect(dependencyWarnings({ cheerio: "^1.0.0" })).toEqual([]);
  const prerelease = extensionDependencies({ dependencies: { cheerio: "^1.0.0-rc.12" } }, [
    source('import cheerio from "cheerio";'),
  ]);
  const stable = extensionDependencies({ dependencies: { cheerio: "^1.0.0" } }, [
    source('import cheerio from "cheerio";'),
  ]);
  expect(aggregateDependencies("pin", [prerelease, stable]).shared.satisfied).toBe(1);
});

test("semver comparator sets distinguish prerelease-only ranges from stable branches", () => {
  const cases: Array<[string, boolean]> = [
    ["^1.0.0-rc.12", false],
    ["^1.0.10-rc.1", false],
    ["~1.0.0-beta.3", false],
    [">=1.0.0-rc.1 <2.0.0", true],
    ["1.0.0-rc.12 || ^1.1", true],
    ["1.0.0-rc.12 || 1.x", true],
    [">=1.2.0-rc.1 <1.2.0", false],
    ["^1.1.0", true],
    ["1.x", true],
    ["*", true],
    ["^11.0.0-rc.1", false],
  ];
  for (const [range, expected] of cases)
    expect(isDependencyCompatible("cheerio", range), range).toBe(expected);
});

test("aliases evaluate their inner range and non-semver specifiers are not satisfied", () => {
  expect(isDependencyCompatible("cheerio", "npm:cheerio@^1.0.0-rc.12")).toBe(false);
  expect(isDependencyCompatible("cheerio", "npm:cheerio@^1.1.0")).toBe(true);
  expect(isDependencyCompatible("cheerio", "npm:other@^1.1.0")).toBe(false);
  expect(isDependencyCompatible("cheerio", "workspace:*")).toBe(false);
  expect(isDependencyCompatible("cheerio", "file:../cheerio")).toBe(false);
  expect(isDependencyCompatible("cheerio", "https://example.com/cheerio.tgz")).toBe(false);
  expect(isDependencyCompatible("cheerio", "latest")).toBe(true);
  expect(isDependencyCompatible("cheerio", "*")).toBe(true);
  expect(() => dependencyWarnings({ cheerio: "workspace:*" })).not.toThrow();
  expect(() => dependencyWarnings({ cheerio: "npm:cheerio@^1.0.0-rc.12" })).not.toThrow();
});

test("dependency warnings deliberately flag stable ranges with no version on the provided line", () => {
  for (const range of ["<1.0.0", ">=0.5.0 <1.0.0", "<=1.0.0-rc.5"])
    expect(dependencyWarnings({ cheerio: range })).toEqual([
      `Shared dependency cheerio: declared ${range}, provided 1.2.0 (major mismatch)`,
    ]);
});

test("the 0.x compatibility line is minor-specific when a provided package is 0.x", () => {
  // No current shared package is 0.x; this still exercises that a 0.x
  // declaration cannot satisfy the provided axios 1.x line. The implementation
  // uses 0.y when such a package is added.
  expect(isDependencyCompatible("axios", "^0.1.2")).toBe(false);
});

test("imported packages are the npm modules non-test sources import, subpaths folded in", () => {
  const deps = extensionDependencies({}, [
    source('import lodash from "lodash";'),
    source('import merge from "lodash/merge.js";'),
    source('const client = await import("graphql-request");'),
    source('const deep = require("@scope/pkg/sub");'),
    source('import { test } from "vitest";', "src/thing.test.ts"),
    source('import { List } from "@raycast/api";'),
    source('import { useState } from "react";'),
    source('import { readFile } from "node:fs/promises";'),
    source('import { connect } from "swift:../../swift";'),
    source('import { helper } from "./helper";'),
  ]);
  expect(deps.imported).toEqual(["@scope/pkg", "graphql-request", "lodash"]);
  expect(packageName("lodash/merge.js")).toBe("lodash");
});

/** Two extensions that need nothing, one per package, and one needing two. */
const FIXTURES: ExtensionDependencies[] = [
  { declared: {}, imported: [] },
  { declared: { "@raycast/utils": "2.3.2" }, imported: [] },
  { declared: { a: "1" }, imported: ["a"] },
  { declared: { a: "2" }, imported: ["a"] },
  { declared: { b: "1" }, imported: ["b"] },
  { declared: { c: "other" }, imported: ["b", "c"] },
];

test("aggregation counts each extension once per package and orders by imports then name", () => {
  const report = aggregateDependencies("pin", FIXTURES, [1, 2, 3]);
  expect(report.extensions).toBe(6);
  expect(report.providedOnly).toBe(2);
  expect(report.packages).toEqual([
    { name: "a", declared: 2, imported: 2, majors: { "1": 1, "2": 1 } },
    { name: "b", declared: 1, imported: 2, majors: { "1": 1 } },
    { name: "c", declared: 1, imported: 1, majors: { other: 1 } },
  ]);
  // The curve is cumulative, so it includes the extensions that need nothing.
  expect(report.curve).toEqual([
    { provided: 1, satisfied: 4 },
    { provided: 2, satisfied: 5 },
    { provided: 3, satisfied: 6 },
  ]);
  // Order-independent: the same corpus in another order renders the same bytes.
  expect(JSON.stringify(report)).toBe(
    JSON.stringify(aggregateDependencies("pin", FIXTURES.toReversed(), [1, 2, 3])),
  );
  expect(aggregateDependencies("pin", FIXTURES).curve).toEqual([
    { provided: 10, satisfied: 6 },
    { provided: 20, satisfied: 6 },
    { provided: 30, satisfied: 6 },
    { provided: 50, satisfied: 6 },
  ]);
});

test("an extension counts once per package however many times it imports it", () => {
  const report = aggregateDependencies(
    "pin",
    [{ declared: { a: "1" }, imported: ["a", "a", "a"] }],
    [],
  );
  expect(report.packages).toEqual([{ name: "a", declared: 1, imported: 1, majors: { "1": 1 } }]);
});

test("the markdown renders the summary, the cumulative curve and at most sixty rows", () => {
  const many: ExtensionDependencies[] = Array.from({ length: 70 }, (_, index) => {
    const name = `pkg-${String(index).padStart(2, "0")}`;
    return { declared: { [name]: index === 0 ? "other" : "1" }, imported: [name] };
  });
  const markdown = renderDependenciesMd(aggregateDependencies("pin", many, [10, 20]));
  expect(markdown).toStartWith("# Corpus dependencies");
  expect(markdown).toContain("- 0 of 70 extensions need nothing beyond the baseline set.");
  expect(markdown).toContain("- 70 packages are declared or imported by at least one extension.");
  expect(markdown).toContain("| 0 | 0 |");
  expect(markdown).toContain("| 10 | 10 |");
  expect(markdown).toContain("| 20 | 20 |");
  expect(markdown).toContain("## Top 60 packages");
  expect(markdown).toContain("| `pkg-00` | 1 | 1 | other (100%) |");
  expect(markdown).toContain("| `pkg-01` | 1 | 1 | 1 (100%) |");
  expect(markdown.match(/^\| `pkg-/gm)).toHaveLength(60);
  expect(markdown.endsWith("\n")).toBe(true);
});

test("the top major is the most declared one, not the numerically smallest", () => {
  // Integer-like object keys enumerate ascending, so "2" would come first if
  // the ranking relied on object key order.
  const fixtures: ExtensionDependencies[] = [
    { declared: { a: "2" }, imported: ["a"] },
    { declared: { a: "3" }, imported: ["a"] },
    { declared: { a: "3" }, imported: ["a"] },
  ];
  const markdown = renderDependenciesMd(aggregateDependencies("pin", fixtures, []));
  expect(markdown).toContain("| `a` | 3 | 3 | 3 (67%) |");
});

test("shared satisfaction requires every declared and imported package, independent of ranking", () => {
  const extensions: ExtensionDependencies[] = [
    { declared: {}, imported: [] },
    { declared: { "date-fns": "4" }, imported: ["date-fns", "date-fns"] },
    { declared: { lodash: "3" }, imported: [] },
    { declared: { "rss-parser": "3" }, imported: ["date-fns"] },
    { declared: { lodash: "4" }, imported: ["unprovided-pkg"] },
  ];
  const report = aggregateDependencies("pin", extensions);
  expect(report.shared).toEqual({ provided: [...PROVIDED_PACKAGES].toSorted(), satisfied: 3 });
  expect(renderDependenciesMd(report)).toContain(
    "- 3 of 5 extensions are satisfied by the current shared allowlist",
  );
  const limited = aggregateDependencies("pin", extensions, undefined, ["date-fns", "date-fns"]);
  expect(limited.shared).toEqual({ provided: ["date-fns"], satisfied: 2 });
  expect(limited.packages).toEqual(report.packages);
  expect(limited.curve).toEqual(report.curve);
  expect(limited.providedOnly).toBe(report.providedOnly);
});

test("the package curve models availability without hypothetical version checks", () => {
  const extension: ExtensionDependencies = {
    declared: { hypothetical: "not-a-semver" },
    ranges: { hypothetical: "not-a-semver" },
    imported: ["hypothetical"],
  };
  expect(aggregateDependencies("pin", [extension], [1]).curve).toEqual([
    { provided: 1, satisfied: 1 },
  ]);
});
