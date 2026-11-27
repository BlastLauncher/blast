import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { executeWorkflowGraph, type GraphHost } from "./graph.ts";
import { KEYWORD } from "./manifest.ts";
import { PASSIVE_TRIGGER_TYPES, SUPPORTED_OBJECT_TYPES } from "./support.ts";
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
async function visit(type: string): Promise<string[]> {
  const workflow = parseWorkflow({
    bundleid: "com.example.support",
    name: "Support",
    objects: [
      { uid: "kw", type: KEYWORD, config: { keyword: "kw" } },
      { uid: "node", type, config: {} },
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
  warnings.some((w) => w.includes("(node) is not supported"));

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
