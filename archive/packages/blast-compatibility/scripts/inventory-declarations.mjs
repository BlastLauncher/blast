#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { buildDeclarationCompatibilityReport } from "../dist/index.js";

const args = process.argv.slice(2);
if (args.length < 3 || args.length > 5 || args.includes("--help")) {
  console.error(
    "Usage: node packages/blast-compatibility/scripts/inventory-declarations.mjs <raycast-d.ts> <adapter-d.ts> <output-json> [census-json] [adapter-runtime.mjs]",
  );
  process.exit(args.includes("--help") ? 0 : 2);
}

const [raycastDeclarationPath, adapterDeclarationPath, outputPath, censusPath, adapterRuntimePath] = args;
const observedApiImports = censusPath === undefined ? [] : await readObservedApiImports(censusPath);
const adapterRuntimeExports =
  adapterRuntimePath === undefined
    ? undefined
    : Object.keys(await import(pathToFileURL(path.resolve(adapterRuntimePath)).href));
const report = buildDeclarationCompatibilityReport({
  adapterDeclarationPath,
  adapterLabel: adapterDeclarationPath,
  adapterRuntimeExports,
  observedApiImports,
  raycastDeclarationPath,
  raycastLabel: raycastDeclarationPath,
});

await writeFile(path.resolve(outputPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");

async function readObservedApiImports(filePath) {
  const parsed = JSON.parse(await readFile(path.resolve(filePath), "utf8"));
  if (typeof parsed !== "object" || parsed === null || !Array.isArray(parsed.apiUsage)) {
    throw new Error(`The census report does not contain an apiUsage array: ${filePath}`);
  }
  return parsed.apiUsage.map((entry) => entry.api).filter((api) => typeof api === "string");
}
