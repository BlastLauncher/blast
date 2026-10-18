// Offline tests for the smoke report logic. The real run (`smoke-run.ts`)
// bundles and spawns runtimes and needs the network, so `bun test` covers only
// the pure classification, preference and rendering rules here.
import { expect, test } from "bun:test";
import {
  buildReport,
  buildResult,
  compactLine,
  compactLines,
  commandMode,
  countNodes,
  extractPreferenceDefaults,
  manifestCommands,
  renderJsonReport,
  renderMarkdownReport,
  sanitizePath,
  type CommandResult,
  type Manifest,
} from "./smoke.ts";

function result(probe: Parameters<typeof buildResult>[0]["probe"], mode = "view"): CommandResult {
  return buildResult({ extension: "ext", command: "index", mode, probe });
}

const MANIFEST: Manifest = {
  preferences: [
    { name: "alpha", type: "textfield", default: "extension" },
    { name: "empty", type: "textfield" },
    { name: "shared", type: "textfield", default: "extension" },
  ],
  commands: [
    { name: "zeta", mode: "view", preferences: [{ name: "shared", default: "command" }] },
    { name: "alpha", mode: "no-view" },
  ],
};

test("countNodes walks the whole scene tree", () => {
  expect(countNodes({ children: [] })).toBe(1);
  expect(countNodes({ children: [{ children: [] }, { children: [{ children: [] }] }] })).toBe(4);
});

test("preference defaults come from the manifest, command level overriding", () => {
  expect(extractPreferenceDefaults(MANIFEST, "zeta")).toEqual({
    alpha: "extension",
    shared: "command",
  });
  expect(extractPreferenceDefaults(MANIFEST, "alpha")).toEqual({
    alpha: "extension",
    shared: "extension",
  });
  expect(extractPreferenceDefaults(MANIFEST, "missing")).toEqual({
    alpha: "extension",
    shared: "extension",
  });
  // Preferences without a declared default stay unset; keys are sorted.
  expect(Object.keys(extractPreferenceDefaults(MANIFEST, "zeta"))).toEqual(["alpha", "shared"]);
});

test("manifest command and mode lookups", () => {
  expect(manifestCommands(MANIFEST)).toEqual(["alpha", "zeta"]);
  expect(commandMode(MANIFEST, "alpha")).toBe("no-view");
  expect(commandMode(MANIFEST, "zeta")).toBe("view");
  expect(commandMode(MANIFEST, "missing")).toBeUndefined();
});

test("a first scene renders with node count and root type", () => {
  expect(result({ kind: "scene", nodeCount: 7, rootType: "List" })).toMatchObject({
    outcome: "rendered",
    nodes: 7,
    rootType: "List",
  });
});

test("bundle failures separate missing dependencies from other errors", () => {
  expect(result({ kind: "bundle-failed", missing: ["a", "b"] })).toMatchObject({
    outcome: "bundle-failed",
    missing: ["a", "b"],
  });
  expect(result({ kind: "bundle-failed", error: "esbuild exploded" })).toMatchObject({
    outcome: "bundle-failed",
    error: "esbuild exploded",
  });
  expect(result({ kind: "bundle-failed", error: "esbuild exploded" }).missing).toBeUndefined();
});

test("timeouts and pre-checked unsupported modes keep their reason", () => {
  expect(result({ kind: "timeout", timeoutMs: 5000 })).toMatchObject({
    outcome: "timeout",
    reason: "no scene or exit within 5000 ms",
  });
  expect(
    result(
      { kind: "unsupported-mode", reason: 'command mode "menu-bar" is not supported' },
      "menu-bar",
    ),
  ).toMatchObject({
    outcome: "unsupported-mode",
    reason: 'command mode "menu-bar" is not supported',
  });
});

test("crashes record the exit and the last error log lines", () => {
  const crashed = buildResult({
    extension: "ext",
    command: "index",
    mode: "view",
    probe: {
      kind: "exit",
      code: 3,
      signal: null,
      error: { message: "ReferenceError: x is not defined" },
    },
    errorLogs: ["e1", "e2", "e3", "e4"],
  });
  expect(crashed).toMatchObject({
    outcome: "crashed",
    exit: "code 3",
    error: "ReferenceError: x is not defined",
    logs: ["e2", "e3", "e4"],
  });
  expect(result({ kind: "exit", code: null, signal: "SIGKILL" })).toMatchObject({
    outcome: "crashed",
    exit: "signal SIGKILL",
  });
});

test("a runtime UNSUPPORTED error means the mode is unsupported", () => {
  expect(
    result({
      kind: "exit",
      code: 1,
      signal: null,
      error: { message: 'Command mode "menu-bar" is not supported', code: "UNSUPPORTED" },
    }),
  ).toMatchObject({
    outcome: "unsupported-mode",
    reason: 'Command mode "menu-bar" is not supported',
  });
});

test("a clean exit without a scene is unsupported for no-view, a crash for view", () => {
  expect(result({ kind: "exit", code: 0, signal: null }, "no-view")).toMatchObject({
    outcome: "unsupported-mode",
    reason: 'command mode "no-view" completed without rendering a scene',
  });
  expect(result({ kind: "exit", code: 0, signal: null }, "view")).toMatchObject({
    outcome: "crashed",
    reason: "exited without publishing a scene",
  });
});

test("warnings attach to outcomes that ran a session", () => {
  const warnings = ["Dropped non-serializable prop Item.badge"];
  expect(
    buildResult({
      extension: "ext",
      command: "index",
      mode: "view",
      probe: { kind: "scene", nodeCount: 1, rootType: "List" },
      warnings,
    }).warnings,
  ).toEqual(warnings);
  expect(result({ kind: "bundle-failed", error: "no session" }).warnings).toBeUndefined();
});

test("sanitizePath replaces the longest prefix first and keeps the rest", () => {
  const replacements: Array<[string, string]> = [
    ["/repo", "<repo>"],
    ["/repo/.cache/x", "<cache>"],
  ];
  expect(sanitizePath("at /repo/.cache/x/y.ts failed", replacements)).toBe(
    "at <cache>/y.ts failed",
  );
  expect(sanitizePath("at /repo/src/a.ts failed", replacements)).toBe("at <repo>/src/a.ts failed");
  expect(sanitizePath("no paths here", replacements)).toBe("no paths here");
});

test("compactLine flattens whitespace and truncates deterministically", () => {
  expect(compactLine("  a\n\n b\tc  ")).toBe("a b c");
  expect(compactLine("x".repeat(200))).toHaveLength(160);
  expect(compactLine("x".repeat(200)).endsWith("…")).toBe(true);
});

test("compactLines keeps only the last lines and drops empty input", () => {
  expect(compactLines([])).toBeUndefined();
  expect(compactLines(["a"])).toEqual(["a"]);
  expect(compactLines(["a", "b", "c", "d"])).toEqual(["b", "c", "d"]);
});

test("buildReport sorts results and extension failures and totals outcomes", () => {
  const report = buildReport(
    "3b812d1e",
    [
      buildResult({
        extension: "b",
        command: "index",
        mode: "view",
        probe: { kind: "scene", nodeCount: 1, rootType: "List" },
      }),
      buildResult({
        extension: "a",
        command: "z",
        mode: "view",
        probe: { kind: "timeout", timeoutMs: 5000 },
      }),
      buildResult({
        extension: "a",
        command: "a",
        mode: "view",
        probe: { kind: "timeout", timeoutMs: 5000 },
      }),
    ],
    [{ extension: "c", error: "manifest missing" }],
  );
  expect(report.results.map((item) => `${item.extension}/${item.command}`)).toEqual([
    "a/a",
    "a/z",
    "b/index",
  ]);
  expect(report.extensionFailures.map((failure) => failure.extension)).toEqual(["c"]);
  expect(report.totals).toEqual({
    rendered: 1,
    "bundle-failed": 0,
    crashed: 0,
    timeout: 2,
    "unsupported-mode": 0,
    "unsupported-api": 0,
  });
});

test("the JSON report is deterministic and contains no absolute paths", () => {
  const report = buildReport("3b812d1e", [
    buildResult({
      extension: "ext",
      command: "index",
      mode: "view",
      probe: {
        kind: "exit",
        code: 1,
        signal: null,
        error: { message: "cannot read <repo>/ext/src/index.tsx" },
      },
      errorLogs: [" boom at <tmp>/blast/builds/command-x/index.mjs "],
      warnings: ["Dropped non-serializable prop Item.badge"],
    }),
  ]);
  const first = renderJsonReport(report);
  expect(renderJsonReport(report)).toBe(first);
  expect(first).not.toMatch(/\/home\/|\$HOME|\/tmp\//);
  expect(first).toContain("<repo>/ext/src/index.tsx");
  expect(first).toContain(`"commit": "3b812d1e"`);
  expect(first.endsWith("}\n")).toBe(true);
});

test("the markdown report renders a sorted table, totals and failure details", () => {
  const report = buildReport("3b812d1e", [
    buildResult({
      extension: "zeta",
      command: "index",
      mode: "view",
      probe: { kind: "scene", nodeCount: 12, rootType: "List" },
      warnings: [
        "Dropped non-serializable prop Item.badge",
        "Dropped non-serializable prop Item.badge",
      ],
    }),
    buildResult({
      extension: "alpha",
      command: "index",
      mode: "view",
      probe: { kind: "bundle-failed", missing: ["left-pad", "right-pad"] },
    }),
    buildResult({
      extension: "mid",
      command: "index",
      mode: "no-view",
      probe: { kind: "exit", code: 0, signal: null },
    }),
  ]);
  const markdown = renderMarkdownReport(report);
  expect(renderMarkdownReport(report)).toBe(markdown);
  const rows = markdown.split("\n").filter((line) => line.startsWith("| `"));
  expect(rows.map((row) => (row.split("|")[1] ?? "").trim())).toEqual([
    "`alpha/index`",
    "`mid/index`",
    "`zeta/index`",
  ]);
  expect(markdown).toContain(
    "3 commands: rendered 1, bundle-failed 1, crashed 0, timeout 0, unsupported-mode 1",
  );
  expect(markdown).toContain("missing left-pad, right-pad");
  expect(markdown).toContain('command mode "no-view" completed without rendering a scene');
  expect(markdown).toContain("12 nodes, root List; 2 warning(s)");
});

test("UNSUPPORTED_API is classified with its path in JSON and markdown", () => {
  const missing = result({
    kind: "exit",
    code: 1,
    signal: null,
    error: { code: "UNSUPPORTED_API", message: "Unsupported API in Blast: Action.OpenInBrowser" },
  });
  expect(missing).toMatchObject({ outcome: "unsupported-api", path: "Action.OpenInBrowser" });
  const report = buildReport("pinned", [missing]);
  expect(report.totals["unsupported-api"]).toBe(1);
  expect(renderJsonReport(report)).toContain('"path": "Action.OpenInBrowser"');
  expect(renderMarkdownReport(report)).toContain("| unsupported-api | Action.OpenInBrowser |");
});
