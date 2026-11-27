import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type CommandResult,
  type CommandRunner,
  DEFAULT_LAND_POLL_MS,
  landTask,
  mergeTask,
  nextTasks,
  pullRequestBody,
  pullRequestTitle,
  readyTasks,
  startTask,
  updatedPlan,
} from "./tasks.ts";

const roots: string[] = [];
const task = (id: string, status: string, depends = "[]", handoff = "") =>
  `---\nid: "${id}"\ntitle: Task ${id}\nstatus: ${status}\nmilestone: M1\ndepends: ${depends}\n---\n\n## Goal\n## Context\n## Acceptance\n## Out of scope\n## Handoff\n${handoff}`;
const template = readFileSync(join(import.meta.dir, "../.github/pull_request_template.md"), "utf8");
const PR_URL = "https://github.com/example/blast/pull/7";

// Isolate temp git repos from host user/system config (signing, hooks, fsmonitor).
const gitEnv: Record<string, string> = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.com",
};

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8", env: gitEnv }).trim();
const real: CommandRunner = (command, args, cwd) => {
  const result = Bun.spawnSync([command, ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    ...(command === "git" ? { env: gitEnv } : {}),
  });
  return {
    status: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
};

function dir(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "blast-tasks-"));
  roots.push(root);
  for (const [name, content] of Object.entries(files)) {
    const path = join(root, name);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, content);
  }
  return root;
}

function repo(files: Record<string, string>): string {
  const root = dir(files);
  git(root, "init", "-q", "-b", "main");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "initial");
  // Stands in for the fetched remote; tests never talk to a real one.
  git(root, "update-ref", "refs/remotes/origin/main", "HEAD");
  return root;
}

function worktree(root: string, name: string, base: string): string {
  const parent = mkdtempSync(join(tmpdir(), "blast-worker-"));
  roots.push(parent);
  const path = join(parent, name);
  git(root, "worktree", "add", "-q", "-b", name, path, base);
  return path;
}

function commit(cwd: string, files: Record<string, string>, message: string): void {
  for (const [name, content] of Object.entries(files)) writeFileSync(join(cwd, name), content);
  git(cwd, "add", "-A");
  git(cwd, "commit", "-q", "-m", message);
}

/** Moves the simulated origin/main forward by one commit. */
function advanceOrigin(root: string, file: string, content: string): void {
  const index = join(mkdtempSync(join(tmpdir(), "blast-index-")), "index");
  roots.push(join(index, ".."));
  const env = { ...gitEnv, GIT_INDEX_FILE: index };
  execFileSync("git", ["read-tree", "origin/main"], { cwd: root, env });
  const blob = execFileSync("git", ["hash-object", "-w", "--stdin"], {
    cwd: root,
    env: gitEnv,
    input: content,
    encoding: "utf8",
  }).trim();
  execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${blob},${file}`], {
    cwd: root,
    env,
  });
  const tree = execFileSync("git", ["write-tree"], { cwd: root, env, encoding: "utf8" }).trim();
  const sha = git(root, "commit-tree", tree, "-p", "origin/main", "-m", `other: ${file}`);
  git(root, "update-ref", "refs/remotes/origin/main", sha);
}

type Reply = Partial<CommandResult>;
const checks = (...items: Array<[string, string]>): Reply => ({
  status: items.some(([, bucket]) => bucket === "pending")
    ? 8
    : items.some(([, bucket]) => bucket === "fail")
      ? 1
      : 0,
  stdout: JSON.stringify(items.map(([name, bucket]) => ({ name, bucket, state: bucket }))),
});
const NO_CHECKS: Reply = { status: 1, stderr: "no checks reported on the 'task' branch" };

const ok = (stdout = "") => ({ status: 0, stdout, stderr: "" });

/** Real local git, with the network edges (fetch, push, pull, gh) simulated. */
function simulated(options: { prs?: string[]; checks?: Reply[] } = {}) {
  const calls: string[][] = [];
  let checkPolls = 0;
  const runner: CommandRunner = (command, args, cwd) => {
    calls.push([command, ...args]);
    if (command === "bun") return ok();
    if (command === "git" && (args[0] === "fetch" || args[0] === "push")) return ok();
    if (command === "git" && args[0] === "pull")
      return real("git", ["merge", "--ff-only", "-q", "origin/main"], cwd);
    if (command !== "gh") return real(command, args, cwd);
    if (args[1] === "list") return ok(JSON.stringify((options.prs ?? []).map((url) => ({ url }))));
    if (args[1] === "create") return ok(`Creating pull request\n${PR_URL}\n`);
    if (args[1] === "checks") {
      const replies = options.checks ?? [checks(["ci", "pass"])];
      const reply = replies[Math.min(checkPolls++, replies.length - 1)]!;
      return { status: reply.status ?? 0, stdout: reply.stdout ?? "", stderr: reply.stderr ?? "" };
    }
    if (args[1] === "merge") {
      // GitHub's merge commit: task branch tree on top of origin/main.
      const head = git(cwd, "rev-parse", "HEAD");
      const sha = git(
        cwd,
        "commit-tree",
        `${head}^{tree}`,
        "-p",
        "origin/main",
        "-p",
        head,
        "-m",
        "Merge PR",
      );
      git(cwd, "update-ref", "refs/remotes/origin/main", sha);
      return ok();
    }
    return { status: 1, stdout: "", stderr: `unexpected gh ${args.join(" ")}` };
  };
  return { calls, runner };
}

/** Pure fake: every command succeeds unless a reply is given for its exact argv. */
function fakeRunner(responses: Record<string, Reply> = {}) {
  const calls: string[][] = [];
  const runner: CommandRunner = (command, args) => {
    calls.push([command, ...args]);
    const response = responses[[command, ...args].join(" ")] ?? {};
    return {
      status: response.status ?? 0,
      stdout: response.stdout ?? "",
      stderr: response.stderr ?? "",
    };
  };
  return { calls, runner };
}

const pushes = (calls: string[][]) =>
  calls.filter(([command, sub]) => command === "git" && sub === "push");

/** A task started from origin/main, worked in a worktree, and merged as done. */
function doneTask(handoff = "```\nBranch/commit: worker @ abc\nVerify: 1 pass\n```\n") {
  const root = repo({
    "PLAN.md": "### M1\n- [ ] 0001\n",
    ".github/pull_request_template.md": template,
    "tasks/0001-land.md": task("0001", "todo"),
  });
  const sim = simulated();
  startTask(root, "0001", sim.runner);
  const workerPath = worktree(root, "worker", "task/0001-land");
  commit(workerPath, { "work.txt": "work\n" }, "feat(0001): the work");
  commit(
    workerPath,
    { "tasks/0001-land.md": task("0001", "doing", "[]", handoff) },
    "chore(0001): handoff",
  );
  mergeTask(root, "0001", { branch: "worker" }, sim.runner);
  return { root, workerPath, calls: sim.calls };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("task planning", () => {
  test("orders ready tasks and reports open dependencies", () => {
    const root = dir({
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
    const root = dir({
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
  test("branches from origin/main, carrying an uncommitted task file", () => {
    const root = repo({ "PLAN.md": "# Plan\n" });
    commit(root, { "local.txt": "unpushed\n" }, "local only");
    mkdirSync(join(root, "tasks"));
    writeFileSync(join(root, "tasks/0001-start.md"), task("0001", "todo"));
    const { calls, runner } = simulated();
    const brief = startTask(root, "0001", runner);
    expect(brief).toBe("Follow AGENTS.md. You are the Worker for `tasks/0001-start.md`.");
    expect(calls).toContainEqual(["git", "fetch", "origin"]);
    expect(calls).toContainEqual(["git", "switch", "-c", "task/0001-start", "origin/main"]);
    expect(git(root, "branch", "--show-current")).toBe("task/0001-start");
    expect(git(root, "rev-parse", "HEAD^")).toBe(git(root, "rev-parse", "origin/main"));
    expect(git(root, "show", "-s", "--format=%s", "HEAD")).toBe("chore: start 0001 (Task 0001)");
    expect(git(root, "show", "HEAD:tasks/0001-start.md")).toContain("status: doing");
    expect(existsSync(join(root, "local.txt"))).toBe(false);
    expect(git(root, "status", "--porcelain")).toBe("");
  });

  test("moves a task file committed only on local main", () => {
    const root = repo({ "PLAN.md": "# Plan\n" });
    mkdirSync(join(root, "tasks"));
    commit(root, { "tasks/0001-start.md": task("0001", "todo") }, "docs: task 0001");
    startTask(root, "0001", simulated().runner);
    expect(git(root, "rev-parse", "HEAD^")).toBe(git(root, "rev-parse", "origin/main"));
    expect(git(root, "show", "HEAD:tasks/0001-start.md")).toContain("status: doing");
  });

  test("adds an optional co-author trailer", () => {
    const root = repo({ "PLAN.md": "# Plan\n", "tasks/0001-start.md": task("0001", "todo") });
    startTask(root, "0001", { coAuthor: "Alice <alice@example.com>" }, simulated().runner);
    expect(git(root, "show", "-s", "--format=%B", "HEAD")).toContain(
      "Co-Authored-By: Alice <alice@example.com>",
    );
  });

  test("refuses when not on main or the tree has other changes", () => {
    const root = repo({ "PLAN.md": "# Plan\n", "tasks/0001-start.md": task("0001", "todo") });
    const { calls, runner } = simulated();
    git(root, "switch", "-q", "-c", "elsewhere");
    expect(() => startTask(root, "0001", runner)).toThrow("must be on main");
    git(root, "switch", "-q", "main");
    writeFileSync(join(root, "PLAN.md"), "dirty\n");
    expect(() => startTask(root, "0001", runner)).toThrow("working tree is not clean");
    expect(calls.some(([, sub]) => sub === "fetch" || sub === "switch")).toBe(false);
  });

  test("refuses an existing task branch", () => {
    const root = repo({ "PLAN.md": "# Plan\n", "tasks/0001-start.md": task("0001", "todo") });
    git(root, "branch", "task/0001-start");
    const { calls, runner } = simulated();
    expect(() => startTask(root, "0001", runner)).toThrow("branch task/0001-start already exists");
    expect(git(root, "branch", "--show-current")).toBe("main");
    expect(calls.some(([, sub]) => sub === "fetch" || sub === "commit")).toBe(false);
  });
});

/** A started task with a worker branch that edited the task file. */
function startedTask() {
  const root = repo({
    "PLAN.md": "### M1\n- [ ] 0001\n",
    "bun.lock": "{}\n",
    "tasks/0001-merge.md": task("0001", "todo"),
  });
  startTask(root, "0001", simulated().runner);
  return root;
}

describe("tasks:merge", () => {
  test("refuses on main", () => {
    const root = repo({
      "PLAN.md": "### M1\n- [ ] 0001\n",
      "tasks/0001-merge.md": task("0001", "doing"),
    });
    const { calls, runner } = simulated();
    expect(() => mergeTask(root, "0001", { branch: "worker" }, runner)).toThrow(
      "must be on the task branch, not main",
    );
    expect(calls.some(([, sub]) => sub === "merge")).toBe(false);
  });

  test("finds the worker relative to the task branch, ignoring other tasks' workers", () => {
    const root = startedTask();
    const workerPath = worktree(root, "round-two", "task/0001-merge");
    commit(
      workerPath,
      { "tasks/0001-merge.md": task("0001", "doing", "[]", "done\n") },
      "chore(0001): handoff",
    );
    // Another task's worker, forked from origin/main: it has no tasks/0001 file at all.
    const otherPath = worktree(root, "other-worker", "origin/main");
    commit(otherPath, { "other.txt": "other\n" }, "feat(0002): other");
    const { calls, runner } = simulated();
    mergeTask(root, "0001", {}, runner);
    expect(calls).toContainEqual(["git", "rev-list", "--count", "task/0001-merge..round-two"]);
    expect(git(root, "show", "-s", "--format=%s", "HEAD")).toBe("chore(0001): done");
    expect(git(root, "rev-parse", "HEAD^^2")).toBe(git(root, "rev-parse", "round-two"));
    expect(git(root, "branch", "--show-current")).toBe("task/0001-merge");
  });

  test("rejects ambiguous automatic branch detection", () => {
    const root = dir({
      "PLAN.md": "### M1\n- [ ] 0001\n",
      "tasks/0001-merge.md": task("0001", "doing"),
    });
    const { runner } = fakeRunner({
      "git branch --show-current": { stdout: "task/0001-merge\n" },
      "git worktree list --porcelain": {
        stdout:
          "worktree /r\nbranch refs/heads/task/0001-merge\nworktree /tmp/one\nbranch refs/heads/one\nworktree /tmp/two\nbranch refs/heads/two\n",
      },
      "git diff --name-only task/0001-merge...one -- tasks/0001-merge.md": {
        stdout: "tasks/0001-merge.md\n",
      },
      "git diff --name-only task/0001-merge...two -- tasks/0001-merge.md": {
        stdout: "tasks/0001-merge.md\n",
      },
    });
    expect(() => mergeTask(root, "0001", {}, runner)).toThrow(
      "expected one worker branch for 0001-merge.md; candidates: one, two",
    );
  });

  test("ticks PLAN, deletes the task and commits done after both gates pass", () => {
    const root = startedTask();
    const workerPath = worktree(root, "worker", "task/0001-merge");
    commit(workerPath, { "work.txt": "work\n" }, "feat(0001): work");
    const { calls, runner } = simulated();
    mergeTask(root, "0001", { branch: "worker", coAuthor: "Alice <alice@example.com>" }, runner);
    expect(readFileSync(join(root, "PLAN.md"), "utf8")).toContain("- [x] 0001");
    expect(existsSync(join(root, "tasks/0001-merge.md"))).toBe(false);
    expect(git(root, "show", "-s", "--format=%B", "HEAD")).toBe(
      "chore(0001): done\n\nCo-Authored-By: Alice <alice@example.com>",
    );
    const bun = calls.filter(([command]) => command === "bun").map((call) => call.join(" "));
    expect(bun).toEqual(["bun run check:workflow", "bun run verify"]);
  });

  test("aborts a merge conflict and does not delete the task", () => {
    const root = dir({
      "PLAN.md": "### M1\n- [ ] 0001\n",
      "tasks/0001-merge.md": task("0001", "doing"),
    });
    const { calls, runner } = fakeRunner({
      "git branch --show-current": { stdout: "task/0001-merge\n" },
      "git rev-list --count task/0001-merge..worker": { stdout: "1" },
      "git merge --no-ff worker": { status: 1, stderr: "conflict" },
    });
    expect(() => mergeTask(root, "0001", { branch: "worker" }, runner)).toThrow(
      "merge was aborted",
    );
    expect(calls).toContainEqual(["git", "merge", "--abort"]);
    expect(readFileSync(join(root, "tasks/0001-merge.md"), "utf8")).toContain("status: doing");
  });

  test("refuses a worker that is not ahead of the task branch", () => {
    const root = startedTask();
    git(root, "branch", "worker");
    expect(() => mergeTask(root, "0001", { branch: "worker" }, simulated().runner)).toThrow(
      "branch worker is not ahead of task/0001-merge",
    );
  });

  test("requires a plan argument when the checklist line is absent", () => {
    const root = dir({ "PLAN.md": "### M1\n", "tasks/0001-merge.md": task("0001", "doing") });
    const { calls, runner } = fakeRunner({
      "git branch --show-current": { stdout: "task/0001-merge\n" },
      "git rev-list --count task/0001-merge..worker": { stdout: "1" },
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
    const root = dir({
      "PLAN.md": "### M1\n- [ ] 0001\n",
      "tasks/0001-merge.md": task("0001", "doing"),
    });
    const { calls, runner } = fakeRunner({
      "git branch --show-current": { stdout: "task/0001-merge\n" },
      "git rev-list --count task/0001-merge..worker": { stdout: "1" },
      "bun run verify": { status: 1, stderr: "verify failed" },
    });
    expect(() => mergeTask(root, "0001", { branch: "worker" }, runner)).toThrow("verify failed");
    expect(calls.some((call) => call.includes("commit"))).toBe(false);
  });

  test("reinstalls only when the merge changes bun.lock", () => {
    for (const changesLock of [true, false]) {
      const root = startedTask();
      const workerPath = worktree(root, "worker", "task/0001-merge");
      commit(workerPath, { [changesLock ? "bun.lock" : "work.txt"]: "{ }\n" }, "feat(0001): work");
      const { calls, runner } = simulated();
      mergeTask(root, "0001", { branch: "worker" }, runner);
      expect(calls.some((call) => call.join(" ") === "bun install --frozen-lockfile")).toBe(
        changesLock,
      );
    }
  });
});

describe("pull request text", () => {
  test("titles the PR after the first non-chore commit type", () => {
    const subjects = [
      "chore: start 0001 (T)",
      "fix(0001): repair",
      "feat(0001): add",
      "chore(0001): done",
    ];
    expect(pullRequestTitle("0001", "T", subjects)).toBe("fix(0001): T");
    expect(pullRequestTitle("0001", "T", ["chore: start 0001 (T)", "Merge branch 'x'", ""])).toBe(
      "feat(0001): T",
    );
  });

  test("fills the template with the task file and its Handoff", () => {
    const handoff =
      "```\nBranch/commit: w @ 1\nVerify: ok\nDone:\n- x\nNot done / risks: none\n```";
    const body = pullRequestBody(
      template,
      "tasks/0001-land.md",
      task("0001", "done", "[]", `\n${handoff}\n`),
    );
    expect(body).toContain("Task: `tasks/0001-land.md` (deleted in this PR)");
    expect(body).toContain(`## Handoff\n\n${handoff}\n\n## Review`);
    expect(body).not.toContain("Branch/commit:\n");
    expect(pullRequestBody(template, "tasks/0001-land.md", task("0001", "done"))).toBe(
      template.replace("tasks/NNNN-slug.md", "tasks/0001-land.md"),
    );
  });
});

const quiet = { now: () => 0, sleep: () => undefined, log: () => undefined };

describe("tasks:land", () => {
  test("merges origin/main, pushes, opens the PR, waits for checks, merges and cleans up", () => {
    const { root, workerPath } = doneTask();
    const oldPath = worktree(root, "old", "origin/main");
    const otherPath = worktree(root, "other", "origin/main");
    commit(otherPath, { "other.txt": "other\n" }, "feat(0002): other task");
    advanceOrigin(root, "upstream.txt", "upstream\n");
    const sleeps: number[] = [];
    const { calls, runner } = simulated({
      checks: [
        NO_CHECKS,
        checks(["ci", "pending"], ["lint", "pass"]),
        checks(["ci", "pass"], ["lint", "skipping"]),
      ],
    });
    const url = landTask(root, "0001", {
      ...quiet,
      runner,
      pollMs: 5,
      sleep: (ms) => sleeps.push(ms),
    });
    expect(url).toBe(PR_URL);
    const create = calls.find(([command, , sub]) => command === "gh" && sub === "create")!;
    expect(create.slice(0, 7)).toEqual([
      "gh",
      "pr",
      "create",
      "--base",
      "main",
      "--head",
      "task/0001-land",
    ]);
    expect(create[8]).toBe("feat(0001): Task 0001");
    expect(create[10]).toContain("Task: `tasks/0001-land.md`");
    expect(create[10]).toContain("Branch/commit: worker @ abc\nVerify: 1 pass");
    const order = calls
      .map((call) => call.join(" "))
      .filter((line) =>
        /^(git (fetch|merge --no-edit|push|switch main|pull)|gh pr (create|merge))/.test(line),
      );
    expect(order).toEqual([
      "git fetch origin",
      "git merge --no-edit origin/main",
      "git push -u origin task/0001-land",
      `gh pr create ${create.slice(3).join(" ")}`,
      `gh pr merge ${PR_URL} --merge --delete-branch`,
      "git switch main",
      "git pull --ff-only origin main",
    ]);
    expect(sleeps).toEqual([5, 5]);
    expect(git(root, "branch", "--show-current")).toBe("main");
    expect(git(root, "rev-parse", "main")).toBe(git(root, "rev-parse", "origin/main"));
    expect(readFileSync(join(root, "upstream.txt"), "utf8")).toBe("upstream\n");
    expect(readFileSync(join(root, "work.txt"), "utf8")).toBe("work\n");
    expect(existsSync(workerPath)).toBe(false);
    const branches = git(root, "branch", "--format=%(refname:short)").split("\n").toSorted();
    expect(branches).toEqual(["main", "old", "other"]);
    expect(existsSync(oldPath) && existsSync(otherPath)).toBe(true);
  });

  test("reuses an open PR and allows fix commits after the done commit", () => {
    const { root } = doneTask();
    commit(root, { "fix.txt": "fix\n" }, "fix(0001): review finding");
    const existing = "https://github.com/example/blast/pull/3";
    const { calls, runner } = simulated({ prs: [existing] });
    expect(landTask(root, "0001", { ...quiet, runner })).toBe(existing);
    expect(calls).toContainEqual([
      "gh",
      "pr",
      "list",
      "--head",
      "task/0001-land",
      "--state",
      "open",
      "--json",
      "url",
    ]);
    expect(calls.some(([command, , sub]) => command === "gh" && sub === "create")).toBe(false);
    expect(calls).toContainEqual(["gh", "pr", "merge", existing, "--merge", "--delete-branch"]);
    expect(readFileSync(join(root, "fix.txt"), "utf8")).toBe("fix\n");
  });

  test("aborts a conflicting origin/main merge and names the files", () => {
    const { root } = doneTask();
    advanceOrigin(root, "PLAN.md", "### M1\n- [ ] 0001 changed upstream\n");
    const head = git(root, "rev-parse", "HEAD");
    const { calls, runner } = simulated();
    expect(() => landTask(root, "0001", { ...quiet, runner })).toThrow(
      "merging origin/main into task/0001-land failed; merge was aborted; conflicts: PLAN.md",
    );
    expect(calls).toContainEqual(["git", "merge", "--abort"]);
    expect(git(root, "rev-parse", "HEAD")).toBe(head);
    expect(git(root, "status", "--porcelain")).toBe("");
    expect(pushes(calls)).toEqual([]);
  });

  test("stops on a failed check without merging or cleaning up", () => {
    const { root, workerPath } = doneTask();
    const { calls, runner } = simulated({
      checks: [checks(["ci", "fail"], ["lint", "pass"], ["e2e", "cancel"])],
    });
    expect(() => landTask(root, "0001", { ...quiet, runner })).toThrow("checks failed: ci, e2e");
    expect(calls.some(([command, , sub]) => command === "gh" && sub === "merge")).toBe(false);
    expect(git(root, "branch", "--show-current")).toBe("task/0001-land");
    expect(existsSync(workerPath)).toBe(true);
  });

  test("times out on pending checks and lists them", () => {
    const { root, workerPath } = doneTask();
    let clock = 0;
    const { calls, runner } = simulated({
      checks: [checks(["ci", "pending"], ["lint", "pass"], ["e2e", "pending"])],
    });
    expect(() =>
      landTask(root, "0001", {
        ...quiet,
        runner,
        now: () => clock,
        sleep: (ms) => (clock += ms),
        timeoutMs: 100,
        pollMs: 40,
      }),
    ).toThrow("checks did not complete before timeout: ci, e2e");
    expect(calls.filter(([command, , sub]) => command === "gh" && sub === "checks").length).toBe(3);
    expect(calls.some(([command, , sub]) => command === "gh" && sub === "merge")).toBe(false);
    expect(existsSync(workerPath)).toBe(true);
  });

  test("refuses main, a dirty tree, or a branch without the done commit", () => {
    const root = startedTask();
    const { calls, runner } = simulated();
    expect(() => landTask(root, "0001", { ...quiet, runner })).toThrow(
      "no chore(0001): done commit",
    );
    writeFileSync(join(root, "PLAN.md"), "dirty\n");
    expect(() => landTask(root, "0001", { ...quiet, runner })).toThrow("working tree is not clean");
    git(root, "checkout", "-q", "--", "PLAN.md");
    git(root, "switch", "-q", "main");
    expect(() => landTask(root, "0001", { ...quiet, runner })).toThrow(
      "must be on the task branch",
    );
    expect(calls.some(([, sub]) => sub === "fetch" || sub === "push")).toBe(false);
  });

  test("no start, merge or land path runs git push origin main", () => {
    const makeFakeLand = (options: { checks?: Reply[]; conflict?: boolean } = {}) => {
      const calls: string[][] = [];
      let polls = 0;
      const responses: Record<string, Reply> = {
        "git branch --show-current": { stdout: "task/0001-land\n" },
        "git log --format=%H %s --fixed-strings --grep=chore(0001): done HEAD": {
          stdout: "deadbeef chore(0001): done\n",
        },
        "git diff --name-only --diff-filter=D deadbeef^ deadbeef -- tasks": {
          stdout: "tasks/0001-land.md\n",
        },
        "git show deadbeef^:tasks/0001-land.md": { stdout: task("0001", "doing") },
        "git worktree list --porcelain": {
          stdout: "worktree /r\nbranch refs/heads/task/0001-land\n",
        },
        "git log --reverse --no-merges --format=%s origin/main..HEAD": {
          stdout: "feat(0001): work\n",
        },
        "git show-ref --verify --quiet refs/heads/task/0001-land": { status: 1 },
        "gh pr list --head task/0001-land --state open --json url": { stdout: "[]" },
        ...(options.conflict
          ? {
              "git merge --no-edit origin/main": { status: 1, stderr: "CONFLICT" },
              "git diff --name-only --diff-filter=U": { stdout: "PLAN.md\n" },
            }
          : {}),
      };
      const runner: CommandRunner = (command, args) => {
        calls.push([command, ...args]);
        if (command === "gh" && args[1] === "create") return ok(`${PR_URL}\n`);
        if (command === "gh" && args[1] === "checks") {
          const replies = options.checks ?? [checks(["ci", "pass"])];
          const reply = replies[Math.min(polls++, replies.length - 1)]!;
          return {
            status: reply.status ?? 0,
            stdout: reply.stdout ?? "",
            stderr: reply.stderr ?? "",
          };
        }
        const reply = responses[[command, ...args].join(" ")] ?? {};
        return {
          status: reply.status ?? 0,
          stdout: reply.stdout ?? "",
          stderr: reply.stderr ?? "",
        };
      };
      return { calls, runner };
    };

    const startRoot = dir({
      "PLAN.md": "### M1\n- [ ] 0001\n",
      "tasks/0001-land.md": task("0001", "todo"),
    });
    const started = fakeRunner({
      "git branch --show-current": { stdout: "main\n" },
      "git show-ref --verify --quiet refs/heads/task/0001-land": { status: 1 },
    });
    startTask(startRoot, "0001", started.runner);

    const mergeRoot = dir({
      "PLAN.md": "### M1\n- [ ] 0001\n",
      "tasks/0001-land.md": task("0001", "doing"),
    });
    const merged = fakeRunner({
      "git branch --show-current": { stdout: "task/0001-land\n" },
      "git rev-list --count task/0001-land..worker": { stdout: "1" },
    });
    mergeTask(mergeRoot, "0001", { branch: "worker" }, merged.runner);

    const landRoot = dir({ ".github/pull_request_template.md": template });
    const success = makeFakeLand({ checks: [NO_CHECKS, checks(["ci", "pass"])] });
    landTask(landRoot, "0001", { ...quiet, runner: success.runner });

    const failing = makeFakeLand({ checks: [checks(["ci", "fail"])] });
    expect(() => landTask(landRoot, "0001", { ...quiet, runner: failing.runner })).toThrow();

    const conflicting = makeFakeLand({ conflict: true });
    expect(() => landTask(landRoot, "0001", { ...quiet, runner: conflicting.runner })).toThrow();

    const all = [started, merged, success, failing, conflicting].flatMap((run) => run.calls);
    expect(all.some(([command, , sub]) => command === "gh" && sub === "merge")).toBe(true);
    const taskPush = ["git", "push", "-u", "origin", "task/0001-land"];
    expect(pushes(all)).toEqual([taskPush, taskPush]);
    expect(
      all.some((call) => call[0] === "git" && call.includes("push") && call.includes("main")),
    ).toBe(false);
  });

  test("defaults PR check polling to DEFAULT_LAND_POLL_MS", () => {
    const landRoot = dir({ ".github/pull_request_template.md": template });
    let polls = 0;
    const sleeps: number[] = [];
    const runner: CommandRunner = (command, args) => {
      const key = [command, ...args].join(" ");
      if (key === "git branch --show-current") return ok("task/0001-land\n");
      if (key === "git log --format=%H %s --fixed-strings --grep=chore(0001): done HEAD")
        return ok("deadbeef chore(0001): done\n");
      if (key === "git diff --name-only --diff-filter=D deadbeef^ deadbeef -- tasks")
        return ok("tasks/0001-land.md\n");
      if (key === "git show deadbeef^:tasks/0001-land.md") return ok(task("0001", "doing"));
      if (key === "git show-ref --verify --quiet refs/heads/task/0001-land")
        return { status: 1, stdout: "", stderr: "" };
      if (command === "gh" && args[1] === "list") return ok(JSON.stringify([{ url: PR_URL }]));
      if (command === "gh" && args[1] === "checks") {
        const reply = polls++ === 0 ? checks(["ci", "pending"]) : checks(["ci", "pass"]);
        return {
          status: reply.status ?? 0,
          stdout: reply.stdout ?? "",
          stderr: reply.stderr ?? "",
        };
      }
      return ok();
    };
    expect(DEFAULT_LAND_POLL_MS).toBe(5_000);
    landTask(landRoot, "0001", { ...quiet, runner, sleep: (ms) => sleeps.push(ms) });
    expect(sleeps).toEqual([DEFAULT_LAND_POLL_MS]);
  });
});
