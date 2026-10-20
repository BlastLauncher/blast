import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CAPABILITIES } from "@blastlauncher/protocol";

// Only wire names look like `family.action`; a few capabilities (`trash`) have
// a single segment. Literals in params never reach this check because only the
// first argument is scanned.
const CAPABILITY_NAME = /^[a-z][a-z0-9]*(?:\.[a-zA-Z][a-zA-Z0-9]*)*$/;
const MARKER = "requestCapability(";

/** The source between `start` and the first top-level comma or closing paren. */
function firstArgument(source: string, start: number): string {
  let depth = 0;
  let quote: string | undefined;
  for (let index = start; index < source.length; index++) {
    const char = source[index];
    if (quote) {
      if (char === "\\") index++;
      else if (char === quote) quote = undefined;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") quote = char;
    else if (char === "(" || char === "[" || char === "{") depth++;
    else if (char === ")" || char === "]" || char === "}") {
      if (depth === 0) return source.slice(start, index);
      depth--;
    } else if (char === "," && depth === 0) return source.slice(start, index);
  }
  return source.slice(start);
}

/**
 * Reads one source file and returns every capability string in a
 * `requestCapability(...)` call's first argument. Scanning only that argument
 * keeps ternaries such as `url ? "open.url" : "open.path"` visible while
 * ignoring params.
 */
function capabilityNames(source: string): string[] {
  const names: string[] = [];
  let at = source.indexOf(MARKER);
  while (at !== -1) {
    const start = at + MARKER.length;
    for (const match of firstArgument(source, start).matchAll(/"([^"\n]+)"/g)) {
      const name = match[1]!;
      if (CAPABILITY_NAME.test(name)) names.push(name);
    }
    at = source.indexOf(MARKER, start);
  }
  return names;
}

function scanRuntimeApi(): { names: string[]; files: string[] } {
  const files = readdirSync(import.meta.dir)
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
    .toSorted();
  const names: string[] = [];
  for (const file of files) {
    names.push(...capabilityNames(readFileSync(join(import.meta.dir, file), "utf8")));
  }
  return { names, files };
}

test("the catalog covers exactly the capability names the runtime requests", () => {
  const { names, files } = scanRuntimeApi();
  expect(files.length).toBeGreaterThan(0);
  const requested = [...new Set(names)].toSorted();
  const catalog = Object.keys(CAPABILITIES).toSorted();
  const missing = requested.filter((name) => !Object.hasOwn(CAPABILITIES, name));
  const extra = catalog.filter((name) => !requested.includes(name));
  // Report the offending names, not just two long arrays.
  expect({ missing, extra }).toEqual({ missing: [], extra: [] });
  expect(requested).toEqual(catalog);
});
