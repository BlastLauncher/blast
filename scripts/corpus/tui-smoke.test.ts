// Offline tests for the TUI smoke report logic. The real run
// (`tui-smoke-run.ts`) renders the App in OpenTUI's test renderer and needs
// the network, so `bun test` covers only the pure classification, excerpt,
// console-error and rendering rules here.
import { expect, test } from "bun:test";
import {
  FRAME_OUTCOMES,
  TUI_OUTCOMES,
  buildTuiReport,
  buildTuiResult,
  consoleError,
  frameExcerpt,
  frameLines,
  isFailure,
  normalizeFrame,
  placeholderTypes,
  renderTuiJson,
  renderTuiMarkdown,
  type FrameProbe,
  type TuiResult,
} from "./tui-smoke.ts";

const padded = [
  " Blast                                                     ",
  " Search…                                                   ",
  " › apple                                                   ",
  "",
  "   banana                                                  ",
  "",
].join("\n");

function frameProbe(fields: Partial<FrameProbe> = {}): FrameProbe {
  return { kind: "frame", frame: padded, ...fields };
}

function result(probe: Parameters<typeof buildTuiResult>[0]["probe"], mode = "view"): TuiResult {
  return buildTuiResult({ extension: "ext", command: "index", mode, probe });
}

test("placeholderTypes collects the node types the TUI could not render", () => {
  expect(placeholderTypes("no placeholders here")).toEqual([]);
  expect(placeholderTypes("[Unsupported: List.ItemAccessory]")).toEqual(["List.ItemAccessory"]);
  expect(
    placeholderTypes(
      [
        " [Unsupported: Grid.ItemAccessory]",
        " [Unsupported: Form.TextField]",
        " [Unsupported: Form.TextField]",
      ].join("\n"),
    ),
  ).toEqual(["Form.TextField", "Grid.ItemAccessory"]);
});

test("frameLines and frameExcerpt ignore padding and blank lines", () => {
  expect(frameLines(padded)).toEqual([" Blast", " Search…", " › apple", "   banana"]);
  expect(normalizeFrame("a  \n\n b \n")).toBe("a\n b");
  expect(frameExcerpt(padded)).toEqual(["Blast", "Search…", "› apple"]);
  expect(frameExcerpt(padded).length).toBeLessThanOrEqual(3);
  expect(frameExcerpt("x".repeat(200))).toEqual([`${"x".repeat(159)}…`]);
  expect(frameExcerpt("  \n \n")).toEqual([]);
});

test("consoleError takes a TUI error and ignores the run's own noise", () => {
  const error = new Error("Cannot read properties of undefined");
  // React reports an error its boundary caught as `console.error(error, info)`.
  expect(consoleError([error, { componentStack: "at App" }])).toBe(error.message);
  // OpenTUI's key handler catches a throwing listener and labels it.
  expect(consoleError(["[KeyHandler] Error processing parsed key:", error])).toBe(error.message);
  // Act warnings and renderer chatter carry no Error, or nothing the TUI threw.
  expect(consoleError(["An update to %s inside a test was not wrapped in act(...)", "App"])).toBe(
    undefined,
  );
  expect(consoleError(["stdin parser timeout flush failed", error])).toBe(undefined);
  expect(consoleError([])).toBe(undefined);
});

test("a frame with text renders, with the scene's node count", () => {
  const rendered = result(frameProbe({ nodes: 12, rootType: "List" }));
  expect(rendered).toMatchObject({ outcome: "rendered", nodes: 12, rootType: "List" });
  // The report keeps no excerpt for a rendered command.
  expect(rendered.frame).toBeUndefined();
  expect(isFailure(rendered)).toBe(false);
});

test("a frame with the unknown-node placeholder is a placeholder, types recorded", () => {
  const placeholder = result(
    frameProbe({
      frame: " Blast\n › apple\n [Unsupported: List.ItemAccessory]\n [Unsupported: Form.TextField]",
      nodes: 4,
      rootType: "List",
    }),
  );
  expect(placeholder).toMatchObject({
    outcome: "placeholder",
    placeholders: ["Form.TextField", "List.ItemAccessory"],
  });
  expect(placeholder.frame).toEqual(["Blast", "› apple", "[Unsupported: List.ItemAccessory]"]);
  expect(isFailure(placeholder)).toBe(true);
});

test("a scene whose frame has no text is empty", () => {
  const empty = result(frameProbe({ frame: "   \n  \n" }));
  expect(empty).toMatchObject({
    outcome: "empty",
    reason: "the scene arrived but the frame has no text",
  });
  expect(empty.frame).toEqual([]);
});

test("a thrown exception is a client error, excerpted from the last frame", () => {
  const failed = result(
    frameProbe({
      frame: " Blast\n [Unsupported: List.ItemAccessory]",
      lastFrame: " TypeError: x is not defined\n     at view.ts:33",
      error: "x is not defined",
    }),
  );
  expect(failed).toMatchObject({ outcome: "client-error", error: "x is not defined" });
  expect(failed.frame).toEqual(["TypeError: x is not defined", "at view.ts:33"]);
});

test("a command that never produced a frame is reported as the headless smoke reports it", () => {
  expect(
    result({
      kind: "missing-arguments",
      names: ["entryName"],
    }),
  ).toMatchObject({
    outcome: "missing-arguments",
    reason: "requires launch arguments: entryName; not run",
  });
  expect(result({ kind: "exit", code: 0, signal: null }, "no-view")).toMatchObject({
    outcome: "completed",
    reason: 'command mode "no-view" completed without rendering a scene',
  });
  expect(
    result({
      kind: "exit",
      code: 1,
      signal: null,
      error: { code: "RUNTIME_ERROR", message: "Capability denied: clipboard.copy" },
    }),
  ).toMatchObject({ outcome: "capability-denied", path: "clipboard.copy" });
  expect(
    result({
      kind: "exit",
      code: 1,
      signal: null,
      error: { code: "UNSUPPORTED_API", message: "Unsupported API in Blast: Action.Push" },
    }),
  ).toMatchObject({ outcome: "unsupported-api", path: "Action.Push" });
  expect(result({ kind: "timeout", timeoutMs: 5000 })).toMatchObject({
    outcome: "timeout",
    reason: "no scene or exit within 5000 ms",
  });
  expect(result({ kind: "bundle-failed", missing: ["left-pad"] })).toMatchObject({
    outcome: "bundle-failed",
    missing: ["left-pad"],
  });
});

test("warnings attach to results and count in the detail column", () => {
  const warned = buildTuiResult({
    extension: "ext",
    command: "index",
    mode: "view",
    probe: frameProbe({ nodes: 1, rootType: "List" }),
    warnings: ["Dropped non-serializable prop Item.badge"],
  });
  expect(warned.warnings).toEqual(["Dropped non-serializable prop Item.badge"]);
  const report = buildTuiReport("3b812d1e", [warned], 100, 30);
  expect(renderTuiMarkdown(report)).toContain("1 nodes, root List; 1 warning(s)");
});

test("the report totals every outcome and sorts the table by command", () => {
  const report = buildTuiReport(
    "3b812d1e153a1862df29bc8ec34e170c728512ea",
    [
      buildTuiResult({
        extension: "b",
        command: "index",
        mode: "view",
        probe: frameProbe({ nodes: 3, rootType: "List" }),
      }),
      buildTuiResult({
        extension: "a",
        command: "z",
        mode: "menu-bar",
        probe: frameProbe({ frame: " [Unsupported: MenuBarExtra.Submenu]" }),
      }),
      buildTuiResult({
        extension: "a",
        command: "a",
        mode: "no-view",
        probe: { kind: "exit", code: 0, signal: null },
      }),
      buildTuiResult({
        extension: "c",
        command: "index",
        mode: "view",
        probe: { kind: "timeout", timeoutMs: 5000 },
      }),
    ],
    100,
    30,
    [{ extension: "d", error: "manifest missing from the checkout" }],
  );
  expect(report.width).toBe(100);
  expect(report.height).toBe(30);
  expect(report.totals).toEqual({
    rendered: 1,
    placeholder: 1,
    "client-error": 0,
    empty: 0,
    completed: 1,
    "capability-denied": 0,
    "bundle-failed": 0,
    crashed: 0,
    network: 0,
    timeout: 1,
    "unsupported-mode": 0,
    "unsupported-api": 0,
    "missing-arguments": 0,
  });
  expect(TUI_OUTCOMES).toHaveLength(Object.keys(report.totals).length);
  expect(report.results.map((item) => `${item.extension}/${item.command}`)).toEqual([
    "a/a",
    "a/z",
    "b/index",
    "c/index",
  ]);
  expect(report.extensionFailures).toEqual([
    { extension: "d", error: "manifest missing from the checkout" },
  ]);
});

test("the markdown report starts with totals, then the table, then the failures", () => {
  const report = buildTuiReport(
    "3b812d1e",
    [
      buildTuiResult({
        extension: "zeta",
        command: "index",
        mode: "view",
        probe: frameProbe({ nodes: 12, rootType: "List" }),
      }),
      buildTuiResult({
        extension: "alpha",
        command: "index",
        mode: "view",
        probe: frameProbe({ frame: " Blast\n [Unsupported: List.ItemAccessory]" }),
      }),
      buildTuiResult({
        extension: "mid",
        command: "index",
        mode: "no-view",
        probe: { kind: "exit", code: 0, signal: null },
      }),
    ],
    100,
    30,
  );
  const markdown = renderTuiMarkdown(report);
  expect(renderTuiMarkdown(report)).toBe(markdown);
  expect(markdown.startsWith("# TUI corpus smoke report\n")).toBe(true);
  // The header states the fixed size the frames were captured at, and the
  // totals come before the table.
  expect(markdown.slice(0, markdown.indexOf("| Command |"))).toContain("100×30");
  const totals = markdown.split("\n").find((line) => line.endsWith("missing-arguments 0."));
  expect(totals).toBe(
    "3 commands: rendered 1, placeholder 1, client-error 0, empty 0, completed 1, capability-denied 0, bundle-failed 0, crashed 0, network 0, timeout 0, unsupported-mode 0, unsupported-api 0, missing-arguments 0.",
  );
  expect(markdown.indexOf(totals!)).toBeLessThan(markdown.indexOf("| Command |"));
  const rows = markdown.split("\n").filter((line) => line.startsWith("| `"));
  expect(rows.map((row) => (row.split("|")[1] ?? "").trim())).toEqual([
    "`alpha/index`",
    "`mid/index`",
    "`zeta/index`",
  ]);
  expect(markdown).toContain(
    "| `alpha/index` | view | placeholder | node types: List.ItemAccessory |",
  );
  expect(markdown).toContain("| `zeta/index` | view | rendered | 12 nodes, root List |");
  // Every non-rendered command is listed, with its frame lines.
  expect(markdown).toContain("- `alpha/index` (placeholder): node types: List.ItemAccessory");
  expect(markdown).toContain("  - frame: [Unsupported: List.ItemAccessory]");
  expect(markdown).toContain('- `mid/index` (completed): command mode "no-view" completed');
  expect(markdown).not.toContain("- `zeta/index` (rendered)");
});

test("the JSON report is deterministic and free of machine paths", () => {
  const report = buildTuiReport(
    "3b812d1e",
    [
      buildTuiResult({
        extension: "ext",
        command: "index",
        mode: "view",
        probe: frameProbe({
          lastFrame: " Error: boom\n  at <repo>/ext/src/index.tsx:1",
          error: "boom",
        }),
      }),
    ],
    100,
    30,
  );
  const json = renderTuiJson(report);
  expect(renderTuiJson(report)).toBe(json);
  expect(json).not.toMatch(/\/home\/|\$HOME|\/tmp\//);
  expect(json).toContain('"outcome": "client-error"');
  expect(json).toContain('"width": 100');
  expect(json.endsWith("}\n")).toBe(true);
});

test("every frame outcome is listed once in the headline order", () => {
  expect(FRAME_OUTCOMES[0]).toBe("rendered");
  expect(new Set(TUI_OUTCOMES).size).toBe(TUI_OUTCOMES.length);
});
