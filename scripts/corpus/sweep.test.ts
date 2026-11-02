import { expect, test } from "bun:test";
import {
  buildSweepReport,
  parseSweepArgs,
  parseSweepLog,
  renderSweepJson,
  renderSweepMarkdown,
  selectExtensions,
  selectSatisfiedExtensions,
} from "./sweep.ts";
import type { CommandResult } from "./smoke.ts";

const result = (
  extension: string,
  outcome: CommandResult["outcome"],
  path?: string,
): CommandResult => ({
  extension,
  command: "index",
  mode: "view",
  outcome,
  ...(path === undefined ? {} : { path }),
});

test("sweep arguments and selection are deterministic", () => {
  expect(parseSweepArgs(["--limit=3", "--seed", "weekly", "--jobs", "2", "--resume"])).toEqual({
    limit: 3,
    seed: "weekly",
    jobs: 2,
    resume: true,
    unsandboxed: false,
  });
  const names = ["zeta", "alpha", "beta", "alpha"];
  expect(selectExtensions(names, 3, "seed")).toEqual(
    selectExtensions(names.toReversed(), 3, "seed"),
  );
  expect(selectExtensions(names, 2, "seed")).toHaveLength(2);
});

test("selection is limited to the exact satisfied population", () => {
  expect(
    selectSatisfiedExtensions(["ok", "unsatisfied", "also-ok"], ["ok", "also-ok"], undefined, "0"),
  ).toEqual([
    ...selectSatisfiedExtensions(
      ["also-ok", "unsatisfied", "ok"],
      ["ok", "also-ok"],
      undefined,
      "0",
    ),
  ]);
  expect(selectSatisfiedExtensions(["ok", "unsatisfied"], ["ok"], undefined, "0")).not.toContain(
    "unsatisfied",
  );
});

test("report text redacts home paths and token-shaped strings", () => {
  const report = buildSweepReport({
    commit: "pin",
    seed: "0",
    selectedExtensions: 1,
    results: [
      {
        ...result("a", "crashed"),
        error: "/Users/alice/.ssh/id: sk-live_1234567890 abcdefabcdefabcdefabcdefabcdefabcdef",
      },
    ],
    peakBytes: 1,
    wallMs: 1,
  });
  const text = `${renderSweepJson(report)}${renderSweepMarkdown(report)}`;
  expect(text).not.toContain("/Users/alice");
  expect(text).not.toContain("sk-live_");
  expect(text).not.toContain("abcdefabcdefabcdefabcdefabcdefabcdef");
});

test("resume log keeps the latest complete command and ignores a torn line", () => {
  const parsed = parseSweepLog(
    `${JSON.stringify({ extension: "a", command: "index", result: result("a", "rendered") })}\n{"extension":`,
  );
  expect(parsed.get("a\0index")?.result.outcome).toBe("rendered");
  expect(parsed.size).toBe(1);
});

test("report groups normalized failures and capabilities without command rows", () => {
  const report = buildSweepReport({
    commit: "pin",
    seed: "0",
    selectedExtensions: 2,
    results: [
      result("a", "crashed"),
      { ...result("b", "crashed"), error: "/Users/test/tmp/file.ts:42" },
      { ...result("missing", "bundle-failed"), missing: ["zod", "axios"] },
      result("c", "capability-denied", "open.url"),
      result("d", "unsupported-api", "AI.ask"),
    ],
    peakBytes: 10,
    wallMs: 60_000,
    fullPopulation: 1_939,
  });
  expect(report.totals.crashed).toBe(2);
  expect(
    report.failures.some((row) => row.signature.includes("missing dependencies: zod, axios")),
  ).toBe(true);
  expect(report.commandsPerMinute).toBeGreaterThan(0);
  expect(report.capabilities).toEqual([
    { signature: "AI.ask", commands: 1 },
    { signature: "open.url", commands: 1 },
  ]);
  expect(JSON.parse(renderSweepJson(report)).results).toBeUndefined();
  expect(renderSweepMarkdown(report)).toContain("Projected full population");
});

test("reports redact the repository root and per-command scratch names", () => {
  const scratchPath = `${process.cwd()}/.cache/sweep/scratch/unit-abc123/bundle.mjs`;
  const report = buildSweepReport({
    commit: "pin",
    seed: "0",
    selectedExtensions: 1,
    results: [{ ...result("a", "crashed"), error: `Cannot read ${scratchPath}:3` }],
    peakBytes: 1,
    wallMs: 1,
  });
  const text = renderSweepJson(report) + renderSweepMarkdown(report);
  expect(text).not.toContain(process.cwd());
  expect(text).not.toContain("unit-abc123");
  expect(text).toContain("<scratch>/bundle.mjs");
});

// Distinct failure rows of a given width, for the size-limit test.
const rows = (count: number, width: number) =>
  Array.from({ length: count }, (_, index) => ({
    signature: `cause ${String.fromCharCode(97 + (index % 26))} ${"x".repeat(width)} ${index}`,
    commands: 1,
  }));

test("report renderers refuse output over their size limits", () => {
  const base = buildSweepReport({
    commit: "pin",
    seed: "0",
    selectedExtensions: 1,
    results: [],
    peakBytes: 1,
    wallMs: 1,
  });
  expect(() => renderSweepMarkdown({ ...base, failures: rows(400, 10) })).toThrow(
    "exceeds 300 lines",
  );
  expect(() => renderSweepJson({ ...base, failures: rows(2_000, 120) })).toThrow("exceeds 200 KB");
});
