// Offline tests for the shared import-specifier helpers the curated-set
// selector and the dependency scan both read. Fixture sources only: `bun test`
// must never read the corpus checkout or the network.
import { expect, test } from "bun:test";
import {
  BASE_PACKAGES,
  importedPackages,
  packageName,
  SHARED_DEPENDENCY_PACKAGES,
  unprovidedImports,
  type Source,
} from "./imports.ts";

const source = (text: string, file = "src/index.tsx"): Source => ({ file, source: text });

test("unprovided imports are the bare specifiers Blast cannot resolve", () => {
  expect(unprovidedImports([source('import gql from "graphql-tag";')])).toEqual(["graphql-tag"]);
  expect(unprovidedImports([source('const x = require("@components/notes-list");')])).toEqual([
    "@components/notes-list",
  ]);
  expect(unprovidedImports([source('export * from "unprovided-pkg";')])).toEqual([
    "unprovided-pkg",
  ]);
  expect(unprovidedImports([source('const client = await import("graphql-request");')])).toEqual([
    "graphql-request",
  ]);
  // A test file is never bundled, so its dev-only imports do not count.
  expect(
    unprovidedImports([source('import { test } from "vitest";', "src/__tests__/unit.test.ts")]),
  ).toEqual([]);
  expect(
    unprovidedImports([source('import { test } from "vitest";', "src/thing.spec.ts")]),
  ).toEqual([]);
  // Blast's provided dependencies, relative paths and Node built-ins resolve.
  expect(
    unprovidedImports([
      source(`import { List } from "@raycast/api";
import { useFetch } from "@raycast/utils";
import { useState } from "react";
import { readFile } from "node:fs/promises";
import { join } from "path";
import { helper } from "./helper";
export * from "../shared";
import "./side-effect";`),
    ]),
  ).toEqual([]);
});

test("a bare specifier maps to its npm package name", () => {
  expect(packageName("react")).toBe("react");
  expect(packageName("lodash/merge.js")).toBe("lodash");
  expect(packageName("@scope/pkg/sub/path")).toBe("@scope/pkg");
});

test("imported packages are counted per package, test files and non-npm specifiers excluded", () => {
  const files: Source[] = [
    source('import lodash from "lodash";'),
    source('import merge from "lodash/merge.js";'),
    source('const client = await import("graphql-request");'),
    source('const deep = require("@scope/pkg/sub");'),
    source('export * from "zod";'),
    // Never bundled, so never a dependency.
    source('import { test } from "vitest";', "src/thing.test.ts"),
    source('import { test } from "vitest";', "src/__tests__/unit.ts"),
    // Provided packages, built-ins, relative paths, native modules and
    // specifiers npm could not name all resolve or are not packages.
    source('import { List } from "@raycast/api";'),
    source('import { useFetch } from "@raycast/utils";'),
    source('import { useState } from "react";'),
    source('import { readFile } from "node:fs/promises";'),
    source('import { join } from "path";'),
    source('import { helper } from "./helper";'),
    source('import { connect } from "swift:../../swift";'),
    source('import { Thing } from "@/types";'),
    source('import { Glyph } from "AppKit";'),
    source('import { local } from "#imports";'),
  ];
  expect(importedPackages(files)).toEqual(["@scope/pkg", "graphql-request", "lodash", "zod"]);
});

test("shared dependency packages are the allowlist minus the baseline", () => {
  for (const name of BASE_PACKAGES) expect(SHARED_DEPENDENCY_PACKAGES).not.toContain(name);
  expect(SHARED_DEPENDENCY_PACKAGES).toContain("node-fetch");
  expect(SHARED_DEPENDENCY_PACKAGES).toContain("axios");
  expect(SHARED_DEPENDENCY_PACKAGES).toContain("zod");
  expect(new Set(SHARED_DEPENDENCY_PACKAGES).size).toBe(SHARED_DEPENDENCY_PACKAGES.length);
});
