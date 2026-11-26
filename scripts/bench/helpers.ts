import { createElement as h } from "../../packages/tui/src/testing.ts";
import { createController, type ControllerView } from "../../packages/client-core/src/index.ts";
import {
  createScenePatchApplier,
  encodeMessage,
  type SceneMessage,
  type ScenePatchMessage,
} from "../../packages/protocol/src/index.ts";
import { createSceneRoot } from "../../packages/runtime/src/reconciler/index.ts";

export type BenchArgs = {
  samples: number;
  outPath?: string;
};

export type SampleStats = {
  count: number;
  min: number;
  median: number;
  p95: number;
  max: number;
  mean: number;
};

export type LargeListWireRow = {
  items: number;
  update: "one-item-prop" | "search-filter" | "selection-move";
  label: string;
  matchingItems: number;
  runtimeFullBytes: number;
  runtimePatchBytes: number;
  runtimePatchOps: number;
  embedderViewBytes: number;
  embedderSceneBytes: number;
};

export type BenchEnvironment = {
  platform: string;
  arch: string;
  osRelease: string;
  cpuModel: string;
  cpuCount: number;
  nodeVersion: string;
  bunVersion: string;
  gitSha: string;
  timestamp: string;
};

export type BenchReport = {
  version: 1;
  samples: number;
  environment: BenchEnvironment;
  hostLaunch: {
    coldEmptyDataDirMs: SampleStats;
    cachedNoPoolMs: SampleStats;
    warmPoolPrimedMs: SampleStats;
  };
  wire: {
    query: string;
    rows: LargeListWireRow[];
  };
  tui: {
    popupColdRootMs: SampleStats;
    popupColdCommandMs: SampleStats;
    popupWarmRootMs: SampleStats;
    popupWarmCommandMs: SampleStats;
    helloListFirstFrameMs: SampleStats;
    listKeyLatencyMs: SampleStats;
  };
};

const DEFAULT_SAMPLES = 5;
const FILTER_QUERY = "42";

function parsePositiveInteger(raw: string, flag: string): number {
  if (!/^[1-9]\d*$/.test(raw)) {
    throw new Error(`${flag} must be a positive integer, got ${JSON.stringify(raw)}`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${flag} must be a positive integer, got ${JSON.stringify(raw)}`);
  }
  return value;
}

export function parseBenchArgs(argv: readonly string[]): BenchArgs {
  let samples = DEFAULT_SAMPLES;
  let outPath: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--samples") {
      const next = argv[++i];
      if (next === undefined) throw new Error("--samples requires a value");
      samples = parsePositiveInteger(next, "--samples");
    } else if (arg.startsWith("--samples=")) {
      samples = parsePositiveInteger(arg.slice("--samples=".length), "--samples");
    } else if (arg === "--out") {
      const next = argv[++i];
      if (!next) throw new Error("--out requires a path");
      outPath = next;
    } else if (arg.startsWith("--out=")) {
      const value = arg.slice("--out=".length);
      if (!value) throw new Error("--out requires a path");
      outPath = value;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return outPath === undefined ? { samples } : { samples, outPath };
}

/**
 * Computes summary statistics for non-empty finite timing samples.
 * `median` averages the two center elements for even counts; `p95` uses the
 * nearest-rank 95th percentile (`ceil(0.95 * n) - 1`).
 */
export function summarizeSamples(values: readonly number[]): SampleStats {
  if (values.length === 0) throw new RangeError("Cannot summarize empty sample list");
  for (let i = 0; i < values.length; i++) {
    if (!Number.isFinite(values[i])) {
      throw new RangeError(`Sample at index ${i} is not finite: ${values[i]}`);
    }
  }
  const sorted = values.toSorted((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const median = n % 2 === 1 ? sorted[(n - 1) >> 1]! : (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2;
  const p95Index = Math.min(n - 1, Math.ceil(0.95 * n) - 1);
  return {
    count: n,
    min: sorted[0]!,
    median,
    p95: sorted[p95Index]!,
    max: sorted[n - 1]!,
    mean: sum / n,
  };
}

type SyntheticItem = {
  id: string;
  title: string;
  subtitle: string;
  tag: string;
};

const noop = () => {};

function buildSyntheticList(items: readonly SyntheticItem[], searchText: string) {
  return h(
    "Navigation",
    null,
    h(
      "Navigation.Entry",
      { key: "root", active: true },
      h(
        "List",
        { navigationTitle: "Benchmark List", searchText },
        ...items.map((item) =>
          h(
            "List.Item",
            {
              key: item.id,
              id: item.id,
              title: item.title,
              subtitle: item.subtitle,
              accessories: [{ text: item.tag }],
            },
            h(
              "Slot",
              { name: "actions" },
              h("ActionPanel", null, h("Action", { title: "Open", onAction: noop })),
            ),
          ),
        ),
      ),
    ),
  );
}

function embedderEventBytes(eventName: string, payload: Record<string, unknown>): number {
  return Buffer.byteLength(
    `${JSON.stringify({ type: "event", event: eventName, session: "1", ...payload })}\n`,
    "utf8",
  );
}

function wireBytes(message: SceneMessage | ScenePatchMessage): number {
  return Buffer.byteLength(encodeMessage(message), "utf8");
}

function scenesEqual(a: SceneMessage, b: SceneMessage): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Measures runtime -> host NDJSON bytes (`scene` vs `scene.patch`) and
 * `blast serve` embedder NDJSON bytes (`session.view` + `session.scene`)
 * for large synthetic `List` updates.
 */
export function measureLargeListWire(
  itemCounts: readonly number[] = [1_000, 10_000],
  query = FILTER_QUERY,
): LargeListWireRow[] {
  const rows: LargeListWireRow[] = [];

  for (const count of itemCounts) {
    const baseItems: SyntheticItem[] = Array.from({ length: count }, (_, index) => ({
      id: `item-${index}`,
      title: `Item ${index}`,
      subtitle: `Category ${index % 10}`,
      tag: `tag-${index % 5}`,
    }));

    const fullScenes: SceneMessage[] = [];
    const patches: ScenePatchMessage[] = [];
    const patchedScenes: SceneMessage[] = [];
    const views: ControllerView[] = [];
    const applier = createScenePatchApplier();

    const fullRoot = createSceneRoot({
      publish: (scene) => {
        fullScenes.push({ type: "scene", ...scene });
      },
    });
    const patchRoot = createSceneRoot({
      publish: (scene) => {
        patchedScenes.push(applier.reset({ type: "scene", ...scene }));
      },
      publishPatch: (patch) => {
        const message: ScenePatchMessage = { type: "scene.patch", ...patch };
        patches.push(message);
        patchedScenes.push(applier.apply(message));
      },
    });

    const controller = createController({ platform: "macOS" });
    const stopViews = controller.subscribe((view) => {
      views.push(view);
    });

    try {
      // Initial render (establishes base revision 1).
      const initialTree = buildSyntheticList(baseItems, "");
      fullRoot.render(initialTree);
      patchRoot.render(initialTree);
      const initialFull = fullScenes.at(-1);
      const initialPatched = patchedScenes.at(-1);
      if (!initialFull || !initialPatched || !scenesEqual(initialFull, initialPatched)) {
        throw new Error(`Initial scene mismatch for ${count} items`);
      }
      controller.scene(initialFull);

      // Update 1: one-item prop change (pin/rename item 0).
      const editedItems = baseItems.slice();
      editedItems[0] = {
        ...baseItems[0]!,
        title: "Item 0 (pinned)",
        tag: "pinned",
      };
      const patchCountBeforeEdit = patches.length;
      const viewCountBeforeEdit = views.length;
      const editedTree = buildSyntheticList(editedItems, "");
      fullRoot.render(editedTree);
      patchRoot.render(editedTree);
      const editFull = fullScenes.at(-1);
      const editPatch = patches.length > patchCountBeforeEdit ? patches.at(-1) : undefined;
      const editPatched = patchedScenes.at(-1);
      if (!editFull || !editPatch || !editPatched) {
        throw new Error(`Missing one-item update output for ${count} items`);
      }
      if (!scenesEqual(editFull, editPatched)) {
        throw new Error(`Patched scene mismatch after one-item edit for ${count} items`);
      }
      controller.scene(editFull);
      const editView = views.length > viewCountBeforeEdit ? views.at(-1) : undefined;
      if (!editView) {
        throw new Error(`Controller did not emit a view after one-item edit for ${count} items`);
      }
      rows.push({
        items: count,
        update: "one-item-prop",
        label: "one-item prop change",
        matchingItems: count,
        runtimeFullBytes: wireBytes(editFull),
        runtimePatchBytes: wireBytes(editPatch),
        runtimePatchOps: editPatch.ops.length,
        embedderViewBytes: embedderEventBytes("session.view", { view: editView }),
        embedderSceneBytes: embedderEventBytes("session.scene", { scene: editFull }),
      });

      // Embedder-only update: selection move down on the full list (no runtime wire traffic).
      const viewCountBeforeMove = views.length;
      controller.input({ type: "move", direction: "down" });
      const moveView = views.length > viewCountBeforeMove ? views.at(-1) : undefined;
      if (!moveView) {
        throw new Error(`Controller did not emit a view after selection move for ${count} items`);
      }
      rows.push({
        items: count,
        update: "selection-move",
        label: "selection move (down)",
        matchingItems: count,
        runtimeFullBytes: 0,
        runtimePatchBytes: 0,
        runtimePatchOps: 0,
        embedderViewBytes: embedderEventBytes("session.view", { view: moveView }),
        embedderSceneBytes: 0,
      });

      // Update 2: search filter narrowing the full list by `query`.
      const filteredItems = editedItems.filter((item) => item.title.includes(query));
      const patchCountBeforeFilter = patches.length;
      const viewCountBeforeFilter = views.length;
      const filteredTree = buildSyntheticList(filteredItems, query);
      fullRoot.render(filteredTree);
      patchRoot.render(filteredTree);
      const filterFull = fullScenes.at(-1);
      const filterPatch = patches.length > patchCountBeforeFilter ? patches.at(-1) : undefined;
      const filterPatched = patchedScenes.at(-1);
      if (!filterFull || !filterPatch || !filterPatched) {
        throw new Error(`Missing search filter output for ${count} items`);
      }
      if (!scenesEqual(filterFull, filterPatched)) {
        throw new Error(`Patched scene mismatch after search filter for ${count} items`);
      }
      controller.scene(filterFull);
      const filterView = views.length > viewCountBeforeFilter ? views.at(-1) : undefined;
      if (!filterView) {
        throw new Error(`Controller did not emit a view after search filter for ${count} items`);
      }
      rows.push({
        items: count,
        update: "search-filter",
        label: `search filter (${filteredItems.length} hits)`,
        matchingItems: filteredItems.length,
        runtimeFullBytes: wireBytes(filterFull),
        runtimePatchBytes: wireBytes(filterPatch),
        runtimePatchOps: filterPatch.ops.length,
        embedderViewBytes: embedderEventBytes("session.view", { view: filterView }),
        embedderSceneBytes: embedderEventBytes("session.scene", { scene: filterFull }),
      });
    } finally {
      stopViews();
      fullRoot.unmount();
      patchRoot.unmount();
    }
  }

  return rows;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

export function formatMs(ms: number): string {
  if (ms < 10) return `${ms.toFixed(2)} ms`;
  if (ms < 100) return `${ms.toFixed(1)} ms`;
  return `${ms.toFixed(0)} ms`;
}

export function formatReduction(fullBytes: number, patchBytes: number): string {
  if (fullBytes <= 0) return "—";
  const pct = (1 - patchBytes / fullBytes) * 100;
  const pctText = patchBytes > 0 && pct >= 99.95 ? "99.99" : pct.toFixed(1);
  const ratio = fullBytes / Math.max(1, patchBytes);
  return `-${pctText}% (${ratio.toFixed(1)}x)`;
}

export function formatTable(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
  alignRight: readonly boolean[] = [],
): string {
  const widths = headers.map((header, col) =>
    Math.max(header.length, ...rows.map((row) => (row[col] ?? "").length)),
  );
  const pad = (value: string, col: number) =>
    alignRight[col] ? value.padStart(widths[col]!) : value.padEnd(widths[col]!);
  const renderRow = (cells: readonly string[]) =>
    cells.map((cell, col) => pad(cell, col)).join("  ");
  const separator = widths.map((width) => "-".repeat(width)).join("  ");
  return [renderRow(headers), separator, ...rows.map(renderRow)].join("\n");
}

function statsRow(label: string, stats: SampleStats): string[] {
  return [
    label,
    formatMs(stats.median),
    formatMs(stats.p95),
    `${formatMs(stats.min)}–${formatMs(stats.max)}`,
    String(stats.count),
  ];
}

export function formatBenchReport(report: BenchReport): string {
  const { environment: env, hostLaunch, wire, tui } = report;
  const sections: string[] = [
    `Blast benchmark (${env.platform}/${env.arch}, ${env.cpuModel} x${env.cpuCount}, Node ${env.nodeVersion}, Bun ${env.bunVersion}, samples=${report.samples})`,
  ];

  sections.push(
    "",
    "1. Host engine launch (fixtures/extensions/hello-list -> first scene)",
    formatTable(
      ["Scenario", "Median", "p95", "Range", "N"],
      [
        statsRow("cold (empty dataDir, no pool)", hostLaunch.coldEmptyDataDirMs),
        statsRow("cached (no standby child)", hostLaunch.cachedNoPoolMs),
        statsRow("warm (pool primed)", hostLaunch.warmPoolPrimedMs),
      ],
      [false, true, true, true, true],
    ),
  );

  const runtimeWireRows = wire.rows.filter((row) => row.update !== "selection-move");
  sections.push(
    "",
    `2. Runtime -> host wire bytes (large list, filter="${wire.query}")`,
    formatTable(
      ["Items", "Update", "Full scene", "scene.patch", "Savings"],
      runtimeWireRows.map((row) => [
        row.items.toLocaleString("en-US"),
        row.label,
        formatBytes(row.runtimeFullBytes),
        formatBytes(row.runtimePatchBytes),
        formatReduction(row.runtimeFullBytes, row.runtimePatchBytes),
      ]),
      [true, false, true, true, true],
    ),
  );

  sections.push(
    "",
    `3. blast serve embedder wire bytes (whole views, filter="${wire.query}")`,
    formatTable(
      ["Items", "Update", "session.view", "session.scene", "Total (views on)"],
      wire.rows.map((row) => [
        row.items.toLocaleString("en-US"),
        row.label,
        formatBytes(row.embedderViewBytes),
        row.embedderSceneBytes > 0 ? formatBytes(row.embedderSceneBytes) : "—",
        formatBytes(row.embedderViewBytes + row.embedderSceneBytes),
      ]),
      [true, false, true, true, true],
    ),
  );

  sections.push(
    "",
    "4. TUI (scripts/tui-benchmark.ts, OpenTUI test renderer)",
    formatTable(
      ["Metric", "Median", "p95", "Range", "N"],
      [
        statsRow("popup cold -> root", tui.popupColdRootMs),
        statsRow("popup cold -> hello-list", tui.popupColdCommandMs),
        statsRow("popup warm -> root", tui.popupWarmRootMs),
        statsRow("popup warm -> hello-list", tui.popupWarmCommandMs),
        statsRow("direct hello-list first frame", tui.helloListFirstFrameMs),
        statsRow("10,000-item keystroke latency", tui.listKeyLatencyMs),
      ],
      [false, true, true, true, true],
    ),
  );

  return sections.join("\n");
}
