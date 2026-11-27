import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import {
  type BriefOptions,
  UsageError,
  briefTask,
  cleanReport,
  cleanTasks,
  findingItems,
  parseBriefArgs,
  parseCleanArgs,
} from "./tasks-ops.ts";
import {
  type CommandResult,
  type CommandRunner,
  DEFAULT_LAND_POLL_MS,
  handoffBranch,
  landTask,
  mergeTask,
  nextTasks,
  pullRequestBody,
  pullRequestTitle,
  readyTasks,
  resolvePlanCheckboxConflict,
  startTask,
  taskWorktreePath,
  updatedPlan,
  usageText,
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
  const root = dir({ ".gitignore": "node_modules/\n.cache/\n", ...files });
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
  for (const [name, content] of Object.entries(files)) {
    const full = join(cwd, name);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
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

/** Real local git, with the network edges (fetch, push, gh) and bun simulated. */
function simulated(options: { prs?: string[]; checks?: Reply[]; failVerify?: boolean } = {}) {
  const calls: string[][] = [];
  let checkPolls = 0;
  const runner: CommandRunner = (command, args, cwd) => {
    calls.push([command, ...args]);
    if (command === "bun") {
      if (options.failVerify && args[0] === "run" && args[1] === "verify") {
        return { status: 1, stdout: "", stderr: "verify failed" };
      }
      return ok();
    }
    if (command === "git" && args[0] === "fetch") {
      if (args[1] === "origin" && args[2] === "main:main") {
        const listed = real("git", ["worktree", "list", "--porcelain"], cwd).stdout;
        if (listed.includes("branch refs/heads/main\n")) {
          return { status: 1, stdout: "", stderr: "refusing to fetch into checked out branch" };
        }
        const canFf = real("git", ["merge-base", "--is-ancestor", "main", "origin/main"], cwd);
        if (canFf.status !== 0) {
          return { status: 1, stdout: "", stderr: "non-fast-forward" };
        }
        return real("git", ["update-ref", "refs/heads/main", "origin/main"], cwd);
      }
      return ok();
    }
    if (command === "git" && args[0] === "push") return ok();
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

/** A task started from origin/main in its worktree, worked in a worktree, and merged as done. */
function doneTask(
  handoff = "```\nBranch/commit: worker @ abc\nVerify: 1 pass\n```\n",
  plan = "### M1\n- [ ] 0001\n",
) {
  const root = repo({
    "PLAN.md": plan,
    ".github/pull_request_template.md": template,
    "tasks/0001-land.md": task("0001", "todo"),
  });
  const sim = simulated();
  startTask(root, "0001", sim.runner);
  const taskWt = taskWorktreePath(root, "0001-land.md");
  const workerPath = worktree(root, "worker", "task/0001-land");
  commit(workerPath, { "work.txt": "work\n" }, "feat(0001): the work");
  commit(
    workerPath,
    { "tasks/0001-land.md": task("0001", "doing", "[]", handoff) },
    "chore(0001): handoff",
  );
  mergeTask(root, "0001", { branch: "worker" }, sim.runner);
  return { root, taskWt, workerPath, calls: sim.calls };
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

describe("handoffBranch", () => {
  test("extracts branch names from filled Handoff blocks and ignores placeholders", () => {
    expect(
      handoffBranch(task("0001", "doing", "[]", "```\nBranch/commit: t3/abc123 @ deadbeef\n```")),
    ).toBe("t3/abc123");
    expect(handoffBranch(task("0001", "doing", "[]", "Branch/commit: t3/0200-ci-numbers\n"))).toBe(
      "t3/0200-ci-numbers",
    );
    expect(
      handoffBranch(task("0001", "doing", "[]", "Branch/commit: `worker-branch` @ 1234 (extra)\n")),
    ).toBe("worker-branch");
    expect(
      handoffBranch(task("0001", "doing", "[]", "```\nBranch/commit:\nVerify: ok\n```")),
    ).toBeUndefined();
    expect(
      handoffBranch(task("0001", "doing", "[]", "```\nBranch/commit: <branch> @ <sha>\n```")),
    ).toBeUndefined();
  });
});

describe("resolvePlanCheckboxConflict", () => {
  test("keeps every [x] from both sides in merge and diff3 conflicts", () => {
    const mergeConflict = [
      "### M19",
      "<<<<<<< HEAD",
      "- [ ] 0201 Task one",
      "- [x] 0202 Task two",
      "=======",
      "- [x] 0201 Task one",
      "- [ ] 0202 Task two",
      ">>>>>>> origin/main",
      "- [ ] 0203 Task three",
    ].join("\n");
    expect(resolvePlanCheckboxConflict(mergeConflict)).toBe(
      ["### M19", "- [x] 0201 Task one", "- [x] 0202 Task two", "- [ ] 0203 Task three"].join("\n"),
    );

    const diff3Conflict = [
      "### M19",
      "<<<<<<< HEAD",
      "- [ ] 0201 Task one",
      "      continuation",
      "- [x] 0202 Task two",
      "||||||| base",
      "- [ ] 0201 Task one",
      "      continuation",
      "- [ ] 0202 Task two",
      "=======",
      "- [x] 0201 Task one",
      "      continuation",
      "- [ ] 0202 Task two",
      ">>>>>>> origin/main",
    ].join("\n");
    expect(resolvePlanCheckboxConflict(diff3Conflict)).toBe(
      ["### M19", "- [x] 0201 Task one", "      continuation", "- [x] 0202 Task two"].join("\n"),
    );
  });

  test("rejects text changes, prose conflicts, line-count mismatches, and non-conflicted files", () => {
    const editedText = [
      "<<<<<<< HEAD",
      "- [x] 0001",
      "=======",
      "- [ ] 0001 changed upstream",
      ">>>>>>> origin/main",
    ].join("\n");
    expect(resolvePlanCheckboxConflict(editedText)).toBeUndefined();

    const prose = ["<<<<<<< HEAD", "foo", "=======", "bar", ">>>>>>> origin/main"].join("\n");
    expect(resolvePlanCheckboxConflict(prose)).toBeUndefined();

    const differentCounts = [
      "<<<<<<< HEAD",
      "- [x] 0001",
      "=======",
      "- [x] 0001",
      "- [x] 0002",
      ">>>>>>> origin/main",
    ].join("\n");
    expect(resolvePlanCheckboxConflict(differentCounts)).toBeUndefined();

    expect(resolvePlanCheckboxConflict("### M1\n- [x] 0001\n")).toBeUndefined();
  });
});

describe("tasks:start", () => {
  test("creates a per-task worktree from origin/main, moves an untracked task file, and leaves primary untouched", () => {
    const root = repo({ "PLAN.md": "# Plan\n" });
    commit(root, { "local.txt": "unpushed\n" }, "local only");
    const primaryHead = git(root, "rev-parse", "HEAD");
    mkdirSync(join(root, "tasks"));
    writeFileSync(join(root, "tasks/0001-start.md"), task("0001", "todo"));
    const { calls, runner } = simulated();
    const brief = startTask(root, "0001", runner);
    const taskWt = taskWorktreePath(root, "0001-start.md");

    expect(brief).toBe("Follow AGENTS.md. You are the Worker for `tasks/0001-start.md`.");
    expect(calls).toContainEqual(["git", "fetch", "origin"]);
    expect(calls.some(([, sub]) => sub === "switch")).toBe(false);

    // Primary checkout stayed on main at its original HEAD with clean working tree.
    expect(git(root, "branch", "--show-current")).toBe("main");
    expect(git(root, "rev-parse", "HEAD")).toBe(primaryHead);
    expect(existsSync(join(root, "local.txt"))).toBe(true);
    expect(existsSync(join(root, "tasks/0001-start.md"))).toBe(false);
    expect(git(root, "status", "--porcelain")).toBe("");

    // Task worktree holds task/0001-start branched from origin/main with status: doing.
    expect(git(taskWt, "branch", "--show-current")).toBe("task/0001-start");
    expect(git(taskWt, "rev-parse", "HEAD^")).toBe(git(root, "rev-parse", "origin/main"));
    expect(git(taskWt, "show", "-s", "--format=%s", "HEAD")).toBe("chore: start 0001 (Task 0001)");
    expect(git(taskWt, "show", "HEAD:tasks/0001-start.md")).toContain("status: doing");
    expect(existsSync(join(taskWt, "local.txt"))).toBe(false);
    expect(git(taskWt, "status", "--porcelain")).toBe("");
    // Gitignored task worktree files are never surfaced by git ls-files discovery.
    expect(git(root, "ls-files", "--cached", "--others", "--exclude-standard")).not.toContain(
      ".cache/",
    );
  });

  test("leaves a task file committed on local main intact while starting in the worktree", () => {
    const root = repo({ "PLAN.md": "# Plan\n" });
    commit(root, { "tasks/0001-start.md": task("0001", "todo") }, "docs: task 0001");
    const primaryHead = git(root, "rev-parse", "HEAD");
    startTask(root, "0001", simulated().runner);
    const taskWt = taskWorktreePath(root, "0001-start.md");

    expect(git(root, "branch", "--show-current")).toBe("main");
    expect(git(root, "rev-parse", "HEAD")).toBe(primaryHead);
    expect(git(root, "status", "--porcelain")).toBe("");
    expect(existsSync(join(root, "tasks/0001-start.md"))).toBe(true);
    expect(git(taskWt, "rev-parse", "HEAD^")).toBe(git(root, "rev-parse", "origin/main"));
    expect(git(taskWt, "show", "HEAD:tasks/0001-start.md")).toContain("status: doing");
  });

  test("works even when the primary checkout has other uncommitted files or is on another branch", () => {
    const root = repo({ "PLAN.md": "# Plan\n" });
    git(root, "switch", "-q", "-c", "elsewhere");
    const primaryHead = git(root, "rev-parse", "HEAD");
    writeFileSync(join(root, "PLAN.md"), "dirty\n");
    mkdirSync(join(root, "tasks"), { recursive: true });
    writeFileSync(join(root, "tasks/0001-start.md"), task("0001", "todo"));
    writeFileSync(join(root, "tasks/0002-other.md"), task("0002", "todo"));

    startTask(root, "0001", simulated().runner);
    const taskWt = taskWorktreePath(root, "0001-start.md");

    expect(git(root, "branch", "--show-current")).toBe("elsewhere");
    expect(git(root, "rev-parse", "HEAD")).toBe(primaryHead);
    expect(readFileSync(join(root, "PLAN.md"), "utf8")).toBe("dirty\n");
    expect(existsSync(join(root, "tasks/0001-start.md"))).toBe(false);
    expect(existsSync(join(root, "tasks/0002-other.md"))).toBe(true);
    expect(git(taskWt, "branch", "--show-current")).toBe("task/0001-start");
  });

  test("adds an optional co-author trailer", () => {
    const root = repo({ "PLAN.md": "# Plan\n", "tasks/0001-start.md": task("0001", "todo") });
    startTask(root, "0001", { coAuthor: "Alice <alice@example.com>" }, simulated().runner);
    const taskWt = taskWorktreePath(root, "0001-start.md");
    expect(git(taskWt, "show", "-s", "--format=%B", "HEAD")).toContain(
      "Co-Authored-By: Alice <alice@example.com>",
    );
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

/** A started task in its own worktree, leaving primary on clean main. */
function startedTask(plan = "### M1\n- [ ] 0001\n") {
  const root = repo({
    "PLAN.md": plan,
    "bun.lock": "{}\n",
    "tasks/0001-merge.md": task("0001", "todo"),
  });
  startTask(root, "0001", simulated().runner);
  return { root, taskWt: taskWorktreePath(root, "0001-merge.md") };
}

describe("tasks:merge", () => {
  test("refuses when no task worktree exists for the id", () => {
    const root = repo({
      "PLAN.md": "### M1\n- [ ] 0001\n",
      "tasks/0001-merge.md": task("0001", "doing"),
    });
    const { calls, runner } = simulated();
    expect(() => mergeTask(root, "0001", { branch: "worker" }, runner)).toThrow(
      "no task worktree found for 0001",
    );
    expect(calls.some(([, sub]) => sub === "merge")).toBe(false);
  });

  test("works from any checkout and leaves the primary checkout unchanged", () => {
    const { root, taskWt } = startedTask();
    const primaryHead = git(root, "rev-parse", "HEAD");
    const callerWt = worktree(root, "caller", "main");
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
    // Run mergeTask from an unrelated checkout (`callerWt`).
    mergeTask(callerWt, "0001", {}, runner);

    expect(calls).toContainEqual(["git", "rev-list", "--count", "task/0001-merge..round-two"]);
    expect(git(taskWt, "show", "-s", "--format=%s", "HEAD")).toBe("chore(0001): done");
    expect(git(taskWt, "rev-parse", "HEAD^^2")).toBe(git(root, "rev-parse", "round-two"));
    expect(git(taskWt, "branch", "--show-current")).toBe("task/0001-merge");

    // Primary checkout and caller checkout never moved.
    expect(git(root, "branch", "--show-current")).toBe("main");
    expect(git(root, "rev-parse", "HEAD")).toBe(primaryHead);
    expect(git(root, "status", "--porcelain")).toBe("");
    expect(git(callerWt, "branch", "--show-current")).toBe("caller");
  });

  test("picks the branch named on the task Handoff Branch/commit: line", () => {
    const { root, taskWt } = startedTask();
    const workerPath = worktree(root, "t3/my-worker", "task/0001-merge");
    commit(workerPath, { "work.txt": "from handoff\n" }, "feat(0001): work");
    // A second unrelated candidate at a different commit that would otherwise be ambiguous.
    const rivalPath = worktree(root, "t3/0001-merge-rival", "task/0001-merge");
    commit(rivalPath, { "rival.txt": "rival\n" }, "feat(0001): rival");
    // Record Handoff branch in the task worktree's task file.
    commit(
      taskWt,
      {
        "tasks/0001-merge.md": task(
          "0001",
          "doing",
          "[]",
          "```\nBranch/commit: t3/my-worker @ abc123\n```\n",
        ),
      },
      "chore(0001): record handoff",
    );

    mergeTask(root, "0001", {}, simulated().runner);
    expect(readFileSync(join(taskWt, "work.txt"), "utf8")).toBe("from handoff\n");
    expect(existsSync(join(taskWt, "rival.txt"))).toBe(false);
    expect(git(taskWt, "show", "-s", "--format=%s", "HEAD")).toBe("chore(0001): done");
  });

  test("ignores a stale Handoff branch that was not forked from the task branch", () => {
    const { root, taskWt } = startedTask();
    // The real worker, found by the scan through the task slug in its name.
    const workerPath = worktree(root, "t3/0001-merge-worker", "task/0001-merge");
    commit(workerPath, { "work.txt": "real\n" }, "feat(0001): work");
    // A stale branch that exists and has unrelated commits, but never contained the task branch.
    const stalePath = worktree(root, "t3/stale", "main");
    commit(stalePath, { "stale.txt": "unrelated\n" }, "feat(0099): unrelated");
    commit(
      taskWt,
      {
        "tasks/0001-merge.md": task(
          "0001",
          "doing",
          "[]",
          "```\nBranch/commit: t3/stale @ abc123\n```\n",
        ),
      },
      "chore(0001): stale handoff",
    );

    mergeTask(root, "0001", {}, simulated().runner);
    expect(readFileSync(join(taskWt, "work.txt"), "utf8")).toBe("real\n");
    expect(existsSync(join(taskWt, "stale.txt"))).toBe(false);
    expect(git(taskWt, "show", "-s", "--format=%s", "HEAD^")).toContain("t3/0001-merge-worker");
  });

  test("counts branches at the same commit once and prefers the Handoff branch name", () => {
    const { root, taskWt } = startedTask();
    const workerPath = worktree(root, "z-worker", "task/0001-merge");
    commit(
      workerPath,
      {
        "work.txt": "ok\n",
        "tasks/0001-merge.md": task(
          "0001",
          "doing",
          "[]",
          "```\nBranch/commit: z-worker @ deadbeef\n```\n",
        ),
      },
      "feat(0001): work",
    );
    // Reviewer worktree sits on the exact same commit, with an alphabetically earlier branch name.
    worktree(root, "a-reviewer", "z-worker");

    mergeTask(root, "0001", {}, simulated().runner);
    expect(git(taskWt, "show", "-s", "--format=%s", "HEAD")).toBe("chore(0001): done");
    expect(git(taskWt, "show", "-s", "--format=%s", "HEAD^")).toContain("z-worker");
  });

  test("still rejects two genuinely different candidate branches", () => {
    const wtRoot = dir({
      "PLAN.md": "### M1\n- [ ] 0001\n",
      "tasks/0001-merge.md": task("0001", "doing"),
    });
    const { runner } = fakeRunner({
      "git worktree list --porcelain": {
        stdout: [
          "worktree /r",
          "HEAD 0000000",
          "branch refs/heads/main",
          `worktree ${wtRoot}`,
          "HEAD 1111111",
          "branch refs/heads/task/0001-merge",
          "worktree /tmp/one",
          "HEAD 2222222",
          "branch refs/heads/one",
          "worktree /tmp/two",
          "HEAD 3333333",
          "branch refs/heads/two",
          "",
        ].join("\n"),
      },
      "git diff --name-only task/0001-merge...one -- tasks/0001-merge.md": {
        stdout: "tasks/0001-merge.md\n",
      },
      "git diff --name-only task/0001-merge...two -- tasks/0001-merge.md": {
        stdout: "tasks/0001-merge.md\n",
      },
    });
    expect(() => mergeTask("/r", "0001", {}, runner)).toThrow(
      "expected one worker branch for 0001-merge.md; candidates: one, two",
    );
  });

  test("ticks a PLAN.md line that was added on the worker branch", () => {
    const { root, taskWt } = startedTask("### M1\n- [x] 0000 existing\n");
    const workerPath = worktree(root, "worker", "task/0001-merge");
    commit(
      workerPath,
      { "PLAN.md": "### M1\n- [x] 0000 existing\n- [ ] 0001 added on worker\n" },
      "feat(0001): add plan line and work",
    );

    mergeTask(root, "0001", { branch: "worker" }, simulated().runner);
    expect(readFileSync(join(taskWt, "PLAN.md"), "utf8")).toContain("- [x] 0001 added on worker");
    expect(git(taskWt, "show", "-s", "--format=%s", "HEAD")).toBe("chore(0001): done");
  });

  test("ticks PLAN, installs in a fresh worktree, deletes the task and commits done", () => {
    const { root, taskWt } = startedTask();
    const workerPath = worktree(root, "worker", "task/0001-merge");
    commit(workerPath, { "work.txt": "work\n" }, "feat(0001): work");
    const { calls, runner } = simulated();
    mergeTask(root, "0001", { branch: "worker", coAuthor: "Alice <alice@example.com>" }, runner);
    expect(readFileSync(join(taskWt, "PLAN.md"), "utf8")).toContain("- [x] 0001");
    expect(existsSync(join(taskWt, "tasks/0001-merge.md"))).toBe(false);
    expect(git(taskWt, "show", "-s", "--format=%B", "HEAD")).toBe(
      "chore(0001): done\n\nCo-Authored-By: Alice <alice@example.com>",
    );
    const bun = calls.filter(([command]) => command === "bun").map((call) => call.join(" "));
    expect(bun).toEqual([
      "bun install --frozen-lockfile",
      "bun run check:workflow",
      "bun run verify",
    ]);
  });

  test("reinstalls only when bun.lock changes once node_modules exists", () => {
    for (const changesLock of [true, false]) {
      const { root, taskWt } = startedTask();
      mkdirSync(join(taskWt, "node_modules"));
      const workerPath = worktree(root, "worker", "task/0001-merge");
      commit(workerPath, { [changesLock ? "bun.lock" : "work.txt"]: "{ }\n" }, "feat(0001): work");
      const { calls, runner } = simulated();
      mergeTask(root, "0001", { branch: "worker" }, runner);
      expect(calls.some((call) => call.join(" ") === "bun install --frozen-lockfile")).toBe(
        changesLock,
      );
    }
  });

  test("aborts a merge conflict and does not delete the task", () => {
    const wtRoot = dir({
      "PLAN.md": "### M1\n- [ ] 0001\n",
      "tasks/0001-merge.md": task("0001", "doing"),
    });
    const { calls, runner } = fakeRunner({
      "git worktree list --porcelain": {
        stdout: `worktree /r\nbranch refs/heads/main\nworktree ${wtRoot}\nbranch refs/heads/task/0001-merge\n`,
      },
      "git rev-list --count task/0001-merge..worker": { stdout: "1" },
      "git merge --no-ff worker": { status: 1, stderr: "conflict" },
    });
    expect(() => mergeTask("/r", "0001", { branch: "worker" }, runner)).toThrow(
      "merge was aborted",
    );
    expect(calls).toContainEqual(["git", "merge", "--abort"]);
    expect(readFileSync(join(wtRoot, "tasks/0001-merge.md"), "utf8")).toContain("status: doing");
  });

  test("refuses a worker that is not ahead of the task branch", () => {
    const { root } = startedTask();
    git(root, "branch", "worker", "task/0001-merge");
    expect(() => mergeTask(root, "0001", { branch: "worker" }, simulated().runner)).toThrow(
      "branch worker is not ahead of task/0001-merge",
    );
  });

  test("requires a plan argument when the checklist line is absent after merge, and --resume --plan finishes it", () => {
    const { root, taskWt } = startedTask("### M1\n- [x] 0000 prev\n");
    const workerPath = worktree(root, "worker", "task/0001-merge");
    commit(workerPath, { "work.txt": "work\n" }, "feat(0001): work");

    expect(() => mergeTask(root, "0001", { branch: "worker" }, simulated().runner)).toThrow(
      "pass --plan",
    );
    // Task file was preserved and worker merge commit is in place.
    expect(existsSync(join(taskWt, "tasks/0001-merge.md"))).toBe(true);

    mergeTask(root, "0001", { resume: true, plan: "0001 finished" }, simulated().runner);
    expect(readFileSync(join(taskWt, "PLAN.md"), "utf8")).toContain("- [x] 0001 finished");
    expect(existsSync(join(taskWt, "tasks/0001-merge.md"))).toBe(false);
    expect(git(taskWt, "show", "-s", "--format=%s", "HEAD")).toBe("chore(0001): done");
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

  test("--resume finishes a merge after verify failed under load", () => {
    const { root, taskWt } = startedTask();
    const primaryHead = git(root, "rev-parse", "HEAD");
    const workerPath = worktree(root, "worker", "task/0001-merge");
    commit(workerPath, { "work.txt": "work\n" }, "feat(0001): work");

    const failedRun = simulated({ failVerify: true });
    expect(() => mergeTask(root, "0001", { branch: "worker" }, failedRun.runner)).toThrow(
      "run verify failed",
    );
    const mergeHead = git(taskWt, "rev-parse", "HEAD");
    expect(existsSync(join(taskWt, "tasks/0001-merge.md"))).toBe(false);
    expect(readFileSync(join(taskWt, "PLAN.md"), "utf8")).toContain("- [x] 0001");

    const resumed = simulated();
    mergeTask(root, "0001", { resume: true, coAuthor: "Bob <bob@example.com>" }, resumed.runner);
    expect(resumed.calls.some(([cmd, sub]) => cmd === "git" && sub === "merge")).toBe(false);
    expect(git(taskWt, "rev-parse", "HEAD^")).toBe(mergeHead);
    expect(git(taskWt, "show", "-s", "--format=%B", "HEAD")).toBe(
      "chore(0001): done\n\nCo-Authored-By: Bob <bob@example.com>",
    );
    expect(git(taskWt, "status", "--porcelain")).toBe("");
    expect(git(root, "rev-parse", "HEAD")).toBe(primaryHead);
    expect(git(root, "branch", "--show-current")).toBe("main");
  });

  test("--resume refuses when no worker merge commit exists, already done, or combined with --branch", () => {
    const { root } = startedTask();
    expect(() =>
      mergeTask(root, "0001", { resume: true, branch: "worker" }, simulated().runner),
    ).toThrow("--resume cannot be combined with --branch");
    expect(() => mergeTask(root, "0001", { resume: true }, simulated().runner)).toThrow(
      "no worker merge commit",
    );

    const workerPath = worktree(root, "worker", "task/0001-merge");
    commit(workerPath, { "work.txt": "work\n" }, "feat(0001): work");
    mergeTask(root, "0001", { branch: "worker" }, simulated().runner);
    expect(() => mergeTask(root, "0001", { resume: true }, simulated().runner)).toThrow(
      "already has a chore(0001): done commit",
    );
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
  test("lands from any checkout, fast-forwards clean primary main without switching, and cleans up worktrees", () => {
    const { root, taskWt, workerPath } = doneTask();
    // Simulate installed dependencies inside the task worktree to confirm forced removal cleans them up.
    mkdirSync(join(taskWt, "node_modules", "pkg"), { recursive: true });
    writeFileSync(join(taskWt, "node_modules", "pkg", "index.js"), "export {};\n");
    const callerWt = worktree(root, "caller", "main");
    const oldPath = worktree(root, "old", "origin/main");
    const otherPath = worktree(root, "other", "origin/main");
    commit(otherPath, { "other.txt": "other\n" }, "feat(0002): other task");
    advanceOrigin(root, "upstream.txt", "upstream\n");
    const sleeps: number[] = [];
    const logs: string[] = [];
    const { calls, runner } = simulated({
      checks: [
        NO_CHECKS,
        checks(["ci", "pending"], ["lint", "pass"]),
        checks(["ci", "pass"], ["lint", "skipping"]),
      ],
    });

    const url = landTask(callerWt, "0001", {
      ...quiet,
      runner,
      pollMs: 5,
      sleep: (ms) => sleeps.push(ms),
      log: (line) => logs.push(line),
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
    // Never runs git switch.
    expect(calls.some(([cmd, sub]) => cmd === "git" && sub === "switch")).toBe(false);
    expect(calls).toContainEqual(["gh", "pr", "merge", PR_URL, "--merge"]);
    expect(sleeps).toEqual([5, 5]);
    expect(logs.some((line) => line.includes("fast-forwarded primary checkout"))).toBe(true);

    // Primary checkout stayed on main and fast-forwarded cleanly.
    expect(git(root, "branch", "--show-current")).toBe("main");
    expect(git(root, "rev-parse", "main")).toBe(git(root, "rev-parse", "origin/main"));
    expect(readFileSync(join(root, "upstream.txt"), "utf8")).toBe("upstream\n");
    expect(readFileSync(join(root, "work.txt"), "utf8")).toBe("work\n");

    // Task worktree and merged worker worktree were removed; unrelated worktrees kept.
    expect(existsSync(taskWt)).toBe(false);
    expect(existsSync(workerPath)).toBe(false);
    const branches = git(root, "branch", "--format=%(refname:short)").split("\n").toSorted();
    expect(branches).toEqual(["caller", "main", "old", "other"]);
    expect(existsSync(callerWt) && existsSync(oldPath) && existsSync(otherPath)).toBe(true);
  });

  test("updates local main via git fetch origin main:main when primary is on another branch", () => {
    const { root, taskWt, workerPath } = doneTask();
    git(root, "switch", "-q", "-c", "elsewhere");
    const primaryHead = git(root, "rev-parse", "HEAD");
    writeFileSync(join(root, "scratch.txt"), "keep me\n");
    const logs: string[] = [];
    const { calls, runner } = simulated();

    expect(landTask(root, "0001", { ...quiet, runner, log: (line) => logs.push(line) })).toBe(
      PR_URL,
    );

    expect(calls).toContainEqual(["git", "fetch", "origin", "main:main"]);
    expect(logs.some((line) => line.includes("git fetch origin main:main"))).toBe(true);
    // Primary checkout's HEAD, branch and working tree did not change.
    expect(git(root, "branch", "--show-current")).toBe("elsewhere");
    expect(git(root, "rev-parse", "HEAD")).toBe(primaryHead);
    expect(readFileSync(join(root, "scratch.txt"), "utf8")).toBe("keep me\n");
    // Local main ref was still updated to origin/main, and worktrees were cleaned up.
    expect(git(root, "rev-parse", "main")).toBe(git(root, "rev-parse", "origin/main"));
    expect(existsSync(taskWt)).toBe(false);
    expect(existsSync(workerPath)).toBe(false);
  });

  test("leaves a dirty primary checkout on main completely untouched and reports it", () => {
    const { root, taskWt, workerPath } = doneTask();
    const primaryHead = git(root, "rev-parse", "HEAD");
    writeFileSync(join(root, "PLAN.md"), "dirty primary\n");
    const logs: string[] = [];
    const { calls, runner } = simulated();

    expect(landTask(root, "0001", { ...quiet, runner, log: (line) => logs.push(line) })).toBe(
      PR_URL,
    );

    expect(calls.some((call) => call.join(" ") === "git merge --ff-only origin/main")).toBe(false);
    expect(logs.some((line) => line.includes("uncommitted changes"))).toBe(true);
    expect(git(root, "branch", "--show-current")).toBe("main");
    expect(git(root, "rev-parse", "HEAD")).toBe(primaryHead);
    expect(readFileSync(join(root, "PLAN.md"), "utf8")).toBe("dirty primary\n");
    expect(existsSync(taskWt)).toBe(false);
    expect(existsSync(workerPath)).toBe(false);
  });

  test("auto-resolves PLAN.md checkbox-only conflicts from parallel tasks", () => {
    const initialPlan = "### M1\n- [ ] 0001 first\n- [ ] 0002 second\n- [ ] 0003 third\n";
    const { root } = doneTask(undefined, initialPlan);
    // Parallel task 0002 landed on origin/main, ticking the neighbouring line.
    advanceOrigin(
      root,
      "PLAN.md",
      "### M1\n- [ ] 0001 first\n- [x] 0002 second\n- [ ] 0003 third\n",
    );
    const { runner } = simulated();

    expect(landTask(root, "0001", { ...quiet, runner })).toBe(PR_URL);
    expect(readFileSync(join(root, "PLAN.md"), "utf8")).toBe(
      "### M1\n- [x] 0001 first\n- [x] 0002 second\n- [ ] 0003 third\n",
    );
  });

  test("aborts a non-checkbox PLAN.md conflict and names the file", () => {
    const { root, taskWt } = doneTask();
    advanceOrigin(root, "PLAN.md", "### M1\n- [ ] 0001 changed upstream\n");
    const head = git(taskWt, "rev-parse", "HEAD");
    const primaryHead = git(root, "rev-parse", "HEAD");
    const { calls, runner } = simulated();
    expect(() => landTask(root, "0001", { ...quiet, runner })).toThrow(
      "merging origin/main into task/0001-land failed; merge was aborted; conflicts: PLAN.md",
    );
    expect(calls).toContainEqual(["git", "merge", "--abort"]);
    expect(git(taskWt, "rev-parse", "HEAD")).toBe(head);
    expect(git(taskWt, "status", "--porcelain")).toBe("");
    expect(git(root, "rev-parse", "HEAD")).toBe(primaryHead);
    expect(pushes(calls)).toEqual([]);
  });

  test("aborts when another file conflicts alongside a PLAN.md checkbox conflict", () => {
    const initialPlan = "### M1\n- [ ] 0001 first\n- [ ] 0002 second\n";
    const { root, taskWt } = doneTask(undefined, initialPlan);
    advanceOrigin(root, "PLAN.md", "### M1\n- [ ] 0001 first\n- [x] 0002 second\n");
    advanceOrigin(root, "work.txt", "upstream conflict\n");
    const head = git(taskWt, "rev-parse", "HEAD");
    const { calls, runner } = simulated();
    expect(() => landTask(root, "0001", { ...quiet, runner })).toThrow(
      "conflicts: PLAN.md, work.txt",
    );
    expect(calls).toContainEqual(["git", "merge", "--abort"]);
    expect(git(taskWt, "rev-parse", "HEAD")).toBe(head);
    expect(pushes(calls)).toEqual([]);
  });

  test("reuses an open PR and allows fix commits after the done commit", () => {
    const { root, taskWt } = doneTask();
    commit(taskWt, { "fix.txt": "fix\n" }, "fix(0001): review finding");
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
    expect(calls).toContainEqual(["gh", "pr", "merge", existing, "--merge"]);
    expect(readFileSync(join(root, "fix.txt"), "utf8")).toBe("fix\n");
  });

  test("stops on a failed check without merging or cleaning up", () => {
    const { root, taskWt, workerPath } = doneTask();
    const primaryHead = git(root, "rev-parse", "HEAD");
    const { calls, runner } = simulated({
      checks: [checks(["ci", "fail"], ["lint", "pass"], ["e2e", "cancel"])],
    });
    expect(() => landTask(root, "0001", { ...quiet, runner })).toThrow("checks failed: ci, e2e");
    expect(calls.some(([command, , sub]) => command === "gh" && sub === "merge")).toBe(false);
    expect(git(root, "branch", "--show-current")).toBe("main");
    expect(git(root, "rev-parse", "HEAD")).toBe(primaryHead);
    expect(existsSync(taskWt)).toBe(true);
    expect(existsSync(workerPath)).toBe(true);
  });

  test("times out on pending checks and lists them", () => {
    const { root, taskWt, workerPath } = doneTask();
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
    expect(existsSync(taskWt)).toBe(true);
    expect(existsSync(workerPath)).toBe(true);
  });

  test("refuses a missing task worktree, a dirty task worktree, or a branch without the done commit", () => {
    const { root, taskWt } = startedTask();
    const { calls, runner } = simulated();
    expect(() => landTask(root, "9999", { ...quiet, runner })).toThrow(
      "no task worktree found for 9999",
    );
    expect(() => landTask(root, "0001", { ...quiet, runner })).toThrow(
      "no chore(0001): done commit",
    );
    writeFileSync(join(taskWt, "PLAN.md"), "dirty\n");
    expect(() => landTask(root, "0001", { ...quiet, runner })).toThrow("working tree is not clean");
    expect(calls.some(([, sub]) => sub === "fetch" || sub === "push")).toBe(false);
  });

  test("no start, merge or land path runs git push origin main or git switch", () => {
    const makeFakeLand = (
      wtDir: string,
      options: { checks?: Reply[]; conflict?: boolean } = {},
    ) => {
      const calls: string[][] = [];
      let polls = 0;
      const responses: Record<string, Reply> = {
        "git worktree list --porcelain": {
          stdout: `worktree /r\nbranch refs/heads/main\nworktree ${wtDir}\nbranch refs/heads/task/0001-land\n`,
        },
        "git log --format=%H %s --fixed-strings --grep=chore(0001): done HEAD": {
          stdout: "deadbeef chore(0001): done\n",
        },
        "git diff --name-only --diff-filter=D deadbeef^ deadbeef -- tasks": {
          stdout: "tasks/0001-land.md\n",
        },
        "git show deadbeef^:tasks/0001-land.md": { stdout: task("0001", "doing") },
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
      "git show-ref --verify --quiet refs/heads/task/0001-land": { status: 1 },
    });
    startTask(startRoot, "0001", started.runner);

    const mergeWt = dir({
      "PLAN.md": "### M1\n- [ ] 0001\n",
      "tasks/0001-land.md": task("0001", "doing"),
    });
    const merged = fakeRunner({
      "git worktree list --porcelain": {
        stdout: `worktree /r\nbranch refs/heads/main\nworktree ${mergeWt}\nbranch refs/heads/task/0001-land\n`,
      },
      "git rev-list --count task/0001-land..worker": { stdout: "1" },
    });
    mergeTask("/r", "0001", { branch: "worker" }, merged.runner);

    const landWt = dir({ ".github/pull_request_template.md": template });
    const success = makeFakeLand(landWt, { checks: [NO_CHECKS, checks(["ci", "pass"])] });
    landTask("/r", "0001", { ...quiet, runner: success.runner });

    const failing = makeFakeLand(landWt, { checks: [checks(["ci", "fail"])] });
    expect(() => landTask("/r", "0001", { ...quiet, runner: failing.runner })).toThrow();

    const conflicting = makeFakeLand(landWt, { conflict: true });
    expect(() => landTask("/r", "0001", { ...quiet, runner: conflicting.runner })).toThrow();

    const all = [started, merged, success, failing, conflicting].flatMap((run) => run.calls);
    expect(all.some(([command, , sub]) => command === "gh" && sub === "merge")).toBe(true);
    expect(all.some(([command, sub]) => command === "git" && sub === "switch")).toBe(false);
    expect(
      all.some((call) => call[0] === "git" && call.includes("push") && call.includes("main")),
    ).toBe(false);
    expect(pushes(all)).toEqual([
      ["git", "push", "-u", "origin", "task/0001-land"],
      ["git", "push", "origin", "--delete", "task/0001-land"],
      ["git", "push", "-u", "origin", "task/0001-land"],
    ]);
  });

  test("defaults PR check polling to DEFAULT_LAND_POLL_MS", () => {
    const landWt = dir({ ".github/pull_request_template.md": template });
    let polls = 0;
    const sleeps: number[] = [];
    const runner: CommandRunner = (command, args) => {
      const key = [command, ...args].join(" ");
      if (key === "git worktree list --porcelain")
        return ok(
          `worktree /r\nbranch refs/heads/main\nworktree ${landWt}\nbranch refs/heads/task/0001-land\n`,
        );
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
    landTask("/r", "0001", { ...quiet, runner, sleep: (ms) => sleeps.push(ms) });
    expect(sleeps).toEqual([DEFAULT_LAND_POLL_MS]);
  });
});

describe("CLI usage and --help", () => {
  const scriptPath = join(import.meta.dir, "tasks.ts");
  const runCli = (...args: string[]) => {
    const result = Bun.spawnSync(["bun", scriptPath, ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });
    return {
      status: result.exitCode,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    };
  };

  test("--help describes the worktree-based behaviour for start, merge, land and top-level", () => {
    expect(usageText()).toContain(".cache/tasks/");

    const top = runCli("--help");
    expect(top.status).toBe(0);
    expect(top.stdout).toContain(".cache/tasks/<id>-<slug>");
    expect(top.stdout).toContain("--resume");

    const start = runCli("start", "--help");
    expect(start.status).toBe(0);
    expect(start.stdout).toContain(".cache/tasks/<id>-<slug>");
    expect(start.stdout).toContain("primary checkout");

    const merge = runCli("merge", "--help");
    expect(merge.status).toBe(0);
    expect(merge.stdout).toContain("Handoff Branch/commit:");
    expect(merge.stdout).toContain("--resume");
    expect(merge.stdout).toContain("after merging");

    const land = runCli("land", "--help");
    expect(land.status).toBe(0);
    expect(land.stdout).toContain("PLAN.md checkbox-only conflicts");
    expect(land.stdout).toContain("git fetch origin main:main");
    expect(land.stdout).toContain("without switching");
  });

  test("missing <id> prints subcommand usage to stderr and exits 2", () => {
    for (const sub of ["start", "merge", "land"]) {
      const result = runCli(sub);
      expect(result.status).toBe(2);
      expect(result.stderr).toContain(`usage: tasks:${sub}`);
    }
  });
});

const started = () => {
  const root = repo({ "tasks/0001-land.md": task("0001", "doing") });
  git(root, "branch", "task/0001-land");
  return root;
};
const brief = (root: string, options: BriefOptions) => briefTask(root, "0001", options, real);
const shared = (text: string, start: string, land = false) => {
  if (land) {
    expect(text).not.toContain("git reset --hard");
    expect(text).toContain("never run `git reset`, `git switch` or `git checkout` there");
  } else {
    expect(text).toContain(`\`git reset --hard ${start} && bun install --frozen-lockfile\``);
    expect(text).toContain("any commit and has no `node_modules`");
  }
  expect(text).toContain("Do not modify `main`, `task/0001-land`");
  expect(text).toContain("never run two `bun run verify` at once");
  expect(text).toContain("Run long commands in the foreground and wait");
  expect(text).toContain("Keep extra disk usage under 2 GB and delete your scratch files.");
};

describe("tasks:brief", () => {
  test("worker: opener, every rule, start branch, avoided files and the Handoff final message", () => {
    const text = brief(started(), {
      role: "worker",
      diskGb: 2,
      avoid: ["scripts/verify.ts", "a.ts"],
    });
    expect(text.split("\n")[0]).toBe(
      "Follow AGENTS.md. You are the Worker for `tasks/0001-land.md`.",
    );
    shared(text, "task/0001-land");
    expect(text).toContain("Commit in logical commits on your own branch. Do not push.");
    expect(text).toContain("`task/0001-land` is checked out in `.cache/tasks/0001-land`");
    expect(text).toContain("A parallel task owns `scripts/verify.ts`, `a.ts`: do not edit them.");
    expect(text).toContain("never end your turn with uncommitted work");
    expect(text).toContain("final message is only the Handoff block");
    expect(text).not.toContain("findings");
  });

  test("worker round 2 starts from the previous branch and numbers the findings", () => {
    const root = started();
    writeFileSync(join(root, "findings.md"), "1. a.ts:3 drops X\n   when Y\n2) b.ts:9 leaks Z\n");
    const text = brief(root, {
      role: "worker",
      from: "t3/r1",
      round: "2",
      findings: "findings.md",
      diskGb: 2,
    });
    expect(text.split("\n")[0]).toBe(
      "Follow AGENTS.md. You are the Worker for `tasks/0001-land.md`, round 2.",
    );
    shared(text, "t3/r1");
    expect(text).toContain("Do not modify `main`, `task/0001-land`, `t3/r1`;");
    expect(text).toContain(
      "Fix these review findings:\n1. a.ts:3 drops X\n   when Y\n2. b.ts:9 leaks Z",
    );
  });

  test("reviewer: diff against the task branch, no edits, findings-list final message", () => {
    const root = started();
    writeFileSync(join(root, "f.txt"), "- first\n- second\n");
    const text = brief(root, {
      role: "reviewer",
      from: "t3/w",
      findings: "f.txt",
      avoid: ["x.ts"],
      diskGb: 2,
    });
    expect(text.split("\n")[0]).toBe(
      "Follow AGENTS.md. You are the Reviewer for `tasks/0001-land.md`.",
    );
    shared(text, "t3/w");
    expect(text).toContain(
      "Review `git diff task/0001-land...t3/w` against `tasks/0001-land.md` Acceptance",
    );
    expect(text).toContain("Do not fix, commit or push.");
    expect(text).toContain("A parallel task owns `x.ts`: report any change to them as a finding.");
    expect(text).toContain(
      "numbered findings list (each with `file:line` and a failure scenario) or `no findings`",
    );
    expect(text).toContain("the `bun run verify` summary line");
    expect(text).toContain("previous round are fixed:\n1. first\n2. second");
  });

  test("land: tasks:merge and tasks:land steps in the foreground, one macos-example rerun", () => {
    const text = brief(started(), { role: "land", from: "t3/w", diskGb: 2 });
    expect(text.split("\n")[0]).toBe(
      "Follow AGENTS.md. You are the Land agent for `tasks/0001-land.md`.",
    );
    shared(text, "t3/w", true);
    expect(text).toContain("`gh run rerun <run-id> --failed` once");
    expect(text).toContain("Push and merge only through `tasks:land`.");
    expect(text).toContain("work in `.cache/tasks/0001-land` from any checkout");
    expect(text).toContain(
      "lists `chore(0001): done`, run `bun run tasks:merge 0001 --branch t3/w`",
    );
    expect(text).toContain("2. Run `bun run tasks:land 0001`.");
    expect(text).toContain("`link_pull_request`");
    expect(text).toContain('`macos-example` with "not acquired by Runner", run `gh run rerun');
    expect(text).toContain("4. Stop on anything else");
    expect(text).toContain("final message is `PR <url>, head <sha>, checks <state>`");
  });

  test("finds the task from tasks/ before tasks:start and fails for an unknown id", () => {
    const root = repo({ "tasks/0001-land.md": task("0001", "todo") });
    expect(brief(root, { role: "worker" })).toContain("git reset --hard task/0001-land &&");
    expect(() => briefTask(root, "0009", { role: "worker" }, real)).toThrow("task 0009 has no");
  });

  test("findingItems strips list markers and keeps unmarked lines as items", () => {
    expect(findingItems("plain one\n\nplain two\n")).toEqual(["plain one", "plain two"]);
    expect(findingItems("Notes:\n* a\n  more\n")).toEqual(["Notes:", "a\n   more"]);
  });

  test("unknown roles, missing --from and bad flags are usage errors", () => {
    const root = started();
    expect(() => parseBriefArgs(["0001", "--role", "boss"])).toThrow(UsageError);
    expect(() => parseBriefArgs(["0001"])).toThrow("--role is required");
    expect(() => parseBriefArgs(["--role", "worker"])).toThrow("missing <id>");
    expect(() => parseBriefArgs(["0001", "--role", "worker", "--disk", "0"])).toThrow(UsageError);
    expect(() => parseBriefArgs(["0001", "--role", "worker", "--nope"])).toThrow(UsageError);
    for (const role of ["reviewer", "land"] as const)
      expect(() => brief(root, { role })).toThrow(
        new UsageError(`--role ${role} requires --from <branch>`),
      );
    expect(() => brief(root, { role: "land", from: "w", findings: "f" })).toThrow(UsageError);
    expect(
      parseBriefArgs(["0001", "--role", "worker", "--avoid", "a", "--avoid", "b", "--round", "3"]),
    ).toEqual({
      id: "0001",
      options: { role: "worker", avoid: ["a", "b"], round: "3" },
    });
  });

  test("the CLI prints usage and exits 2 on a usage error", () => {
    for (const args of [
      ["brief", "0001", "--role", "boss"],
      ["brief", "0001", "--role", "reviewer"],
      ["clean", "--force"],
    ]) {
      const result = Bun.spawnSync(["bun", join(import.meta.dir, "tasks.ts"), ...args], {
        stdout: "pipe",
        stderr: "pipe",
      });
      expect(result.exitCode).toBe(2);
      expect(result.stderr.toString()).toContain(`usage: tasks:${args[0]}`);
    }
  });
});

/** A primary checkout on a merged side branch, plus one worktree or branch per case. */
function cluttered() {
  const root = repo({ "a.txt": "a\n" });
  git(root, "checkout", "-q", "-b", "primary-side");
  worktree(root, "merged-wt", "main");
  git(root, "branch", "merged-bare", "main");
  const dupA = worktree(root, "dup-a", "main");
  commit(dupA, { "dup.txt": "dup\n" }, "dup work");
  git(root, "branch", "t3/dup-b", "dup-a");
  commit(worktree(root, "unique-wt", "main"), { "u.txt": "u\n" }, "unique work");
  const dirty = worktree(root, "dirty", "main");
  writeFileSync(join(dirty, "scratch.txt"), "keep\n");
  rmSync(worktree(root, "gone", "main"), { recursive: true, force: true });
  const parent = mkdtempSync(join(tmpdir(), "blast-detached-"));
  roots.push(parent);
  git(root, "worktree", "add", "-q", "--detach", join(parent, "detached"), "main");
  const running = join(root, ".cache", "tasks", "0001-run");
  git(root, "worktree", "add", "-q", "-b", "task/0001-run", running, "main");
  commit(running, { "run.txt": "run\n" }, "task work");
  git(root, "branch", "t3/run-twin", "task/0001-run");
  git(
    root,
    "worktree",
    "add",
    "-q",
    "-b",
    "task/0002-done",
    join(root, ".cache", "tasks", "0002-done"),
    "main",
  );
  return { root, dirty };
}
const names = (entries: ReturnType<typeof cleanTasks>) =>
  entries.map(
    (e) =>
      `${e.kind} ${e.kind === "worktree" ? basename(e.name) : e.name}: ${e.reason}${e.kept ? ` ${e.kept}` : ""}`,
  );
const branches = (root: string) =>
  git(root, "for-each-ref", "--format=%(refname:short)", "refs/heads").split("\n");
const worktreeNames = (root: string) =>
  git(root, "worktree", "list", "--porcelain")
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => basename(line.slice(9)));
const EXPECTED = [
  "worktree gone: pruned",
  "worktree 0002-done: merged",
  "worktree detached: merged",
  "worktree merged-wt: merged",
  "branch gone: merged",
  "branch merged-bare: merged",
  "branch merged-wt: merged",
  "branch t3/dup-b: duplicate dup-a",
  "branch t3/run-twin: duplicate task/0001-run",
  "branch task/0002-done: merged",
];

describe("tasks:clean", () => {
  test("dry run lists merged, duplicate and pruned entries and changes nothing", () => {
    const { root } = cluttered();
    const before = [branches(root), worktreeNames(root)];
    const entries = cleanTasks(root, false, real);
    expect(names(entries).toSorted()).toEqual(EXPECTED.toSorted());
    expect([branches(root), worktreeNames(root)]).toEqual(before);
    expect(cleanReport(entries, false)).toContain(
      "dry run: would remove 4 worktree(s) and 6 branch(es)",
    );
    expect(cleanReport([], true)).toBe("removed 0 worktree(s) and 0 branch(es)");
  });

  test("--apply removes exactly the listed entries and never touches kept work", () => {
    const { root, dirty } = cluttered();
    const listed = names(cleanTasks(root, false, real));
    expect(names(cleanTasks(root, true, real))).toEqual(listed);
    expect(branches(root).toSorted()).toEqual(
      ["dirty", "dup-a", "main", "primary-side", "task/0001-run", "unique-wt"].toSorted(),
    );
    expect(worktreeNames(root).toSorted()).toEqual(
      [basename(root), "0001-run", "dirty", "dup-a", "unique-wt"].toSorted(),
    );
    expect(git(root, "branch", "--show-current")).toBe("primary-side");
    expect(readFileSync(join(dirty, "scratch.txt"), "utf8")).toBe("keep\n");
    expect(cleanTasks(root, false, real)).toEqual([]);
  });

  test("never removes the checkout it runs from, and fails without origin/main", () => {
    const root = repo({ "a.txt": "a\n" });
    const here = worktree(root, "here", "main");
    expect(names(cleanTasks(here, false, real))).toEqual([]);
    git(root, "update-ref", "-d", "refs/remotes/origin/main");
    expect(() => cleanTasks(root, false, real)).toThrow("origin/main does not exist");
  });

  test("parseCleanArgs defaults to a dry run", () => {
    expect(parseCleanArgs([])).toBe(false);
    expect(parseCleanArgs(["--apply"])).toBe(true);
    expect(() => parseCleanArgs(["--yes"])).toThrow(UsageError);
  });
});
