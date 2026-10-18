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
  for (const name of ["unprovided-http", "react-dom", "@scope/pkg", "unprovided-pkg"])
    expect(trackedPackage(name)).toBe(true);
});

test("declared dependencies are the runtime ones, beyond the provided packages and types", () => {
  const manifest = {
    dependencies: {
      "@raycast/api": "^1.0.0",
      "@raycast/utils": "2.3.2",
      react: "^18",
      "unprovided-schema": "^3.22.4",
      "unprovided-fetch": "^2",
      "@types/node": "20.x",
    },
    devDependencies: { vitest: "^1" },
  } as Manifest;
  const deps = extensionDependencies(manifest, [
    source('import { schema } from "unprovided-schema";'),
  ]);
  expect(deps.declared).toEqual({ "unprovided-fetch": "2", "unprovided-schema": "3" });
  expect(deps.imported).toEqual(["unprovided-schema"]);
  expect(extensionDependencies(undefined, []).declared).toEqual({});
});

test("imported packages are the npm modules non-test sources import, subpaths folded in", () => {
  const deps = extensionDependencies({}, [
    source('import provided from "unprovided-pkg";'),
    source('import merge from "unprovided-pkg/merge.js";'),
    source('const client = await import("graphql-request");'),
    source('const deep = require("@scope/pkg/sub");'),
    source('import { test } from "vitest";', "src/thing.test.ts"),
    source('import { List } from "@raycast/api";'),
    source('import { useState } from "react";'),
    source('import { readFile } from "node:fs/promises";'),
    source('import { connect } from "swift:../../swift";'),
    source('import { helper } from "./helper";'),
  ]);
  expect(deps.imported).toEqual(["@scope/pkg", "graphql-request", "unprovided-pkg"]);
  expect(packageName("unprovided-pkg/merge.js")).toBe("unprovided-pkg");
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
  expect(markdown).toContain("- 0 of 70 extensions need nothing beyond the provided set.");
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
