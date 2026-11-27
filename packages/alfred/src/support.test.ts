import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { AUTOMATION_TASKS } from "./automation-tasks.ts";
import { executeWorkflowGraph, type GraphHost } from "./graph.ts";
import { KEYWORD } from "./manifest.ts";
import type { PlistValue } from "./plist.ts";
import {
  AUTOMATION_TASK,
  classifyAlfredObject,
  PASSIVE_TRIGGER_TYPES,
  SUPPORTED_AUTOMATION_TASKS,
  SUPPORTED_OBJECT_TYPES,
} from "./support.ts";
import { parseWorkflow } from "./workflow.ts";

const host: GraphHost = {
  request: async () => null,
  runScript: async () => ({ stdout: "", exitCode: 0 }),
  openView: () => {},
  showNotification: () => {},
  showLargeType: () => {},
  showDialog: async () => undefined,
  hideAlfred: () => {},
  // Stubs, so no real afplay, say or shortcuts process ever starts here.
  playSound: () => {},
  speak: () => {},
  runShortcut: async () => "",
};

/** The graph's warnings when a keyword hands `type`, with an empty config, its input. */
async function visit(type: string, config: Record<string, PlistValue> = {}): Promise<string[]> {
  const workflow = parseWorkflow({
    bundleid: "com.example.support",
    name: "Support",
    objects: [
      { uid: "kw", type: KEYWORD, config: { keyword: "kw" } },
      { uid: "node", type, config },
    ],
    connections: { kw: [{ destinationuid: "node", modifiers: 0 }] },
  });
  const result = await executeWorkflowGraph({
    workflow,
    host,
    start: "kw",
    input: "",
    // Nothing here may write outside a scratch location.
    homeDir: tmpdir(),
    supportPath: tmpdir(),
  });
  return result.warnings;
}

// Only the node under test counts: an empty Call External Trigger, say, jumps elsewhere.
const unsupported = (warnings: string[]) =>
  warnings.some((w) => /\(node\)( task \S+)? is not supported/.test(w));

describe("SUPPORTED_OBJECT_TYPES", () => {
  test("every listed type is handled by the graph executor", async () => {
    // Keywords are entry points only; the graph never visits one mid-flow.
    for (const type of SUPPORTED_OBJECT_TYPES.filter((candidate) => candidate !== KEYWORD)) {
      expect({ type, unsupported: unsupported(await visit(type)) }).toEqual({
        type,
        unsupported: false,
      });
    }
  });

  test("unlisted types are reported unsupported, so the check above is not vacuous", async () => {
    for (const type of ["alfred.workflow.automation.task", ...PASSIVE_TRIGGER_TYPES]) {
      expect({ type, unsupported: unsupported(await visit(type)) }).toEqual({
        type,
        unsupported: true,
      });
    }
  });

  test("passive triggers and supported types do not overlap", () => {
    expect(PASSIVE_TRIGGER_TYPES.filter((type) => SUPPORTED_OBJECT_TYPES.includes(type))).toEqual(
      [],
    );
    expect(new Set(SUPPORTED_OBJECT_TYPES).size).toBe(SUPPORTED_OBJECT_TYPES.length);
    expect(SUPPORTED_OBJECT_TYPES).toHaveLength(39);
  });
});

describe("SUPPORTED_AUTOMATION_TASKS", () => {
  test("every listed task is handled by the graph executor", async () => {
    // A task may fail on empty input; it must not be reported unsupported.
    for (const taskuid of SUPPORTED_AUTOMATION_TASKS) {
      const warnings = await visit(AUTOMATION_TASK, { taskuid, tasksettings: {} });
      expect({ taskuid, unsupported: unsupported(warnings) }).toEqual({
        taskuid,
        unsupported: false,
      });
    }
  });

  test("unknown and missing taskuids are reported unsupported", async () => {
    const unknown = await visit(AUTOMATION_TASK, { taskuid: "com.example/nope" });
    expect(unknown).toEqual([
      "alfred: alfred.workflow.automation.task (node) task com.example/nope is not supported; that branch stops here",
    ]);
    expect(unsupported(await visit(AUTOMATION_TASK, {}))).toBe(true);
  });

  test("the list is exactly the implemented tasks, and the type is never claimed wholesale", () => {
    expect(SUPPORTED_AUTOMATION_TASKS).toHaveLength(35);
    expect(new Set(SUPPORTED_AUTOMATION_TASKS).size).toBe(35);
    expect(SUPPORTED_AUTOMATION_TASKS.toSorted()).toEqual(Object.keys(AUTOMATION_TASKS).toSorted());
    expect(SUPPORTED_OBJECT_TYPES).not.toContain(AUTOMATION_TASK);
  });

  test("classifyAlfredObject judges Automation Tasks by taskuid", () => {
    const taskuid = SUPPORTED_AUTOMATION_TASKS[0]!;
    expect(classifyAlfredObject({ type: AUTOMATION_TASK, config: { taskuid } })).toBe("supported");
    expect(classifyAlfredObject({ type: AUTOMATION_TASK, config: { taskuid: "x" } })).toBe(
      "unsupported",
    );
    expect(classifyAlfredObject({ type: AUTOMATION_TASK, config: {} })).toBe("unsupported");
    expect(classifyAlfredObject({ type: "alfred.workflow.output.clipboard" })).toBe("supported");
    expect(classifyAlfredObject({ type: "alfred.workflow.trigger.hotkey" })).toBe("passive");
    expect(classifyAlfredObject({ type: "alfred.workflow.action.terminalcommand" })).toBe(
      "unsupported",
    );
  });
});
