// Offline tests for the dependency smoke report logic: install-failure
// classification, the extra outcomes, failure grouping and the rendered
// reports. Fixture data only; the real run needs the network.
import { expect, test } from "bun:test";
import {
  buildDepsReport,
  classifyInstallFailure,
  failureSignature,
  installErrorExcerpt,
  installFailedResult,
  needsPreferencesResult,
  renderDepsJsonReport,
  renderDepsMarkdownReport,
  requiredPreferences,
  toDepsResult,
  topFailures,
  type DepsResult,
  type InstallRecord,
} from "./smoke-deps.ts";
import type { CommandResult } from "./smoke.ts";

test("install failures are classified from npm output", () => {
  expect(classifyInstallFailure("npm error code ERESOLVE\nnpm error peer dep missing")).toBe(
    "peer",
  );
  expect(classifyInstallFailure("npm warn EBADENGINE Unsupported engine")).toBe("engine");
  expect(classifyInstallFailure("npm error code ENOTFOUND registry.npmjs.org")).toBe("network");
  expect(classifyInstallFailure("npm error code EUSAGE\nnpm error `npm ci` can only install")).toBe(
    "lockfile",
  );
  expect(classifyInstallFailure("npm error code E404\nnpm error 404 Not Found")).toBe("registry");
  expect(classifyInstallFailure("npm error something odd")).toBe("other");
});

test("a timeout or the disk guard wins over what npm printed", () => {
  expect(classifyInstallFailure("npm error code ERESOLVE", { timedOut: true })).toBe("timeout");
  expect(classifyInstallFailure("", { overBudget: true, timedOut: true })).toBe("disk-budget");
});

test("an install error excerpt keeps the last npm error lines", () => {
  const log = [
    "npm warn deprecated x",
    "npm error one",
    "npm error two",
    "npm error three",
    "npm error four",
  ].join("\n");
  expect(installErrorExcerpt(log)).toBe("two | three | four");
  expect(installErrorExcerpt("plain text\nmore")).toBe("plain text | more");
});

test("required preferences are those without a default value", () => {
  const manifest = {
    preferences: [
      { name: "token", required: true },
      { name: "region", required: true, default: "eu" },
      { name: "optional", required: false },
    ],
    commands: [{ name: "run", preferences: [{ name: "key", required: true }] }, { name: "other" }],
  };
  expect(requiredPreferences(manifest, "run")).toEqual(["key", "token"]);
  expect(requiredPreferences(manifest, "other")).toEqual(["token"]);
});

test("smoke results are relabelled with the deps outcome names", () => {
  const base: CommandResult = {
    extension: "a",
    command: "b",
    mode: "view",
    outcome: "missing-arguments",
  };
  expect(toDepsResult(base).outcome).toBe("needs-arguments");
  expect(toDepsResult({ ...base, outcome: "rendered" }).outcome).toBe("rendered");
});

test("install-failed and needs-preferences results carry their reason", () => {
  const base = { extension: "a", command: "b", mode: "view" };
  expect(installFailedResult(base, { reason: "peer", error: "boom" })).toMatchObject({
    outcome: "install-failed",
    installReason: "peer",
    error: "boom",
  });
  expect(needsPreferencesResult({ ...base, names: ["token"] })).toMatchObject({
    outcome: "needs-preferences",
    reason: expect.stringContaining("token"),
  });
});

const result = (extension: string, command: string, fields: Partial<DepsResult>): DepsResult => ({
  extension,
  command,
  mode: "view",
  outcome: "rendered",
  ...fields,
});

const install = (extension: string, fields: Partial<InstallRecord> = {}): InstallRecord => ({
  extension,
  packages: ["got"],
  status: "installed",
  ms: 1500,
  bytes: 2 * 1024 * 1024,
  ...fields,
});

test("failures group by outcome and signature, most commands first", () => {
  const groups = topFailures([
    result("a", "one", { outcome: "bundle-failed", missing: ["got"] }),
    result("b", "one", { outcome: "bundle-failed", missing: ["got"] }),
    result("b", "two", { outcome: "bundle-failed", missing: ["got"] }),
    result("c", "one", { outcome: "unsupported-api", path: "Foo.bar" }),
    result("d", "one", { outcome: "install-failed", installReason: "peer" }),
    result("e", "one", { outcome: "rendered", nodes: 3, rootType: "List" }),
    result("e", "two", { outcome: "needs-arguments", reason: "requires launch arguments: q" }),
  ]);
  expect(groups.map((group) => [group.signature, group.commands, group.extensions])).toEqual([
    ["missing got", 3, ["a", "b"]],
    ["install failed: peer", 1, ["d"]],
    ["unsupported API Foo.bar", 1, ["c"]],
  ]);
  expect(groups[1]!.hint).toContain("peer");
});

test("failure signatures are stable across extensions", () => {
  expect(failureSignature(result("a", "x", { outcome: "timeout" }))).toBe(
    "no scene before the timeout",
  );
  expect(
    failureSignature(result("a", "x", { outcome: "capability-denied", path: "applications.open" })),
  ).toBe("capability denied applications.open");
});

test("the report totals every outcome and sorts its rows", () => {
  const report = buildDepsReport({
    commit: "c".repeat(40),
    installs: [install("b"), install("a", { status: "failed", reason: "lockfile", error: "x" })],
    results: [
      result("b", "z", { nodes: 2, rootType: "List" }),
      result("a", "y", { outcome: "install-failed", installReason: "lockfile", error: "x" }),
      result("b", "a", { outcome: "needs-preferences", reason: "requires preferences: t" }),
    ],
    peakBytes: 100 * 1024 * 1024,
    wallMs: 61_000,
  });
  expect(report.totals).toMatchObject({ rendered: 1, "install-failed": 1, "needs-preferences": 1 });
  expect(report.installs.map((entry) => entry.extension)).toEqual(["a", "b"]);
  expect(report.results.map((entry) => `${entry.extension}/${entry.command}`)).toEqual([
    "a/y",
    "b/a",
    "b/z",
  ]);
});

test("the markdown report lists installs, top failures and commands deterministically", () => {
  const report = buildDepsReport({
    commit: "c".repeat(40),
    installs: [
      install("b"),
      install("a", { status: "failed", reason: "lockfile", error: "bad | lock" }),
    ],
    results: [
      result("b", "z", { nodes: 2, rootType: "List" }),
      result("a", "y", {
        outcome: "install-failed",
        installReason: "lockfile",
        error: "bad | lock",
      }),
    ],
    peakBytes: 100 * 1024 * 1024,
    wallMs: 61_000,
  });
  const markdown = renderDepsMarkdownReport(report);
  expect(markdown).toBe(renderDepsMarkdownReport(report));
  expect(markdown).toContain("1/2 installs succeeded. 2 commands:");
  expect(markdown).toContain("Peak .cache 100.0 MB, wall time 61 s.");
  expect(markdown).toContain("| `a` | `got` | failed (lockfile) | 1.5 s | 2.0 MB | bad \\| lock |");
  expect(markdown).toContain("## Top failures");
  expect(markdown).toContain("| 1 | install-failed | install failed: lockfile | `a` |");
  expect(markdown).toContain("| `b/z` | view | rendered | — | — | 2 nodes, root List |");
  expect(JSON.parse(renderDepsJsonReport(report)).totals.rendered).toBe(1);
});

test("installed dependency reports preserve bundle timing and bundle-timeout outcomes", () => {
  const timedOut = toDepsResult({
    extension: "ext",
    command: "index",
    mode: "view",
    outcome: "bundle-timeout",
    bundleMs: 11.8,
    reason: "bundling exceeded 10 ms",
  });
  const report = buildDepsReport({
    commit: "pinned",
    installs: [],
    results: [timedOut],
    peakBytes: 0,
    wallMs: 12,
  });
  expect(report.totals["bundle-timeout"]).toBe(1);
  expect(renderDepsJsonReport(report)).toContain('"bundleMs": 11.8');
  expect(renderDepsMarkdownReport(report)).toContain(
    "| bundle-timeout | 12 | — | bundling exceeded 10 ms |",
  );
});

test("deps reports retain placeholder inputs alongside the observed outcome and bundle time", () => {
  const observed = toDepsResult({
    extension: "ext",
    command: "run",
    mode: "view",
    outcome: "rendered",
    nodes: 1,
    rootType: "List",
    bundleMs: 8,
    placeholders: "preferences",
  });
  const report = buildDepsReport({
    commit: "pin",
    installs: [],
    results: [observed],
    peakBytes: 0,
    wallMs: 0,
  });
  expect(JSON.parse(renderDepsJsonReport(report)).results[0].placeholders).toBe("preferences");
  expect(renderDepsMarkdownReport(report)).toContain("| rendered | 8 | preferences | 1 nodes");
  expect(renderDepsMarkdownReport(report)).toContain(
    "1 ran with placeholder inputs (arguments 0, preferences 1, both 0)",
  );
  expect(renderDepsMarkdownReport(report)).not.toContain("bundled but not run");
});
