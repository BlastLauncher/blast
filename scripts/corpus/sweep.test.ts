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
import { classifyPrimaryAction, type CommandResult } from "./smoke.ts";

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
    probeActions: false,
  });
  expect(parseSweepArgs(["--probe-actions"]).probeActions).toBe(true);
  const names = ["zeta", "alpha", "beta", "alpha"];
  expect(selectExtensions(names, 3, "seed")).toEqual(
    selectExtensions(names.toReversed(), 3, "seed"),
  );
  expect(selectExtensions(names, 2, "seed")).toHaveLength(2);
});

test("primary action probe classifications are deterministic", () => {
  expect(classifyPrimaryAction({ primary: false, events: 0 })).toEqual({
    outcome: "no-items-or-content",
  });
  expect(classifyPrimaryAction({ primary: false, events: 0, hasContent: true })).toEqual({
    outcome: "items-but-no-primary-action",
  });
  expect(classifyPrimaryAction({ primary: true, events: 0, panelOpened: true })).toEqual({
    outcome: "navigated",
  });
  expect(classifyPrimaryAction({ primary: true, events: 1, navigated: true })).toEqual({
    outcome: "navigated",
  });
  expect(classifyPrimaryAction({ primary: true, events: 1, sceneChanged: true })).toEqual({
    outcome: "scene-changed",
  });
  expect(classifyPrimaryAction({ primary: true, events: 1, stillLoading: true })).toEqual({
    outcome: "still-loading",
  });
  expect(classifyPrimaryAction({ primary: true, events: 1, capability: "clipboard.copy" })).toEqual(
    {
      outcome: "capability-requested",
      capability: "clipboard.copy",
      error: "Capability denied: clipboard.copy",
    },
  );
  expect(classifyPrimaryAction({ primary: true, events: 0 })).toEqual({ outcome: "no-op" });
  expect(
    classifyPrimaryAction({ primary: true, events: 1, exit: { code: 0, signal: null } }),
  ).toEqual({ outcome: "no-op" });
  expect(
    classifyPrimaryAction({
      primary: true,
      events: 1,
      exit: { code: 1, signal: null, error: "boom" },
    }),
  ).toEqual({ outcome: "crashed", error: "boom" });
  expect(
    classifyPrimaryAction({
      primary: true,
      events: 1,
      sceneChanged: true,
      exit: { code: 0, signal: null },
    }),
  ).toEqual({ outcome: "scene-changed" });
  expect(classifyPrimaryAction({ primary: true, events: 1, timedOut: true })).toEqual({
    outcome: "timeout",
  });
  expect(
    classifyPrimaryAction({
      primary: true,
      events: 1,
      exit: { code: 1, signal: null, error: "EPERM: operation not permitted" },
    }),
  ).toEqual({ outcome: "sandbox-denied", error: "EPERM: operation not permitted" });
});

test("resumed sweep markdown warns and omits whole-run metrics", () => {
  const report = buildSweepReport({
    commit: "pin",
    seed: "0",
    selectedExtensions: 1,
    results: [],
    peakBytes: 123,
    wallMs: 60_000,
    resumed: 1,
    fullPopulation: 10,
  });
  const markdown = renderSweepMarkdown(report);
  expect(markdown).toContain("This is a resumed run:");
  expect(markdown.split("\n")[3]).toBe("1 resumed command(s).");
  expect(markdown.split("\n")[3]).not.toContain("Peak .cache");
  expect(markdown.split("\n")[3]).not.toContain("wall time");
  expect(markdown.split("\n")[3]).not.toContain("commands/min");
  expect(markdown).not.toContain("Projected full population");
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

test("report text redacts action fields too", () => {
  const report = buildSweepReport({
    commit: "pin",
    seed: "0",
    selectedExtensions: 1,
    probeActions: true,
    results: [
      {
        ...result("a", "rendered"),
        action: {
          outcome: "crashed",
          dispatched: true,
          reason: "/Users/alice/.config/blast/token",
          error: "sk-live_1234567890 abcdefabcdefabcdefabcdefabcdefabcdef",
        },
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

test("primary action report compares crashes and ranks action causes", () => {
  const report = buildSweepReport({
    commit: "pin",
    seed: "0",
    selectedExtensions: 1,
    probeActions: true,
    results: [
      {
        ...result("a", "rendered"),
        action: { outcome: "scene-changed", dispatched: true, elapsedMs: 20 },
      },
      {
        ...result("b", "rendered"),
        action: { outcome: "crashed", dispatched: true, error: "boom", elapsedMs: 30 },
      },
      {
        ...result("c", "rendered"),
        action: {
          outcome: "capability-requested",
          dispatched: true,
          capability: "open.url",
          elapsedMs: 10,
        },
      },
      { ...result("d", "crashed") },
    ],
    peakBytes: 1,
    wallMs: 1,
  });
  expect(report.primaryActionProbe).toMatchObject({
    commands: 3,
    actionCrashRate: 1 / 3,
    renderOnlyCrashRate: 1 / 4,
    renderOnlyCrashNumerator: 1,
    renderOnlyCrashDenominator: 4,
    actionCrashNumerator: 1,
    actionCrashDenominator: 3,
    probeRuntimeMsPerDispatchedCommand: 20,
  });
  expect(report.primaryActionProbe?.crashCauses).toEqual([{ signature: "boom", commands: 1 }]);
  expect(renderSweepMarkdown(report)).toContain("Primary action probe");
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
