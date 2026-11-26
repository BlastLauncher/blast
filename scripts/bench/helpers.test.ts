import { describe, expect, test } from "bun:test";
import {
  formatBenchReport,
  formatBytes,
  formatMs,
  formatReduction,
  formatTable,
  measureLargeListWire,
  parseBenchArgs,
  summarizeSamples,
  type BenchReport,
} from "./helpers.ts";

describe("parseBenchArgs", () => {
  test("uses default samples when no flags are given", () => {
    expect(parseBenchArgs([])).toEqual({ samples: 5 });
  });

  test("parses --samples and --out in both forms", () => {
    expect(parseBenchArgs(["--samples", "3"])).toEqual({ samples: 3 });
    expect(parseBenchArgs(["--samples=12", "--out=.cache/bench/custom.json"])).toEqual({
      samples: 12,
      outPath: ".cache/bench/custom.json",
    });
    expect(parseBenchArgs(["--out", "out.json", "--samples", "2"])).toEqual({
      samples: 2,
      outPath: "out.json",
    });
  });

  test("rejects invalid counts and unknown flags", () => {
    expect(() => parseBenchArgs(["--samples", "0"])).toThrow("positive integer");
    expect(() => parseBenchArgs(["--samples=-1"])).toThrow("positive integer");
    expect(() => parseBenchArgs(["--samples", "3.5"])).toThrow("positive integer");
    expect(() => parseBenchArgs(["--samples"])).toThrow("requires a value");
    expect(() => parseBenchArgs(["--out"])).toThrow("requires a path");
    expect(() => parseBenchArgs(["--nope"])).toThrow("Unknown option");
  });
});

describe("summarizeSamples", () => {
  test("computes min, median, p95, max and mean without mutating input", () => {
    const input = [40, 10, 50, 20, 30];
    const stats = summarizeSamples(input);
    expect(input).toEqual([40, 10, 50, 20, 30]);
    expect(stats).toEqual({
      count: 5,
      min: 10,
      median: 30,
      p95: 50,
      max: 50,
      mean: 30,
    });
  });

  test("handles even counts, single samples and 20-sample p95", () => {
    expect(summarizeSamples([10, 20, 30, 40])).toEqual({
      count: 4,
      min: 10,
      median: 25,
      p95: 40,
      max: 40,
      mean: 25,
    });
    expect(summarizeSamples([7])).toEqual({
      count: 1,
      min: 7,
      median: 7,
      p95: 7,
      max: 7,
      mean: 7,
    });
    const twenty = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(summarizeSamples(twenty).p95).toBe(19);
    expect(summarizeSamples(twenty).median).toBe(10.5);
  });

  test("rejects empty or non-finite inputs", () => {
    expect(() => summarizeSamples([])).toThrow(RangeError);
    expect(() => summarizeSamples([1, Number.NaN])).toThrow(RangeError);
    expect(() => summarizeSamples([Number.POSITIVE_INFINITY])).toThrow(RangeError);
  });
});

describe("measureLargeListWire", () => {
  test("deterministically measures full scene vs scene.patch and embedder views", () => {
    const first = measureLargeListWire([100, 1_000]);
    const second = measureLargeListWire([100, 1_000]);
    expect(first).toEqual(second);
    expect(first).toHaveLength(6);

    const prop1k = first.find((row) => row.items === 1_000 && row.update === "one-item-prop")!;
    expect(prop1k.runtimePatchOps).toBe(1);
    expect(prop1k.runtimePatchBytes).toBeLessThan(500);
    expect(prop1k.runtimeFullBytes).toBeGreaterThan(200_000);
    expect(prop1k.embedderViewBytes).toBeGreaterThan(100_000);
    expect(prop1k.embedderSceneBytes).toBeGreaterThan(prop1k.runtimeFullBytes);

    const move1k = first.find((row) => row.items === 1_000 && row.update === "selection-move")!;
    expect(move1k.runtimeFullBytes).toBe(0);
    expect(move1k.runtimePatchBytes).toBe(0);
    expect(move1k.embedderSceneBytes).toBe(0);
    // Selection move still re-serializes all 1,000 rows in `session.view`.
    expect(move1k.embedderViewBytes).toBeGreaterThan(100_000);

    const filter1k = first.find((row) => row.items === 1_000 && row.update === "search-filter")!;
    expect(filter1k.matchingItems).toBe(20);
    expect(filter1k.runtimePatchBytes).toBeLessThan(filter1k.runtimeFullBytes / 5);
    expect(filter1k.embedderViewBytes).toBeLessThan(prop1k.embedderViewBytes / 10);
  });
});

describe("formatting", () => {
  test("formats bytes, durations, reductions and aligned tables", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KiB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.00 MiB");
    expect(formatMs(1.234)).toBe("1.23 ms");
    expect(formatMs(42.56)).toBe("42.6 ms");
    expect(formatMs(123.4)).toBe("123 ms");
    expect(formatReduction(1000, 10)).toBe("-99.0% (100.0x)");
    expect(formatReduction(3_836_954, 193)).toBe("-99.99% (19880.6x)");
    expect(formatReduction(0, 0)).toBe("—");

    const table = formatTable(
      ["Name", "Value"],
      [
        ["alpha", "10"],
        ["beta-long", "2000"],
      ],
      [false, true],
    );
    expect(table).toBe(
      ["Name       Value", "---------  -----", "alpha         10", "beta-long   2000"].join("\n"),
    );
  });

  test("formats a full benchmark report with all four groups", () => {
    const stat = summarizeSamples([10, 20, 30]);
    const report: BenchReport = {
      version: 1,
      samples: 3,
      environment: {
        platform: "darwin",
        arch: "arm64",
        osRelease: "24.0.0",
        cpuModel: "Test CPU",
        cpuCount: 8,
        nodeVersion: "v24.20.0",
        bunVersion: "1.4.4",
        gitSha: "abc1234",
        timestamp: "2026-11-26T00:00:00.000Z",
      },
      hostLaunch: {
        coldEmptyDataDirMs: stat,
        cachedNoPoolMs: stat,
        warmPoolPrimedMs: stat,
      },
      wire: {
        query: "42",
        rows: measureLargeListWire([100]),
      },
      tui: {
        popupColdRootMs: stat,
        popupColdCommandMs: stat,
        popupWarmRootMs: stat,
        popupWarmCommandMs: stat,
        helloListFirstFrameMs: stat,
        listKeyLatencyMs: stat,
      },
    };
    const text = formatBenchReport(report);
    expect(text).toContain("1. Host engine launch");
    expect(text).toContain("2. Runtime -> host wire bytes");
    expect(text).toContain("3. blast serve embedder wire bytes");
    expect(text).toContain("4. TUI (scripts/tui-benchmark.ts");
    expect(text).toContain("selection move (down)");
  });
});
