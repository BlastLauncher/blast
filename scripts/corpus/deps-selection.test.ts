// Offline tests for the dependency-heavy selection rules. Fixture manifests
// and sources only: `bun test` must never read the corpus checkout or the network.
import { expect, test } from "bun:test";
import {
  analyzeDepsSources,
  DEPS_COUNT,
  depsEligible,
  depsManifestRejections,
  depsSourceExclusions,
  groupOrder,
  installedDependencies,
  isNativePackage,
  MAX_LOCK_BYTES,
  parseDepsPin,
  primaryPackage,
  renderDepsPin,
  scanOrder,
  selectDeps,
  type DepsCandidate,
  type DepsManifestCandidate,
  type ImportCounts,
} from "./deps-selection.ts";
import { rank } from "./selection.ts";

const COMMANDS = [{ name: "index", mode: "view" }];
const manifest = (dependencies: Record<string, string>, commands = COMMANDS) => ({
  commands,
  dependencies,
});
const counts: ImportCounts = new Map([
  ["rss-parser", 35],
  ["execa", 34],
  ["got", 33],
  ["marked", 10],
]);

test("installedDependencies keeps only registry packages an install would add", () => {
  expect(
    installedDependencies(
      manifest({
        "@raycast/api": "^1",
        "@raycast/utils": "^1",
        react: "^19",
        "react-dom": "^19",
        "@types/node": "^22",
        "node-fetch": "^3",
        got: "^12",
        marked: "^9",
      }),
    ),
  ).toEqual(["marked", "react-dom", "got"].toSorted());
});

test("a manifest needs an unprovided dependency, a lockfile and a view command", () => {
  expect(depsManifestRejections(manifest({ got: "^12" }), true)).toEqual([]);
  expect(depsManifestRejections(manifest({ "node-fetch": "^3" }), true)).toEqual([
    "no unprovided dependency",
  ]);
  expect(depsManifestRejections(manifest({ got: "^12" }), false)).toEqual(["no package-lock.json"]);
  expect(
    depsManifestRejections(manifest({ got: "^12" }, [{ name: "bar", mode: "menu-bar" }]), true),
  ).toEqual(["no view command"]);
});

test("native packages and non-registry specifiers are rejected", () => {
  expect(isNativePackage("sharp")).toBe(true);
  expect(isNativePackage("@napi-rs/canvas")).toBe(true);
  expect(isNativePackage("got")).toBe(false);
  expect(depsManifestRejections(manifest({ got: "^12", sharp: "^0.33" }), true)).toEqual([
    "native packages: sharp",
  ]);
  expect(
    depsManifestRejections(
      manifest({ got: "file:../got", "left-pad": "github:a/b", lodash: "^4" }),
      true,
    ),
  ).toEqual(["non-registry specifiers: got, left-pad"]);
});

test("too many unprovided dependencies are rejected", () => {
  const many = Object.fromEntries(
    ["a", "b", "c", "d", "e", "f", "g"].map((n) => [`pkg-${n}`, "1"]),
  );
  expect(depsManifestRejections(manifest(many), true)).toEqual([
    "more than 6 unprovided dependencies",
  ]);
});

const file = (source: string) => [{ file: "src/index.tsx", source }];

test("source exclusions ignore unprovided imports but keep the offline rules", () => {
  expect(depsSourceExclusions(file(`import got from "got";`))).toEqual([]);
  expect(depsSourceExclusions(file(`import { exec } from "child_process";`))).toEqual([
    "child_process",
  ]);
  expect(depsSourceExclusions(file(`import { runAppleScript } from "run-applescript";`))).toEqual([
    "applescript",
  ]);
});

test("an extension is filed under its most-imported unprovided package", () => {
  expect(primaryPackage(["marked", "got", "rss-parser"], counts)).toBe("rss-parser");
  // Unknown packages count zero and break ties by name.
  expect(primaryPackage(["zeta", "alpha"], counts)).toBe("alpha");
});

function candidate(
  name: string,
  primary: string,
  extra: Partial<DepsCandidate> = {},
): DepsCandidate {
  return {
    name,
    primary,
    dependencies: [primary],
    lockBytes: 1000,
    exclusions: [],
    network: false,
    ...extra,
  };
}

test("groups are ordered by import count, then name", () => {
  const list: DepsManifestCandidate[] = [
    candidate("a", "marked"),
    candidate("b", "got"),
    candidate("c", "zzz"),
    candidate("d", "aaa"),
  ];
  expect(groupOrder(list, counts)).toEqual(["got", "marked", "aaa", "zzz"]);
});

test("scanOrder reads the best-ranked few of each of the top groups", () => {
  const list: DepsManifestCandidate[] = [
    ...["a", "b", "c"].map((n) => candidate(`got-${n}`, "got")),
    ...["a", "b", "c"].map((n) => candidate(`rss-${n}`, "rss-parser")),
    candidate("marked-a", "marked"),
  ];
  const order = scanOrder(list, counts, 2, 2);
  expect(order).toHaveLength(4);
  // rss-parser (35) comes before got (33); marked is beyond the group limit.
  expect(order.slice(0, 2).every((name) => name.startsWith("rss-"))).toBe(true);
  expect(order.slice(2).every((name) => name.startsWith("got-"))).toBe(true);
  const rssRanks = order.slice(0, 2).map(rank);
  expect(rssRanks).toEqual([...rssRanks].toSorted());
});

test("a candidate needs clean sources and a small enough lockfile", () => {
  expect(depsEligible(candidate("ok", "got"))).toBe(true);
  expect(depsEligible(candidate("shell", "got", { exclusions: ["child_process"] }))).toBe(false);
  expect(depsEligible(candidate("big", "got", { lockBytes: MAX_LOCK_BYTES + 1 }))).toBe(false);
  expect(depsEligible(candidate("edge", "got", { lockBytes: MAX_LOCK_BYTES }))).toBe(true);
});

test("analyzeDepsSources records exclusions, network use and the lockfile size", () => {
  const analyzed = analyzeDepsSources(
    { name: "x", primary: "got", dependencies: ["got"] },
    [{ file: "src/index.tsx", source: `import got from "got"; fetch("https://x");` }],
    1234,
  );
  expect(analyzed).toMatchObject({ name: "x", lockBytes: 1234, exclusions: [], network: true });
});

test("selectDeps round-robins over packages, most-imported first", () => {
  const pool = [
    candidate("got-1", "got"),
    candidate("got-2", "got"),
    candidate("rss-1", "rss-parser"),
    candidate("marked-1", "marked"),
  ];
  const { extensions, missing } = selectDeps(pool, counts, 3);
  expect(missing).toBe(0);
  expect(extensions.map((entry) => entry.name)).toEqual(["rss-1", "got-1", "marked-1"]);
  expect(selectDeps(pool, counts, 4).extensions.map((entry) => entry.name)).toEqual([
    "rss-1",
    "got-1",
    "marked-1",
    "got-2",
  ]);
});

test("within a group offline beats network, then fewer dependencies, then rank", () => {
  const pool = [
    candidate("net", "got", { network: true }),
    candidate("heavy", "got", { dependencies: ["got", "a", "b"] }),
    candidate("light", "got"),
  ];
  expect(selectDeps(pool, counts, 3).extensions.map((entry) => entry.name)).toEqual([
    "light",
    "heavy",
    "net",
  ]);
});

test("selection skips ineligible candidates and reports a shortfall", () => {
  const pool = [
    candidate("shell", "got", { exclusions: ["child_process"] }),
    candidate("ok", "rss-parser"),
  ];
  expect(selectDeps(pool, counts, 5)).toEqual({
    extensions: [{ name: "ok", primary: "rss-parser", dependencies: ["rss-parser"] }],
    missing: 4,
  });
});

test("selection is independent of input order", () => {
  const pool = Array.from({ length: 12 }, (_, index) =>
    candidate(`ext-${index}`, index % 3 === 0 ? "got" : index % 3 === 1 ? "marked" : "execa"),
  );
  const forward = selectDeps(pool, counts, 8);
  const backward = selectDeps(pool.toReversed(), counts, 8);
  expect(backward).toEqual(forward);
  expect(DEPS_COUNT).toBe(25);
});

test("the committed pin renders and parses back", () => {
  const selection = selectDeps([candidate("a", "got"), candidate("b", "marked")], counts, 2);
  const text = renderDepsPin(
    { repository: "https://example.com/x.git", commit: "a".repeat(40) },
    selection,
    {
      manifestEligible: 10,
      scanned: 2,
      eligible: 2,
    },
  );
  expect(parseDepsPin(JSON.parse(text)).extensions.map((entry) => entry.name)).toEqual(["a", "b"]);
});

test("parseDepsPin rejects malformed pins with a fixable message", () => {
  const good = {
    repository: "https://example.com/x.git",
    commit: "a".repeat(40),
    extensions: [{ name: "a", primary: "got", dependencies: ["got"] }],
  };
  expect(() => parseDepsPin([])).toThrow("must be a JSON object");
  expect(() => parseDepsPin({ ...good, commit: "abc" })).toThrow("40 lowercase hex");
  expect(() => parseDepsPin({ ...good, extensions: [] })).toThrow("non-empty list");
  expect(() => parseDepsPin({ ...good, extensions: [{ name: "A" }] })).toThrow("extensions[0]");
  expect(() =>
    parseDepsPin({ ...good, extensions: [good.extensions[0], good.extensions[0]] }),
  ).toThrow("a listed twice");
});
