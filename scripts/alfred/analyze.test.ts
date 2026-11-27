import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  writeWorkflow,
  writeWorkflowArchive,
} from "../../packages/alfred/src/workflow-test-helper.ts";
import { analyzeWorkflowDirectory, formatAnalysis, type CorpusAnalysis } from "./analyze.ts";

// Synthetic workflows only: the corpus itself is never committed.
let scratch = "";
let corpus = "";
let analysis: CorpusAnalysis;

beforeAll(async () => {
  scratch = await mkdtemp(join(tmpdir(), "blast-alfred-analyze-"));
  corpus = join(scratch, "corpus");
  // Fully supported, unpacked; the hotkey is a passive trigger.
  await writeWorkflow(
    join(corpus, "supported"),
    [
      ["kw", "input.keyword", { keyword: "go" }],
      ["hot", "trigger.hotkey"],
      ["run", "action.script"],
      ["clip", "output.clipboard"],
    ],
    [
      ["kw", "run"],
      ["hot", "run"],
      ["run", "clip"],
    ],
    { name: "Supported" },
  );
  // Fully supported, archived; its staging folder sits outside the corpus.
  await writeWorkflow(
    join(scratch, "staging"),
    [
      ["sf", "input.scriptfilter", { keyword: "sf" }],
      ["lf", "input.listfilter", { keyword: "lf", items: "[]" }],
    ],
    [],
    { name: "Archived" },
  );
  await mkdir(join(corpus, "downloads"));
  await writeWorkflowArchive(
    join(scratch, "staging"),
    join(corpus, "downloads", "a.alfredworkflow"),
  );
  // Runnable but with unsupported nodes, nested deeper; a workflow folder is not descended.
  await writeWorkflow(
    join(corpus, "nested", "deeper", "partial"),
    [
      ["kw", "input.keyword", { keyword: "p" }],
      ["term", "action.terminalcommand"],
      ["task", "automation.task"],
      ["task2", "automation.task"],
    ],
    [["kw", "task"]],
    { name: "Partial" },
  );
  await writeWorkflow(join(corpus, "nested", "deeper", "partial", "inner"), [
    ["kw", "input.keyword", { keyword: "hidden" }],
  ]);
  // Parses, but only Alfred can fire its trigger.
  await writeWorkflow(
    join(corpus, "hotkey-only"),
    [
      ["hot", "trigger.hotkey"],
      ["run", "action.script"],
    ],
    [["hot", "run"]],
    { name: "Hotkey only" },
  );
  // Broken inputs.
  await writeFile(join(corpus, "corrupt.alfredworkflow"), "this is not a zip archive");
  await mkdir(join(corpus, "bad-plist"));
  await writeFile(join(corpus, "bad-plist", "info.plist"), "<plist><dict><key>");
  analysis = await analyzeWorkflowDirectory(corpus);
});

afterAll(async () => {
  await rm(scratch, { recursive: true, force: true });
});

describe("analyzeWorkflowDirectory", () => {
  test("finds unpacked and archived workflows recursively, in a stable order", () => {
    expect(analysis.results.map((result) => [result.path, result.kind])).toEqual([
      ["bad-plist", "directory"],
      ["corrupt.alfredworkflow", "archive"],
      ["downloads/a.alfredworkflow", "archive"],
      ["hotkey-only", "directory"],
      ["nested/deeper/partial", "directory"],
      ["supported", "directory"],
    ]);
  });

  test("classifies each workflow", () => {
    const byPath = Object.fromEntries(analysis.results.map((result) => [result.path, result]));
    expect(byPath.supported).toMatchObject({
      ok: true,
      name: "Supported",
      commands: 1,
      objects: { total: 4, supported: 3, passive: 1, unsupported: 0 },
      fullySupported: true,
    });
    expect(byPath["downloads/a.alfredworkflow"]).toMatchObject({
      ok: true,
      name: "Archived",
      commands: 2,
      objects: { total: 2, supported: 2, passive: 0, unsupported: 0 },
      fullySupported: true,
    });
    expect(byPath["nested/deeper/partial"]).toMatchObject({
      ok: true,
      commands: 1,
      objects: { total: 4, supported: 1, passive: 0, unsupported: 3 },
      unsupportedTypes: [
        "alfred.workflow.action.terminalcommand",
        "alfred.workflow.automation.task",
        "alfred.workflow.automation.task",
      ],
      fullySupported: false,
    });
    expect(byPath["hotkey-only"]).toMatchObject({ ok: true, commands: 0, fullySupported: false });
    expect(byPath["corrupt.alfredworkflow"]!.ok).toBe(false);
    expect(byPath["corrupt.alfredworkflow"]!.error).toMatch(/zip/i);
    expect(byPath["bad-plist"]!.ok).toBe(false);
    expect(byPath["bad-plist"]!.error).toBeTruthy();
  });

  test("totals objects and coverage across the corpus", () => {
    expect(analysis).toMatchObject({
      workflows: 6,
      parsed: 4,
      runnable: 3,
      fullySupported: 2,
      objects: { total: 12, supported: 7, passive: 2, unsupported: 3 },
      // 7 supported of 10 executable objects; passive triggers are excluded.
      coverage: 70,
      topUnsupported: [
        { type: "alfred.workflow.automation.task", count: 2 },
        { type: "alfred.workflow.action.terminalcommand", count: 1 },
      ],
    });
  });

  test("formats a readable summary", () => {
    const text = formatAnalysis(analysis, 1);
    expect(text).toContain("Workflows:            6");
    expect(text).toContain("Fully supported:      2 (33%)");
    expect(text).toContain("Execution coverage:   70%");
    expect(text).toContain("    2  alfred.workflow.automation.task");
    expect(text).not.toContain("alfred.workflow.action.terminalcommand");
    expect(text).toContain("corrupt.alfredworkflow:");
  });

  test("an empty directory reports no coverage rather than a fake number", async () => {
    const empty = join(scratch, "empty");
    await mkdir(empty);
    const result = await analyzeWorkflowDirectory(empty);
    expect(result).toMatchObject({ workflows: 0, coverage: null, results: [] });
    expect(formatAnalysis(result)).toContain("Execution coverage:   n/a");
  });
});
