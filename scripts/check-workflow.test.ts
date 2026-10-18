import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { checkTask, checkWorkflow } from "./check-workflow.ts";

const VALID_TASK = `---
id: "0007"
title: Do a thing
status: todo
milestone: M1
depends: ["0001"]
---

## Goal
## Context
## Acceptance
## Out of scope
## Handoff
`;

const roots: string[] = [];

function repo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "blast-workflow-"));
  roots.push(root);
  const all = { "AGENTS.md": "# a\n", "PLAN.md": "# p\n", ...files };
  for (const [path, text] of Object.entries(all)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("checkTask", () => {
  test("accepts a well-formed task", () => {
    expect(checkTask("0007-do-a-thing.md", VALID_TASK)).toEqual([]);
  });

  test("rejects bad file names", () => {
    expect(checkTask("7-thing.md", VALID_TASK)).toEqual([
      "tasks/7-thing.md: name must match NNNN-short-slug.md",
    ]);
  });

  test("rejects mismatched id, done status, and missing sections", () => {
    const text = VALID_TASK.replace("status: todo", "status: done").replace("## Handoff\n", "");
    expect(checkTask("0008-x.md", text)).toEqual([
      'tasks/0008-x.md: id must be "0008"',
      "tasks/0008-x.md: done tasks must be deleted, not kept",
      'tasks/0008-x.md: missing "## Handoff" section',
    ]);
  });

  test("rejects malformed depends and milestone", () => {
    const text = VALID_TASK.replace('["0001"]', "[1]").replace("M1", "one");
    expect(checkTask("0007-x.md", text)).toEqual([
      "tasks/0007-x.md: milestone must look like M1",
      "tasks/0007-x.md: depends must be a list of four-digit ids",
    ]);
  });
});

describe("checkWorkflow", () => {
  test("passes a minimal repository", () => {
    expect(checkWorkflow(repo({ "tasks/0007-do-a-thing.md": VALID_TASK }))).toEqual([]);
  });

  test("enforces line limits", () => {
    const root = repo({
      "PLAN.md": "x\n".repeat(200),
      "docs/decisions/0001-x.md": "x\n".repeat(100),
    });
    expect(checkWorkflow(root)).toEqual([
      "PLAN.md: 201 lines exceeds limit of 120",
      "docs/decisions/0001-x.md: 101 lines exceeds 60",
    ]);
  });

  test("rejects duplicate task ids", () => {
    const root = repo({
      "tasks/0007-do-a-thing.md": VALID_TASK,
      "tasks/0007-other.md": VALID_TASK,
    });
    expect(checkWorkflow(root)).toEqual([
      "tasks/0007-other.md: id 0007 already used by 0007-do-a-thing.md",
    ]);
  });

  test("rejects imports from the archive", () => {
    // Assembled at runtime so this file does not trip the check itself.
    const source = ['import x from "../../', 'archive/packages/a.ts";\n'].join("");
    expect(checkWorkflow(repo({ "packages/a/src/x.ts": source }))).toEqual([
      "packages/a/src/x.ts: imports from archive/",
    ]);
  });
});
