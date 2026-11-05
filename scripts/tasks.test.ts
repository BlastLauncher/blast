import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { landTask, mergeTask, updatedPlan, nextTasks, readyTasks, startTask } from "./tasks.ts";

const roots: string[] = [];
const task = (id: string, status: string, depends = "[]") =>
  `---\nid: "${id}"\ntitle: Task ${id}\nstatus: ${status}\nmilestone: M1\ndepends: ${depends}\n---\n\n## Goal\n## Context\n## Acceptance\n## Out of scope\n## Handoff\n`;

const realTestRunner = (command: string, args: string[], cwd: string) => {
  const result = Bun.spawnSync([command, ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  return {
    status: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
};
const mergeTestRunner = (command: string, args: string[], cwd: string) =>
  command === "bun" ? { status: 0, stdout: "", stderr: "" } : realTestRunner(command, args, cwd);
const landRealRunner = (command: string, args: string[], cwd: string) => {
  if (command === "git" && args[0] === "push") return { status: 0, stdout: "", stderr: "" };
  if (command === "gh")
    return {
      status: 0,
      stdout: JSON.stringify([{ status: "completed", conclusion: "success", name: "ci" }]),
      stderr: "",
    };
  return realTestRunner(command, args, cwd);
};
const landRealFailureRunner = (command: string, args: string[], cwd: string) => {
  if (command === "git" && args[0] === "push") return { status: 0, stdout: "", stderr: "" };
  if (command === "gh")
    return {
      status: 0,
      stdout: JSON.stringify([{ status: "completed", conclusion: "failure", name: "ci" }]),
      stderr: "",
    };
  return realTestRunner(command, args, cwd);
};

function repo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "blast-tasks-"));
  roots.push(root);
  for (const [name, content] of Object.entries(files)) {
    const path = join(root, name);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, content);
  }
  execFileSync("git", ["init", "-b", "main"], { cwd: root });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
  execFileSync("git", ["add", "-A"], { cwd: root });
  execFileSync("git", ["commit", "-m", "initial"], { cwd: root });
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("task planning", () => {
  test("orders ready tasks and reports open dependencies", () => {
    const root = repo({
      "PLAN.md": "# Plan\n",
      "tasks/0002-later.md": task("0002", "todo", '["0001"]'),
      "tasks/0001-first.md": task("0001", "doing"),
      "tasks/0003-ready.md": task("0003", "todo"),
    });
    expect(readyTasks(root).map(({ id, blocking }) => ({ id, blocking }))).toEqual([
      { id: "0002", blocking: ["0001"] },
      { id: "0003", blocking: [] },
    ]);
  });

  test("lists in-progress tasks after todo tasks", () => {
    const root = repo({
      "PLAN.md": "# Plan\n",
      "tasks/0003-review.md": task("0003", "review"),
      "tasks/0002-doing.md": task("0002", "doing"),
      "tasks/0001-todo.md": task("0001", "todo"),
    });
    expect(nextTasks(root).map(({ id, status }) => ({ id, status }))).toEqual([
      { id: "0001", status: "todo" },
      { id: "0002", status: "doing" },
      { id: "0003", status: "review" },
    ]);
  });
});

describe("tasks:start", () => {
  test("requires main and commits the status change", () => {
    const root = repo({ "PLAN.md": "# Plan\n", "tasks/0001-start.md": task("0001", "todo") });
    const calls: string[][] = [];
    const output = startTask(root, "0001", (command, args, cwd) => {
      calls.push([command, ...args]);
      const result = Bun.spawnSync([command, ...args], { cwd, stdout: "pipe", stderr: "pipe" });
      return {
        status: result.exitCode,
        stdout: result.stdout.toString(),
        stderr: result.stderr.toString(),
      };
    });
    expect(output).toBe("Follow AGENTS.md. You are the Worker for `tasks/0001-start.md`.");
    expect(readFileSync(join(root, "tasks/0001-start.md"), "utf8")).toContain("status: doing");
    expect(
      execFileSync("git", ["show", "-s", "--format=%s", "HEAD"], {
        cwd: root,
        encoding: "utf8",
      }).trim(),
    ).toBe("chore: start 0001 (Task 0001)");
    expect(calls.some((call) => call.includes("commit"))).toBe(true);
  });

  test("adds an optional co-author trailer", () => {
    const root = repo({ "PLAN.md": "# Plan\n", "tasks/0001-start.md": task("0001", "todo") });
    startTask(root, "0001", { coAuthor: "Alice <alice@example.com>" }, realTestRunner);
    expect(
      execFileSync("git", ["show", "-s", "--format=%B", "HEAD"], { cwd: root, encoding: "utf8" }),
    ).toContain("Co-Authored-By: Alice <alice@example.com>");
  });

  test("rejects a non-main or dirty checkout", () => {
    const root = repo({ "PLAN.md": "# Plan\n", "tasks/0001-start.md": task("0001", "todo") });
    execFileSync("git", ["switch", "-c", "worker"], { cwd: root });
    expect(() => startTask(root, "0001", realTestRunner)).toThrow("must be on main");
    execFileSync("git", ["switch", "main"], { cwd: root });
    writeFileSync(join(root, "PLAN.md"), "dirty\n");
    expect(() => startTask(root, "0001", realTestRunner)).toThrow("working tree is not clean");
  });
});

function fakeRunner(
  responses: Record<string, { status?: number; stdout?: string; stderr?: string }> = {},
) {
  const calls: string[][] = [];
  const runner = (command: string, args: string[], _cwd: string) => {
    calls.push([command, ...args]);
    const key = [command, ...args].join(" ");
    const response = responses[key] ?? {};
    return {
      status: response.status ?? 0,
      stdout: response.stdout ?? "",
      stderr: response.stderr ?? "",
    };
  };
  return { calls, runner };
}

function landFake(conclusion: string) {
  const { calls, runner } = fakeRunner({
    "git show -s --format=%s HEAD": { stdout: "chore(0001): done\n" },
    "git rev-parse HEAD": { stdout: "head\n" },
    "git push origin main": {},
    "gh run list --commit head --json status,conclusion,name": {
      stdout: JSON.stringify([{ status: "completed", conclusion, name: "ci" }]),
    },
    "git rev-parse HEAD^^2": { stdout: "worker-tip\n" },
    "git worktree list --porcelain": { stdout: "worktree /tmp/worker\nbranch refs/heads/worker\n" },
    "git rev-parse worker": { stdout: "worker-tip\n" },
    "git worktree remove /tmp/worker": {},
    "git branch -d worker": {},
  });
  return { calls, runner };
}

describe("tasks:merge", () => {
  test("rejects ambiguous automatic branch detection", () => {
    const root = repo({
      "PLAN.md": "### M1\n- [ ] 0001\n",
      "tasks/0001-merge.md": task("0001", "doing"),
    });
    const { runner } = fakeRunner({
      "git branch --show-current": { stdout: "main" },
      "git status --porcelain": {},
      "git worktree list --porcelain": {
        stdout:
          "worktree /tmp/one\nbranch refs/heads/one\nworktree /tmp/two\nbranch refs/heads/two\n",
      },
      "git diff --name-only main..one -- tasks/0001-merge.md": { stdout: "tasks/0001-merge.md\n" },
      "git diff --name-only main..two -- tasks/0001-merge.md": { stdout: "tasks/0001-merge.md\n" },
    });
    expect(() => mergeTask(root, "0001", {}, runner)).toThrow("expected one worker branch");
  });

  test("ticks PLAN and commits after both gates pass", () => {
    const root = repo({
      "PLAN.md": "### M1\n- [ ] 0001\n",
      "tasks/0001-merge.md": task("0001", "doing"),
    });
    const git = (...args: string[]) => execFileSync("git", args, { cwd: root });
    git("switch", "-c", "worker");
    writeFileSync(
      join(root, "tasks/0001-merge.md"),
      task("0001", "doing").replace("Task 0001", "Task 0001 changed"),
    );
    git("add", ".");
    git("commit", "-m", "worker");
    git("switch", "main");
    mergeTask(root, "0001", { branch: "worker" }, mergeTestRunner);
    expect(readFileSync(join(root, "PLAN.md"), "utf8")).toContain("- [x] 0001");
    expect(
      execFileSync("git", ["show", "-s", "--format=%s", "HEAD"], {
        cwd: root,
        encoding: "utf8",
      }).trim(),
    ).toBe("chore(0001): done");
  });

  test("adds an optional co-author trailer to the done commit", () => {
    const root = repo({
      "PLAN.md": "### M1\n- [ ] 0001\n",
      "tasks/0001-merge.md": task("0001", "doing"),
    });
    const git = (...args: string[]) => execFileSync("git", args, { cwd: root });
    git("switch", "-c", "worker");
    writeFileSync(
      join(root, "tasks/0001-merge.md"),
      task("0001", "doing").replace("Task 0001", "changed"),
    );
    git("add", ".");
    git("commit", "-m", "worker");
    git("switch", "main");
    mergeTask(
      root,
      "0001",
      { branch: "worker", coAuthor: "Alice <alice@example.com>" },
      mergeTestRunner,
    );
    expect(
      execFileSync("git", ["show", "-s", "--format=%B", "HEAD"], { cwd: root, encoding: "utf8" }),
    ).toContain("Co-Authored-By: Alice <alice@example.com>");
  });

  test("aborts a merge conflict and does not delete the task", () => {
    const root = repo({
      "PLAN.md": "### M1\n- [ ] 0001\n",
      "tasks/0001-merge.md": task("0001", "doing"),
    });
    const { calls, runner } = fakeRunner({
      "git branch --show-current": { stdout: "main" },
      "git status --porcelain": {},
      "git show-ref --verify refs/heads/worker": {},
      "git rev-list --count main..worker": { stdout: "1" },
      "git merge --no-ff worker": { status: 1, stderr: "conflict" },
    });
    expect(() => mergeTask(root, "0001", { branch: "worker" }, runner)).toThrow(
      "merge was aborted",
    );
    expect(calls).toContainEqual(["git", "merge", "--abort"]);
    expect(readFileSync(join(root, "tasks/0001-merge.md"), "utf8")).toContain("status: doing");
  });

  test("requires a plan argument when the checklist line is absent", () => {
    const root = repo({ "PLAN.md": "### M1\n", "tasks/0001-merge.md": task("0001", "doing") });
    const { calls, runner } = fakeRunner({
      "git branch --show-current": { stdout: "main" },
      "git status --porcelain": {},
      "git show-ref --verify refs/heads/worker": {},
      "git rev-list --count main..worker": { stdout: "1" },
      "git merge --no-ff worker": {},
      "bun run check:workflow": {},
      "bun run verify": {},
    });
    expect(() => mergeTask(root, "0001", { branch: "worker" }, runner)).toThrow("pass --plan");
    expect(calls.some((call) => call.includes("merge"))).toBe(false);
  });

  test("appends --plan text at the end of the milestone checklist", () => {
    const info = { id: "0002", milestone: "M7" } as Parameters<typeof updatedPlan>[1];
    const plan = [
      "### M7 — Real examples",
      "",
      "Intro text.",
      "",
      "- [x] 0001 first;",
      "      continued",
      "",
      "## Later",
      "",
    ].join("\n");
    expect(updatedPlan(plan, info, "0002 second")).toBe(
      plan.replace("      continued\n", "      continued\n- [x] 0002 second\n"),
    );
    expect(updatedPlan("### M7\n- [ ] 0002 x\n", info)).toBe("### M7\n- [x] 0002 x\n");
    expect(() => updatedPlan("### M6\n- [x] a\n", info, "t")).toThrow("no M7 milestone");
  });

  test("leaves the merge in place when verify fails", () => {
    const root = repo({
      "PLAN.md": "### M1\n- [ ] 0001\n",
      "tasks/0001-merge.md": task("0001", "doing"),
    });
    const { calls, runner } = fakeRunner({
      "git branch --show-current": { stdout: "main" },
      "git status --porcelain": {},
      "git show-ref --verify refs/heads/worker": {},
      "git rev-list --count main..worker": { stdout: "1" },
      "git merge --no-ff worker": {},
      "bun run check:workflow": {},
      "bun run verify": { status: 1, stderr: "verify failed" },
    });
    expect(() => mergeTask(root, "0001", { branch: "worker" }, runner)).toThrow("verify failed");
    expect(calls.some((call) => call.includes("commit"))).toBe(false);
  });
});

describe("tasks:land", () => {
  test("reports failed CI without cleanup", () => {
    const { calls, runner } = landFake("failure");
    expect(() =>
      landTask("/tmp", "0001", { runner, now: () => 0, sleep: () => undefined }),
    ).toThrow("GitHub Actions failed: ci");
    expect(calls.some((call) => call.includes("worktree") && call.includes("remove"))).toBe(false);
  });

  test("cleans up only after successful CI", () => {
    const { calls, runner } = landFake("success");
    landTask("/tmp", "0001", { runner, now: () => 0, sleep: () => undefined });
    expect(calls).toContainEqual(["git", "worktree", "remove", "/tmp/worker"]);
    expect(calls).toContainEqual(["git", "branch", "-d", "worker"]);
  });

  test("cleans a real worker worktree after successful CI", () => {
    const root = repo({
      "PLAN.md": "### M1\n- [ ] 0001\n",
      "tasks/0001-merge.md": task("0001", "doing"),
    });
    const workerParent = mkdtempSync(join(tmpdir(), "blast-worker-"));
    roots.push(workerParent);
    const workerPath = join(workerParent, "tree");
    execFileSync("git", ["worktree", "add", "-b", "worker", workerPath], { cwd: root });
    writeFileSync(
      join(workerPath, "tasks/0001-merge.md"),
      task("0001", "doing").replace("Task 0001", "changed"),
    );
    execFileSync("git", ["add", "."], { cwd: workerPath });
    execFileSync("git", ["commit", "-m", "worker"], { cwd: workerPath });
    mergeTask(root, "0001", { branch: "worker" }, mergeTestRunner);
    landTask(root, "0001", { runner: landRealRunner });
    expect(() =>
      execFileSync("git", ["show-ref", "--verify", "refs/heads/worker"], { cwd: root }),
    ).toThrow();
    expect(() => readFileSync(workerPath)).toThrow();
  });

  test("keeps a real worker worktree after failed CI", () => {
    const root = repo({
      "PLAN.md": "### M1\n- [ ] 0001\n",
      "tasks/0001-merge.md": task("0001", "doing"),
    });
    const workerParent = mkdtempSync(join(tmpdir(), "blast-worker-"));
    roots.push(workerParent);
    const workerPath = join(workerParent, "tree");
    execFileSync("git", ["worktree", "add", "-b", "worker", workerPath], { cwd: root });
    writeFileSync(
      join(workerPath, "tasks/0001-merge.md"),
      task("0001", "doing").replace("Task 0001", "changed"),
    );
    execFileSync("git", ["add", "."], { cwd: workerPath });
    execFileSync("git", ["commit", "-m", "worker"], { cwd: workerPath });
    mergeTask(root, "0001", { branch: "worker" }, mergeTestRunner);
    expect(() => landTask(root, "0001", { runner: landRealFailureRunner })).toThrow(
      "GitHub Actions failed: ci",
    );
    expect(readFileSync(join(workerPath, "tasks/0001-merge.md"), "utf8")).toContain(
      "status: doing",
    );
    expect(
      execFileSync("git", ["show-ref", "--verify", "refs/heads/worker"], {
        cwd: root,
        encoding: "utf8",
      }),
    ).toContain("refs/heads/worker");
  });
});
