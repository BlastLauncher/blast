// Offline tests for the corpus helpers. The git steps in `fetch.ts` are not
// covered here: `bun test` must never touch the network.
import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildPatterns,
  checkDiskBudget,
  DEFAULT_MAX_MB,
  directoryBytes,
  EXTENSION_NAME,
  isValidExtensionName,
  maxMbFromEnv,
  parseArgs,
  parsePin,
  readPin,
  type CorpusPin,
} from "./corpus.ts";
import { KEPT_CURATED } from "./selection.ts";

const PIN: CorpusPin = {
  repository: "https://github.com/raycast/extensions.git",
  commit: "3b812d1e153a1862df29bc8ec34e170c728512ea",
  curated: ["radix", "biaodian"],
};

test("accepts extension names Raycast would publish", () => {
  for (const name of ["radix", "px-to-rem-converter", "axios-docs", "a", "a1-b2"]) {
    expect(isValidExtensionName(name)).toBe(true);
  }
  // The pattern the task specifies is `^[a-z0-9][a-z0-9-]*$`, which a trailing
  // hyphen does not violate.
  expect(isValidExtensionName("radix-")).toBe(true);
});

test("rejects names that could escape the extensions directory", () => {
  for (const name of ["", "Radix", "-radix", "ra dix", "ra/dix", "../etc", ".hidden", "radix/"]) {
    expect(isValidExtensionName(name)).toBe(false);
    expect(EXTENSION_NAME.test(name)).toBe(false);
  }
});

test("patterns always include every manifest and add requested directories", () => {
  expect(buildPatterns()).toEqual(["/extensions/*/package.json"]);
  expect(buildPatterns(["biaodian", "radix"])).toEqual([
    "/extensions/*/package.json",
    "/extensions/biaodian/",
    "/extensions/radix/",
    "!/extensions/biaodian/node_modules/",
    "!/extensions/radix/node_modules/",
  ]);
});

test("patterns dedupe and sort, and exclusions follow their includes", () => {
  const patterns = buildPatterns(["radix", "biaodian", "radix"]);
  expect(patterns).toEqual([
    "/extensions/*/package.json",
    "/extensions/biaodian/",
    "/extensions/radix/",
    "!/extensions/biaodian/node_modules/",
    "!/extensions/radix/node_modules/",
  ]);
  // Every exclusion must come after every include: the last match decides.
  const firstExclusion = patterns.findIndex((pattern) => pattern.startsWith("!"));
  expect(firstExclusion).toBe(3);
  expect(patterns.slice(firstExclusion).every((pattern) => pattern.startsWith("!"))).toBe(true);
});

test("patterns reject an invalid extension name", () => {
  expect(() => buildPatterns(["../archive"])).toThrow(/--extension/);
});

test("pin validation accepts the committed shape", () => {
  expect(parsePin({ ...PIN })).toEqual(PIN);
});

test("pin validation rejects a bad repository, commit or curated list", () => {
  const cases: Array<[unknown, RegExp]> = [
    [null, /must be a JSON object/],
    [[], /must be a JSON object/],
    [{ ...PIN, repository: "" }, /repository/],
    [{ ...PIN, commit: "3b812d1e" }, /40 lowercase hex/],
    [{ ...PIN, commit: "3B812D1E153A1862DF29BC8EC34E170C728512EA" }, /40 lowercase hex/],
    [{ ...PIN, curated: "radix" }, /list of extension names/],
    [{ ...PIN, curated: [] }, /must not be empty/],
    [{ ...PIN, curated: ["Radix"] }, /must match/],
    [{ ...PIN, curated: ["radix", "radix"] }, /twice/],
  ];
  for (const [value, message] of cases) expect(() => parsePin(value)).toThrow(message);
});

test("readPin loads the pin committed at compat/corpus.json", () => {
  const pin = readPin(process.cwd());
  expect(pin.repository).toBe("https://github.com/raycast/extensions.git");
  expect(pin.commit).toMatch(/^[0-9a-f]{40}$/);
  // Task 0023 grew the curated set and kept the first ten first.
  expect(pin.curated.slice(0, KEPT_CURATED.length)).toEqual(KEPT_CURATED);
  expect(pin.curated.length).toBeGreaterThanOrEqual(40);
  expect(pin.curated).toContain("radix");
  expect(() => readPin("/nonexistent-root")).toThrow(/compat\/corpus\.json: missing/);
});

test("disk budget passes at the limit and aborts above it", () => {
  expect(checkDiskBudget(0, 600)).toBeUndefined();
  expect(checkDiskBudget(600 * 1024 * 1024, 600)).toBeUndefined();
  expect(checkDiskBudget(600 * 1024 * 1024 + 1, 600)).toMatch(
    /600 MB is above BLAST_CORPUS_MAX_MB=600 MB; delete \.cache\/raycast-extensions/,
  );
  expect(checkDiskBudget(700 * 1024 * 1024, 600)).toMatch(/^700 MB is above/);
});

test("the budget comes from BLAST_CORPUS_MAX_MB", () => {
  expect(maxMbFromEnv({})).toBe(DEFAULT_MAX_MB);
  expect(DEFAULT_MAX_MB).toBe(600);
  expect(maxMbFromEnv({ BLAST_CORPUS_MAX_MB: "  " })).toBe(600);
  expect(maxMbFromEnv({ BLAST_CORPUS_MAX_MB: "80" })).toBe(80);
  expect(maxMbFromEnv({ BLAST_CORPUS_MAX_MB: "0.5" })).toBe(0.5);
  for (const raw of ["0", "-1", "lots"]) {
    expect(() => maxMbFromEnv({ BLAST_CORPUS_MAX_MB: raw })).toThrow(/not a positive number/);
  }
});

test("directoryBytes measures nested files and ignores a missing path", () => {
  expect(directoryBytes("/nonexistent-root")).toBe(0);
  const dir = join(mkdtempSync(join(tmpdir(), "corpus-")), "checkout");
  const manifest = "{}";
  const source = "export {};\n";
  mkdirSync(join(dir, "extensions", "radix", "src"), { recursive: true });
  writeFileSync(join(dir, "extensions", "radix", "package.json"), manifest);
  writeFileSync(join(dir, "extensions", "radix", "src", "index.tsx"), source);
  expect(directoryBytes(dir)).toBe(Buffer.byteLength(manifest) + Buffer.byteLength(source));
  rmSync(dir, { recursive: true, force: true });
  expect(directoryBytes(dir)).toBe(0);
});

test("parseArgs reads repeatable extensions and --curated", () => {
  expect(parseArgs([])).toEqual({ extensions: [], curated: false });
  expect(parseArgs(["--curated"])).toEqual({ extensions: [], curated: true });
  expect(parseArgs(["--extension", "radix", "--extension=biaodian", "--curated"])).toEqual({
    extensions: ["radix", "biaodian"],
    curated: true,
  });
  expect(() => parseArgs(["--extension"])).toThrow(/--extension needs an extension name/);
  expect(() => parseArgs(["--extension", "Radix"])).toThrow(/must match/);
  expect(() => parseArgs(["--all"])).toThrow(/unknown argument --all/);
});
