import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { TASK_FILE, parseFrontmatter } from "./check-workflow.ts";

export type CommandResult = { status: number; stdout: string; stderr: string };
export type RunnerOptions = { inherit?: boolean };
export type CommandRunner = (
  command: string,
  args: string[],
  cwd: string,
  options?: RunnerOptions,
) => CommandResult;

const realRunner: CommandRunner = (command, args, cwd, options) => {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    ...(options?.inherit ? { stdio: "inherit" as const } : {}),
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
};

export interface TaskInfo {
  id: string;
  file: string;
  title: string;
  status: string;
  milestone: string;
  depends: string[];
  text: string;
}

function taskFiles(root: string): string[] {
  const tasksDir = join(root, "tasks");
  if (!existsSync(tasksDir)) return [];
  return readdirSync(tasksDir)
    .filter((name) => TASK_FILE.test(name))
    .toSorted();
}

function taskInfoFromText(file: string, text: string): TaskInfo | undefined {
  const fm = parseFrontmatter(text);
  if (!fm) return undefined;
  return {
    id: String(fm.id),
    file,
    title: String(fm.title ?? ""),
    status: String(fm.status ?? ""),
    milestone: String(fm.milestone ?? ""),
    depends: Array.isArray(fm.depends) ? fm.depends.map(String) : [],
    text,
  };
}

export function readTasks(root: string): TaskInfo[] {
  return taskFiles(root).flatMap((file) => {
    const info = taskInfoFromText(file, readFileSync(join(root, "tasks", file), "utf8"));
    return info ? [info] : [];
  });
}

export type ListedTask = TaskInfo & { blocking: string[] };

export function readyTasks(root: string): ListedTask[] {
  const tasks = readTasks(root);
  const open = new Set(tasks.map((task) => task.id));
  return tasks
    .filter((task) => task.status === "todo")
    .map((task) => ({ ...task, blocking: task.depends.filter((id) => open.has(id)) }))
    .toSorted((a, b) => a.id.localeCompare(b.id));
}

const taskRank = (task: ListedTask) => (task.status === "todo" ? 0 : 1);

export function nextTasks(root: string): ListedTask[] {
  const tasks = readTasks(root);
  const open = new Set(tasks.map((task) => task.id));
  const listed = tasks.map((task) => ({
    ...task,
    blocking: task.depends.filter((id) => open.has(id)),
  }));
  return [
    ...listed.filter((task) => task.status === "todo"),
    ...listed.filter((task) => task.status === "doing" || task.status === "review"),
  ].toSorted((a, b) => taskRank(a) - taskRank(b) || a.id.localeCompare(b.id));
}

function fail(message: string): never {
  throw new Error(message);
}

function runOrFail(
  runner: CommandRunner,
  root: string,
  command: string,
  args: string[],
): CommandResult {
  const result = runner(command, args, root);
  if (result.status !== 0)
    fail(`${command} ${args.join(" ")} failed${result.stderr ? `: ${result.stderr.trim()}` : ""}`);
  return result;
}

/** Paths with uncommitted changes, untracked files listed one by one. */
function dirtyPaths(runner: CommandRunner, root: string): string[] {
  return runOrFail(runner, root, "git", ["status", "--porcelain", "--untracked-files=all"])
    .stdout.split("\n")
    .filter((line) => line.trim())
    .map((line) => line.slice(3));
}

function taskById(root: string, id: string): TaskInfo {
  const task = readTasks(root).find((item) => item.id === id);
  if (!task) fail(`task ${id} does not exist`);
  return task;
}

export function taskBranchName(file: string): string {
  return `task/${file.replace(/\.md$/, "")}`;
}

/** Deterministic, gitignored path for a task's dedicated worktree under the primary checkout. */
export function taskWorktreePath(primaryRoot: string, file: string): string {
  return join(primaryRoot, ".cache", "tasks", file.replace(/\.md$/, ""));
}

const exists = (runner: CommandRunner, root: string, ref: string) =>
  runner("git", ["show-ref", "--verify", "--quiet", `refs/heads/${ref}`], root).status === 0;

type RawWorktree = { path: string; branch?: string; head?: string };
type Worktree = { path: string; branch: string; head?: string };

function rawWorktrees(runner: CommandRunner, root: string): RawWorktree[] {
  const text = runOrFail(runner, root, "git", ["worktree", "list", "--porcelain"]).stdout;
  const result: RawWorktree[] = [];
  let current: RawWorktree | undefined;
  for (const line of text.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (current) result.push(current);
      current = { path: line.slice(9) };
    } else if (current && line.startsWith("HEAD ")) {
      current.head = line.slice(5).trim();
    } else if (current && line.startsWith("branch refs/heads/")) {
      current.branch = line.slice("branch refs/heads/".length);
    }
  }
  if (current) result.push(current);
  return result;
}

function worktrees(runner: CommandRunner, root: string): Worktree[] {
  return rawWorktrees(runner, root).filter((wt): wt is Worktree => wt.branch !== undefined);
}

/** The repository's primary worktree (always first in `git worktree list`). */
function primaryWorktree(runner: CommandRunner, root: string): RawWorktree {
  return rawWorktrees(runner, root)[0] ?? { path: root };
}

function findTaskWorktree(runner: CommandRunner, root: string, id: string): Worktree {
  const prefix = `task/${id}-`;
  const matches = worktrees(runner, root).filter((wt) => wt.branch.startsWith(prefix));
  if (matches.length === 1) return matches[0]!;
  if (matches.length > 1) {
    fail(
      `multiple task worktrees found for ${id}: ${matches.map((m) => `${m.branch} (${m.path})`).join(", ")}`,
    );
  }
  fail(`no task worktree found for ${id}; run tasks:start ${id} first`);
}

export type TaskMutationOptions = { coAuthor?: string };

export function startTask(
  root: string,
  id: string,
  optionsOrRunner: TaskMutationOptions | CommandRunner = {},
  maybeRunner: CommandRunner = realRunner,
): string {
  const options = typeof optionsOrRunner === "function" ? {} : optionsOrRunner;
  const runner = typeof optionsOrRunner === "function" ? optionsOrRunner : maybeRunner;
  const task = taskById(root, id);
  const taskPath = `tasks/${task.file}`;
  if (task.status !== "todo") fail(`task ${id} has status ${task.status}, expected todo`);
  const updated = task.text.replace(/^(status:\s*)todo\s*$/m, "$1doing");
  if (updated === task.text) fail(`task ${id} has no todo status line`);
  const taskBranch = taskBranchName(task.file);
  if (exists(runner, root, taskBranch)) fail(`branch ${taskBranch} already exists`);
  const primary = primaryWorktree(runner, root);
  const wtPath = taskWorktreePath(primary.path, task.file);
  if (existsSync(wtPath)) fail(`task worktree ${wtPath} already exists`);
  runOrFail(runner, root, "git", ["fetch", "origin"]);
  mkdirSync(dirname(wtPath), { recursive: true });
  runOrFail(runner, root, "git", ["worktree", "add", "-b", taskBranch, wtPath, "origin/main"]);
  mkdirSync(join(wtPath, "tasks"), { recursive: true });
  writeFileSync(join(wtPath, taskPath), updated);
  runOrFail(runner, wtPath, "git", ["add", taskPath]);
  const commitArgs = ["commit", "-m", `chore: start ${id} (${task.title})`];
  if (options.coAuthor) commitArgs.push("-m", `Co-Authored-By: ${options.coAuthor}`);
  runOrFail(runner, wtPath, "git", commitArgs);
  // Move an uncommitted task file out of the invoking checkout; leave a file
  // already committed on HEAD untouched so that checkout stays clean.
  const trackedInHead = runner("git", ["cat-file", "-e", `HEAD:${taskPath}`], root).status === 0;
  if (!trackedInHead) {
    const staged = runner("git", ["ls-files", "--cached", "--", taskPath], root).stdout.trim();
    if (staged) runOrFail(runner, root, "git", ["rm", "--cached", "-q", "--", taskPath]);
    if (existsSync(join(root, taskPath))) unlinkSync(join(root, taskPath));
  }
  return `Follow AGENTS.md. You are the Worker for \`${taskPath}\`.`;
}

/** Body of a `## <name>` markdown section, without the heading. */
function section(text: string, name: string): string {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line.trim() === `## ${name}`);
  if (start < 0) return "";
  let end = lines.findIndex((line, i) => i > start && line.startsWith("## "));
  if (end < 0) end = lines.length;
  return lines
    .slice(start + 1, end)
    .join("\n")
    .trim();
}

/** Branch named on the `Branch/commit:` line of a task's Handoff section, if filled in. */
export function handoffBranch(taskText: string): string | undefined {
  const handoff = section(taskText, "Handoff");
  const match = /^\s*(?:[-*]\s+)?(?:\*\*)?Branch\/commit:(?:\*\*)?[ \t]+(.+)$/m.exec(handoff);
  if (!match?.[1]) return undefined;
  const token = match[1].trim().split(/\s+/)[0]?.replace(/^`|`$/g, "");
  if (!token || token === "@" || token.includes("<") || token.includes(">")) return undefined;
  return token;
}

function branchHead(runner: CommandRunner, cwd: string, name: string, known?: string): string {
  if (known) return known;
  const result = runner("git", ["rev-parse", "--verify", "--quiet", `refs/heads/${name}`], cwd);
  return result.status === 0 ? result.stdout.trim() : "";
}

function selectWorkerBranch(
  runner: CommandRunner,
  wtPath: string,
  task: TaskInfo,
  taskBranch: string,
  explicitBranch?: string,
): string {
  if (explicitBranch) return explicitBranch;
  const fromTaskHandoff = handoffBranch(task.text);
  if (fromTaskHandoff && fromTaskHandoff !== taskBranch) {
    // A Handoff line can be stale. Trust it only for a branch forked from this
    // task branch: it contains the task branch's first own commit (the start
    // commit), which `main` or another task's old worker never does.
    const own = runner("git", ["rev-list", "--reverse", `main..${taskBranch}`], wtPath);
    const start = own.status === 0 ? own.stdout.split("\n")[0]?.trim() : "";
    const forked =
      branchHead(runner, wtPath, fromTaskHandoff) !== "" &&
      runner("git", ["merge-base", "--is-ancestor", start || taskBranch, fromTaskHandoff], wtPath)
        .status === 0;
    if (forked) return fromTaskHandoff;
    console.log(
      `Handoff branch ${fromTaskHandoff} is not forked from ${taskBranch}; scanning worktrees instead.`,
    );
  }

  const slug = task.file.slice(5, -3);
  const allWts = worktrees(runner, wtPath);
  const taskHead = branchHead(
    runner,
    wtPath,
    taskBranch,
    allWts.find((w) => w.branch === taskBranch)?.head,
  );
  const matched: Worktree[] = [];
  for (const wt of allWts) {
    if (wt.branch === "main" || wt.branch === taskBranch) continue;
    const wtHead = branchHead(runner, wtPath, wt.branch, wt.head);
    if (taskHead && wtHead && wtHead === taskHead) continue;
    if (wt.branch.includes(slug)) {
      matched.push({ path: wt.path, branch: wt.branch, ...(wtHead ? { head: wtHead } : {}) });
      continue;
    }
    // Three dots: only changes made on the worker since it forked. Another task's
    // worker lacks this task file, and a two-dot diff would report it as deleted.
    const touched = runner(
      "git",
      ["diff", "--name-only", `${taskBranch}...${wt.branch}`, "--", `tasks/${task.file}`],
      wtPath,
    );
    if (touched.status === 0 && touched.stdout.split("\n").includes(`tasks/${task.file}`)) {
      matched.push({ path: wt.path, branch: wt.branch, ...(wtHead ? { head: wtHead } : {}) });
    }
  }

  // Group branches that point at the exact same commit so a reviewer worktree
  // sitting on the worker's commit does not count as a second candidate.
  const groups = new Map<string, { sha?: string; branches: string[] }>();
  for (const wt of matched) {
    const key = wt.head ? `sha:${wt.head}` : `branch:${wt.branch}`;
    const group = groups.get(key);
    if (group) group.branches.push(wt.branch);
    else groups.set(key, { ...(wt.head ? { sha: wt.head } : {}), branches: [wt.branch] });
  }

  if (groups.size !== 1) {
    const representatives = [...groups.values()]
      .map((group) => group.branches.toSorted()[0]!)
      .toSorted();
    fail(
      `expected one worker branch for ${task.file}; candidates: ${representatives.join(", ") || "none"}`,
    );
  }

  const only = [...groups.values()][0]!;
  const sorted = only.branches.toSorted();
  if (only.sha) {
    const shown = runner("git", ["show", `${only.sha}:tasks/${task.file}`], wtPath);
    if (shown.status === 0) {
      const fromCommitHandoff = handoffBranch(shown.stdout);
      if (
        fromCommitHandoff &&
        (sorted.includes(fromCommitHandoff) ||
          branchHead(runner, wtPath, fromCommitHandoff) === only.sha)
      ) {
        return fromCommitHandoff;
      }
    }
  }
  return sorted[0]!;
}

/** PLAN.md with the task ticked, or with `planText` appended as a ticked item
 * at the end of the task milestone's checklist. */
export function updatedPlan(plan: string, task: TaskInfo, planText?: string): string {
  const tick = new RegExp(`^- \\[ \\] ${task.id}(?:\\s|$)`, "m");
  if (tick.test(plan)) return plan.replace(tick, (line) => line.replace("- [ ]", "- [x]"));
  if (!planText) fail(`PLAN.md has no unchecked ${task.id} line; pass --plan "<text>"`);
  const lines = plan.split("\n");
  const heading = lines.findIndex((line) =>
    new RegExp(`^### ${task.milestone}(?:\\s|$)`).test(line),
  );
  if (heading < 0) fail(`PLAN.md has no ${task.milestone} milestone heading`);
  let end = lines.findIndex((line, i) => i > heading && line.startsWith("##"));
  if (end < 0) end = lines.length;
  let last = -1;
  for (let i = heading + 1; i < end; i++) if (/^- \[[ x]\] /.test(lines[i]!)) last = i;
  if (last < 0) fail(`PLAN.md ${task.milestone} has no checklist to append to`);
  // Continuation lines of the last item are indented; append after them.
  while (last + 1 < end && /^\s+\S/.test(lines[last + 1]!)) last++;
  lines.splice(last + 1, 0, `- [x] ${planText}`);
  return lines.join("\n");
}

function findDoneCommit(runner: CommandRunner, wtPath: string, id: string): string | undefined {
  const subject = `chore(${id}): done`;
  const log = runOrFail(runner, wtPath, "git", [
    "log",
    "--format=%H %s",
    "--fixed-strings",
    `--grep=${subject}`,
    "HEAD",
  ]).stdout;
  return log
    .split("\n")
    .map((line) => line.split(" "))
    .find(([, ...words]) => words.join(" ") === subject)?.[0];
}

function hasWorkerMergeCommit(runner: CommandRunner, wtPath: string): boolean {
  const merges = runner(
    "git",
    ["rev-list", "--merges", "--max-count=1", "origin/main..HEAD"],
    wtPath,
  );
  if (merges.status === 0 && merges.stdout.trim().length > 0) return true;
  return runner("git", ["rev-parse", "--verify", "--quiet", "HEAD^2"], wtPath).status === 0;
}

function taskFromHead(runner: CommandRunner, wtPath: string, id: string): TaskInfo | undefined {
  const listed = runner("git", ["ls-tree", "--name-only", "HEAD:tasks"], wtPath);
  if (listed.status !== 0) return undefined;
  const file = listed.stdout
    .split("\n")
    .map((entry) => entry.trim())
    .find((name) => TASK_FILE.test(name) && name.startsWith(`${id}-`));
  if (!file) return undefined;
  const shown = runner("git", ["show", `HEAD:tasks/${file}`], wtPath);
  if (shown.status !== 0) return undefined;
  return taskInfoFromText(file, shown.stdout);
}

function runMergeGatesAndCommit(
  runner: CommandRunner,
  wtPath: string,
  id: string,
  coAuthor?: string,
): void {
  for (const command of [
    ["bun", ["run", "check:workflow"]],
    ["bun", ["run", "verify"]],
  ] as Array<[string, string[]]>) {
    const result = runner(command[0], command[1], wtPath, { inherit: true });
    if (result.status !== 0) {
      fail(
        `${command[1].join(" ")} failed; fix the merged tree and rerun tasks:merge ${id} --resume`,
      );
    }
  }
  runOrFail(runner, wtPath, "git", ["add", "-A"]);
  const commitArgs = ["commit", "-m", `chore(${id}): done`];
  if (coAuthor) commitArgs.push("-m", `Co-Authored-By: ${coAuthor}`);
  runOrFail(runner, wtPath, "git", commitArgs);
}

export interface MergeOptions {
  branch?: string;
  plan?: string;
  coAuthor?: string;
  resume?: boolean;
}

export function mergeTask(
  root: string,
  id: string,
  options: MergeOptions = {},
  runner: CommandRunner = realRunner,
): void {
  const taskWt = findTaskWorktree(runner, root, id);
  const wtPath = taskWt.path;
  const taskBranch = taskWt.branch;

  if (options.resume) {
    if (options.branch) fail("--resume cannot be combined with --branch");
    if (runner("git", ["rev-parse", "--verify", "--quiet", "MERGE_HEAD"], wtPath).status === 0) {
      fail("a git merge is still in progress; resolve or abort it first");
    }
    if (findDoneCommit(runner, wtPath, id)) {
      fail(`task ${id} already has a chore(${id}): done commit`);
    }
    if (!hasWorkerMergeCommit(runner, wtPath)) {
      fail(`no worker merge commit on ${taskBranch}; run tasks:merge ${id} without --resume first`);
    }
    const task =
      readTasks(wtPath).find((item) => item.id === id) ?? taskFromHead(runner, wtPath, id);
    if (!task) fail(`task ${id} does not exist in worktree or HEAD`);
    const planPath = join(wtPath, "PLAN.md");
    const currentPlan = readFileSync(planPath, "utf8");
    const alreadyTicked =
      new RegExp(`^- \\[x\\] ${task.id}(?:\\s|$)`, "m").test(currentPlan) ||
      (options.plan !== undefined && currentPlan.split("\n").includes(`- [x] ${options.plan}`));
    const nextPlan = alreadyTicked ? currentPlan : updatedPlan(currentPlan, task, options.plan);
    const lockChanged =
      runner("git", ["rev-parse", "--verify", "--quiet", "HEAD^2"], wtPath).status === 0 &&
      runner("git", ["diff", "--quiet", "HEAD^1", "HEAD", "--", "bun.lock"], wtPath).status !== 0;
    if (!existsSync(join(wtPath, "node_modules")) || lockChanged) {
      const installed = runner("bun", ["install", "--frozen-lockfile"], wtPath, { inherit: true });
      if (installed.status !== 0) fail("bun install --frozen-lockfile failed");
    }
    const taskFilePath = join(wtPath, "tasks", task.file);
    if (existsSync(taskFilePath)) unlinkSync(taskFilePath);
    if (!alreadyTicked) writeFileSync(planPath, nextPlan);
    runMergeGatesAndCommit(runner, wtPath, id, options.coAuthor);
    return;
  }

  if (dirtyPaths(runner, wtPath).length) fail("working tree is not clean");
  const task = taskById(wtPath, id);
  const selected = selectWorkerBranch(runner, wtPath, task, taskBranch, options.branch);
  if (!exists(runner, wtPath, selected)) fail(`branch ${selected} does not exist`);
  const ahead = runOrFail(runner, wtPath, "git", [
    "rev-list",
    "--count",
    `${taskBranch}..${selected}`,
  ]).stdout.trim();
  if (ahead === "0") fail(`branch ${selected} is not ahead of ${taskBranch}`);
  const merged = runner("git", ["merge", "--no-ff", selected], wtPath);
  if (merged.status !== 0) {
    runner("git", ["merge", "--abort"], wtPath);
    fail(`merge of ${selected} failed; merge was aborted`);
  }
  // Check PLAN.md after merging so a checklist line added on the worker branch is seen.
  const planPath = join(wtPath, "PLAN.md");
  const nextPlan = updatedPlan(readFileSync(planPath, "utf8"), task, options.plan);
  // A fresh worktree has no node_modules, and a merge that changes bun.lock
  // leaves an existing node_modules stale.
  const lockChanged =
    runner("git", ["diff", "--quiet", "HEAD^1", "HEAD", "--", "bun.lock"], wtPath).status !== 0;
  if (!existsSync(join(wtPath, "node_modules")) || lockChanged) {
    const installed = runner("bun", ["install", "--frozen-lockfile"], wtPath, { inherit: true });
    if (installed.status !== 0) fail("bun install --frozen-lockfile failed after the merge");
  }
  unlinkSync(join(wtPath, "tasks", task.file));
  writeFileSync(planPath, nextPlan);
  runMergeGatesAndCommit(runner, wtPath, id, options.coAuthor);
}

/** The PR template with the task file named and its Handoff section pasted in. */
export function pullRequestBody(template: string, taskPath: string, taskText: string): string {
  const body = template.replace("tasks/NNNN-slug.md", taskPath);
  const handoff = section(taskText, "Handoff");
  if (!handoff) return body;
  const lines = body.split("\n");
  const start = lines.findIndex((line) => line.trim() === "## Handoff");
  if (start < 0) return `${body.trimEnd()}\n\n## Handoff\n\n${handoff}\n`;
  let end = lines.findIndex((line, i) => i > start && line.startsWith("## "));
  if (end < 0) end = lines.length;
  lines.splice(start + 1, end - start - 1, "", handoff, "");
  return lines.join("\n");
}

/** `type(NNNN): title`, typed after the branch's first non-chore conventional commit. */
export function pullRequestTitle(id: string, title: string, subjects: string[]): string {
  const type = subjects
    .map((subject) => /^([a-z]+)(?:\([^)]*\))?!?:/.exec(subject)?.[1])
    .find((value) => value && value !== "chore");
  return `${type ?? "feat"}(${id}): ${title}`;
}

const CHECKBOX_LINE = /^- \[([ x])\] (.*)$/;

/**
 * Resolves a git conflict in `PLAN.md` when every conflict hunk differs only
 * in `- [ ]` vs `- [x]` on otherwise identical checkbox lines, keeping every
 * `[x]` from both sides. Returns `undefined` for any other conflict.
 */
export function resolvePlanCheckboxConflict(conflicted: string): string | undefined {
  const lines = conflicted.split("\n");
  const out: string[] = [];
  let hunks = 0;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.startsWith("<<<<<<< ")) {
      if (line === "=======" || line.startsWith(">>>>>>> ")) return undefined;
      out.push(line);
      i++;
      continue;
    }
    hunks++;
    i++;
    const ours: string[] = [];
    while (i < lines.length && lines[i] !== "=======" && !lines[i]!.startsWith("||||||| ")) {
      if (lines[i]!.startsWith("<<<<<<< ") || lines[i]!.startsWith(">>>>>>> ")) return undefined;
      ours.push(lines[i]!);
      i++;
    }
    if (i >= lines.length) return undefined;
    // Skip optional diff3/zdiff3 base section.
    if (lines[i]!.startsWith("||||||| ")) {
      i++;
      while (i < lines.length && lines[i] !== "=======") {
        if (lines[i]!.startsWith("<<<<<<< ") || lines[i]!.startsWith(">>>>>>> ")) return undefined;
        i++;
      }
    }
    if (lines[i] !== "=======") return undefined;
    i++;
    const theirs: string[] = [];
    while (i < lines.length && !lines[i]!.startsWith(">>>>>>> ")) {
      if (lines[i]!.startsWith("<<<<<<< ") || lines[i] === "=======") return undefined;
      theirs.push(lines[i]!);
      i++;
    }
    if (i >= lines.length || !lines[i]!.startsWith(">>>>>>> ")) return undefined;
    i++;

    if (ours.length === 0 || ours.length !== theirs.length) return undefined;
    let changedCheckbox = false;
    for (let j = 0; j < ours.length; j++) {
      const a = ours[j]!;
      const b = theirs[j]!;
      if (a === b) {
        out.push(a);
        continue;
      }
      const ma = CHECKBOX_LINE.exec(a);
      const mb = CHECKBOX_LINE.exec(b);
      if (!ma || !mb || ma[2] !== mb[2]) return undefined;
      changedCheckbox = true;
      const checked = ma[1] === "x" || mb[1] === "x";
      out.push(`- [${checked ? "x" : " "}] ${ma[2]}`);
    }
    if (!changedCheckbox) return undefined;
  }
  return hunks > 0 ? out.join("\n") : undefined;
}

type GhCheck = { name?: string; state?: string; bucket?: string; link?: string };

export interface LandOptions {
  runner?: CommandRunner;
  sleep?: (ms: number) => void;
  now?: () => number;
  log?: (line: string) => void;
  timeoutMs?: number;
  pollMs?: number;
}

function doneTask(
  runner: CommandRunner,
  wtPath: string,
  id: string,
): { path: string; text: string; title: string } {
  const subject = `chore(${id}): done`;
  const done = findDoneCommit(runner, wtPath, id);
  if (!done) fail(`no ${subject} commit on this branch; run tasks:merge ${id} first`);
  const deleted = runOrFail(runner, wtPath, "git", [
    "diff",
    "--name-only",
    "--diff-filter=D",
    `${done}^`,
    done,
    "--",
    "tasks",
  ]).stdout.split("\n");
  const path = deleted.find((name) => name.startsWith(`tasks/${id}-`));
  if (!path) fail(`${subject} does not delete a tasks/${id}-*.md file`);
  const text = runOrFail(runner, wtPath, "git", ["show", `${done}^:${path}`]).stdout;
  return { path, text, title: String(parseFrontmatter(text)?.title ?? `task ${id}`) };
}

/** Worktrees whose branch was merged into the task branch and is new relative to origin/main. */
function taskWorkers(
  runner: CommandRunner,
  wtPath: string,
  taskBranch: string,
  primaryPath: string,
): Worktree[] {
  return worktrees(runner, wtPath).filter(
    (item) =>
      item.path !== primaryPath &&
      item.branch !== "main" &&
      item.branch !== taskBranch &&
      runner("git", ["merge-base", "--is-ancestor", item.branch, "HEAD"], wtPath).status === 0 &&
      runOrFail(runner, wtPath, "git", [
        "rev-list",
        "--count",
        `origin/main..${item.branch}`,
      ]).stdout.trim() !== "0",
  );
}

function openPullRequest(runner: CommandRunner, wtPath: string, taskBranch: string): string {
  const listed = runOrFail(runner, wtPath, "gh", [
    "pr",
    "list",
    "--head",
    taskBranch,
    "--state",
    "open",
    "--json",
    "url",
  ]).stdout;
  try {
    const prs = JSON.parse(listed || "[]") as Array<{ url?: string }>;
    return prs[0]?.url ?? "";
  } catch {
    return fail("gh pr list returned invalid JSON");
  }
}

/** Extracts a GitHub Actions workflow run id from a check's `link` URL, if present. */
export function runIdFromCheckLink(link: string | undefined): string | undefined {
  if (!link) return undefined;
  return /\/actions\/runs\/(\d+)(?:\/|$|\?|#)/.exec(link)?.[1];
}

function prHeadOid(runner: CommandRunner, wtPath: string, pr: string): string | undefined {
  const result = runner("gh", ["pr", "view", pr, "--json", "headRefOid"], wtPath);
  if (result.status !== 0) return undefined;
  try {
    const parsed = JSON.parse(result.stdout) as { headRefOid?: unknown };
    return typeof parsed.headRefOid === "string" && parsed.headRefOid.trim()
      ? parsed.headRefOid.trim()
      : undefined;
  } catch {
    return undefined;
  }
}

function cancelledRunIds(
  runner: CommandRunner,
  wtPath: string,
  cancelled: GhCheck[],
  expectedHead: string,
): string[] {
  const ids = new Set<string>();
  let needsFallback = false;
  for (const check of cancelled) {
    const id = runIdFromCheckLink(check.link);
    if (id) ids.add(id);
    else needsFallback = true;
  }
  if (needsFallback && expectedHead) {
    const listed = runner(
      "gh",
      ["run", "list", "--commit", expectedHead, "--json", "databaseId,conclusion,status"],
      wtPath,
    );
    if (listed.status === 0) {
      try {
        const runs = JSON.parse(listed.stdout || "[]") as Array<{
          databaseId?: number | string;
          conclusion?: string;
          status?: string;
        }>;
        for (const run of runs) {
          if (
            (run.conclusion === "cancelled" || run.status === "cancelled") &&
            run.databaseId !== undefined
          ) {
            ids.add(String(run.databaseId));
          }
        }
      } catch {
        // Ignore malformed fallback output; caller will fail cleanly if no run ids were found.
      }
    }
  }
  return [...ids];
}

function waitForChecks(
  runner: CommandRunner,
  wtPath: string,
  pr: string,
  options: Required<Omit<LandOptions, "runner">>,
): void {
  const { now, sleep, log, timeoutMs, pollMs } = options;
  const deadline = now() + timeoutMs;
  const maxPolls = Math.max(1, Math.ceil(timeoutMs / pollMs) + 1);
  const headResult = runner("git", ["rev-parse", "HEAD"], wtPath);
  const expectedHead = headResult.status === 0 ? headResult.stdout.trim() : "";
  let checks: GhCheck[] = [];
  let retriedCancel = false;
  for (let polls = 0; now() <= deadline && polls < maxPolls; polls++) {
    // gh exits 8 while checks are pending and 1 when one failed or none are reported yet.
    const result = runner("gh", ["pr", "checks", pr, "--json", "name,state,bucket,link"], wtPath);
    try {
      checks = JSON.parse(result.stdout) as GhCheck[];
    } catch {
      if (!/no checks reported/i.test(result.stderr))
        fail(`gh pr checks ${pr} failed: ${result.stderr.trim() || "invalid JSON"}`);
      checks = [];
    }
    const named = (list: GhCheck[]) => list.map((c) => c.name ?? "unnamed");
    const failed = checks.filter((c) => c.bucket === "fail");
    const cancelled = checks.filter((c) => c.bucket === "cancel");
    const pending = checks.filter(
      (c) =>
        c.bucket !== "pass" &&
        c.bucket !== "skipping" &&
        c.bucket !== "fail" &&
        c.bucket !== "cancel",
    );
    if (failed.length) {
      const bad = named(checks.filter((c) => c.bucket === "fail" || c.bucket === "cancel"));
      fail(`checks failed: ${bad.join(", ")}`);
    }
    if (cancelled.length && pending.length === 0) {
      const cancelledNames = named(cancelled);
      // Infrastructure runner-acquisition timeouts conclude as `cancel` with no
      // other failures and an unchanged PR head; retry those runs once.
      if (!retriedCancel && expectedHead && prHeadOid(runner, wtPath, pr) === expectedHead) {
        const runIds = cancelledRunIds(runner, wtPath, cancelled, expectedHead);
        if (runIds.length > 0) {
          retriedCancel = true;
          for (const runId of runIds) {
            log(
              `PR checks: rerunning cancelled workflow run ${runId} (${cancelledNames.join(", ")}) once`,
            );
            runOrFail(runner, wtPath, "gh", ["run", "rerun", runId, "--failed"]);
          }
          sleep(pollMs);
          continue;
        }
      }
      fail(`checks failed: ${cancelledNames.join(", ")}`);
    }
    log(
      `PR checks: ${checks.length ? checks.map((c) => `${c.name ?? "unnamed"} ${c.bucket ?? c.state ?? "unknown"}`).join(", ") : "waiting for checks"}`,
    );
    if (checks.length > 0 && checks.every((c) => c.bucket === "pass" || c.bucket === "skipping"))
      return;
    sleep(pollMs);
  }
  const pending = checks
    .filter((c) => c.bucket !== "pass" && c.bucket !== "skipping")
    .map((c) => c.name ?? "unnamed");
  fail(`checks did not complete before timeout: ${pending.join(", ") || "no checks reported"}`);
}

function updateLocalMain(
  runner: CommandRunner,
  primary: RawWorktree,
  log: (line: string) => void,
): void {
  const allWts = rawWorktrees(runner, primary.path);
  const currentPrimary = allWts[0] ?? primary;
  const mainWt = allWts.find((wt) => wt.branch === "main");
  runOrFail(runner, currentPrimary.path, "git", ["fetch", "origin"]);
  if (currentPrimary.branch === "main") {
    if (dirtyPaths(runner, currentPrimary.path).length > 0) {
      log(`main: left primary checkout unchanged (${currentPrimary.path} has uncommitted changes)`);
      return;
    }
    const ff = runner("git", ["merge", "--ff-only", "origin/main"], currentPrimary.path);
    if (ff.status === 0) {
      log(`main: fast-forwarded primary checkout (${currentPrimary.path}) to origin/main`);
    } else {
      log(
        `main: left primary checkout unchanged (could not fast-forward ${currentPrimary.path} to origin/main)`,
      );
    }
    return;
  }
  if (mainWt) {
    log(`main: left local main unchanged (checked out at ${mainWt.path})`);
    return;
  }
  const updated = runner("git", ["fetch", "origin", "main:main"], currentPrimary.path);
  if (updated.status === 0) {
    log("main: updated local main via git fetch origin main:main (primary checkout untouched)");
  } else {
    log("main: left local main unchanged (git fetch origin main:main could not fast-forward)");
  }
}

function deleteMergedBranch(runner: CommandRunner, cwd: string, name: string): void {
  if (!exists(runner, cwd, name)) return;
  const soft = runner("git", ["branch", "-d", name], cwd);
  if (soft.status === 0) return;
  // When primary is not on an up-to-date main, `branch -d` compares against
  // HEAD. Confirm ancestry against origin/main before force-deleting.
  if (runner("git", ["merge-base", "--is-ancestor", name, "origin/main"], cwd).status === 0) {
    runOrFail(runner, cwd, "git", ["branch", "-D", name]);
    return;
  }
  fail(`git branch -d ${name} failed${soft.stderr ? `: ${soft.stderr.trim()}` : ""}`);
}

/** Default PR check polling interval (ms) for `tasks:land`. */
export const DEFAULT_LAND_POLL_MS = 5_000;

/** Pushes the task branch from its worktree, opens or reuses its PR, waits for
 * green checks, merges it, updates local main without switching checkouts, and
 * cleans up worktrees and branches. Returns the PR URL. */
export function landTask(root: string, id: string, options: LandOptions = {}): string {
  const runner = options.runner ?? realRunner;
  const timing = {
    sleep: options.sleep ?? ((ms: number) => Bun.sleepSync(ms)),
    now: options.now ?? (() => Date.now()),
    log: options.log ?? ((line: string) => console.log(line)),
    timeoutMs: options.timeoutMs ?? 1_800_000,
    pollMs: options.pollMs ?? DEFAULT_LAND_POLL_MS,
  };
  const primary = primaryWorktree(runner, root);
  const taskWt = findTaskWorktree(runner, root, id);
  const wtPath = taskWt.path;
  const taskBranch = taskWt.branch;
  if (dirtyPaths(runner, wtPath).length) fail("working tree is not clean");
  const done = doneTask(runner, wtPath, id);
  runOrFail(runner, wtPath, "git", ["fetch", "origin"]);
  const merged = runner("git", ["merge", "--no-edit", "origin/main"], wtPath);
  if (merged.status !== 0) {
    const files = runner("git", ["diff", "--name-only", "--diff-filter=U"], wtPath)
      .stdout.split("\n")
      .filter(Boolean);
    let resolved = false;
    if (files.length === 1 && files[0] === "PLAN.md") {
      const planPath = join(wtPath, "PLAN.md");
      if (existsSync(planPath)) {
        const next = resolvePlanCheckboxConflict(readFileSync(planPath, "utf8"));
        if (next !== undefined) {
          writeFileSync(planPath, next);
          runOrFail(runner, wtPath, "git", ["add", "PLAN.md"]);
          runOrFail(runner, wtPath, "git", ["commit", "--no-edit"]);
          resolved = true;
        }
      }
    }
    if (!resolved) {
      runner("git", ["merge", "--abort"], wtPath);
      fail(
        `merging origin/main into ${taskBranch} failed; merge was aborted${files.length ? `; conflicts: ${files.join(", ")}` : ""}`,
      );
    }
  }
  // Collected before the PR merge, while origin/main still separates this task's work.
  const workers = taskWorkers(runner, wtPath, taskBranch, primary.path);
  runOrFail(runner, wtPath, "git", ["push", "-u", "origin", taskBranch]);
  let pr = openPullRequest(runner, wtPath, taskBranch);
  if (!pr) {
    const subjects = runOrFail(runner, wtPath, "git", [
      "log",
      "--reverse",
      "--no-merges",
      "--format=%s",
      "origin/main..HEAD",
    ]).stdout.split("\n");
    const template = readFileSync(join(wtPath, ".github/pull_request_template.md"), "utf8");
    const created = runOrFail(runner, wtPath, "gh", [
      "pr",
      "create",
      "--base",
      "main",
      "--head",
      taskBranch,
      "--title",
      pullRequestTitle(id, done.title, subjects),
      "--body",
      pullRequestBody(template, done.path, done.text),
    ]).stdout;
    pr = created.trim().split("\n").at(-1) ?? "";
    if (!pr) fail("gh pr create printed no PR URL");
  }
  waitForChecks(runner, wtPath, pr, timing);
  // Omit --delete-branch so gh never tries to switch to main or delete a branch
  // still attached to a worktree; cleanup runs below from the primary checkout.
  runOrFail(runner, wtPath, "gh", ["pr", "merge", pr, "--merge"]);
  updateLocalMain(runner, primary, timing.log);
  if (taskWt.path !== primary.path) {
    runOrFail(runner, primary.path, "git", ["worktree", "remove", "--force", taskWt.path]);
  }
  deleteMergedBranch(runner, primary.path, taskBranch);
  // Best-effort remote branch cleanup (no-op if GitHub auto-deletes on merge).
  runner("git", ["push", "origin", "--delete", taskBranch], primary.path);
  for (const worker of workers) {
    if (
      runner("git", ["merge-base", "--is-ancestor", worker.branch, "origin/main"], primary.path)
        .status !== 0
    )
      continue;
    // Merged into origin/main, so only untracked leftovers (screenshots, .cache) remain.
    runOrFail(runner, primary.path, "git", ["worktree", "remove", "--force", worker.path]);
    deleteMergedBranch(runner, primary.path, worker.branch);
  }
  return pr;
}

export function usageText(command?: string): string {
  switch (command) {
    case "next":
      return [
        "usage: tasks:next [--json]",
        "",
        "List open tasks (todo first, then doing/review) and any blocking dependencies.",
      ].join("\n");
    case "start":
      return [
        "usage: tasks:start <id> [--co-author <value>]",
        "",
        "Create task/<id>-<slug> from origin/main in .cache/tasks/<id>-<slug> and",
        "commit the task file there as status: doing (moving an untracked task file",
        "out of the invoking checkout). Leaves the primary checkout's HEAD and branch",
        "unchanged.",
      ].join("\n");
    case "merge":
      return [
        "usage: tasks:merge <id> [--branch <b>] [--plan <text>] [--co-author <value>] [--resume]",
        "",
        "Find the task worktree for <id> from any checkout and merge the worker branch",
        "(--no-ff), check and tick PLAN.md after merging, install dependencies when",
        "node_modules is missing or bun.lock changed, delete the task file, verify,",
        "and commit chore(<id>): done.",
        "",
        "Worker branch order: --branch, Handoff Branch/commit:, then worktree scan",
        "(branches at the same commit count once).",
        "  --resume  Rerun checks and commit done after an existing worker merge commit.",
      ].join("\n");
    case "land":
      return [
        "usage: tasks:land <id> [--timeout-ms <ms>] [--poll-ms <ms>]",
        "",
        "Find the task worktree for <id> from any checkout, merge origin/main",
        "(auto-resolving PLAN.md checkbox-only conflicts, stopping on any other",
        "conflict), push, open or reuse the PR, wait for checks, and merge the PR.",
        "",
        "Updates local main without switching checkouts (fast-forwards the primary",
        "checkout only when it is on a clean main, otherwise runs",
        "`git fetch origin main:main` when safe), then removes the task worktree and",
        "merged worker worktrees.",
      ].join("\n");
    default:
      return [
        "usage: tasks.ts <command> [args]",
        "",
        "Commands (start, merge, land work in .cache/tasks/<id>-<slug> and never switch the primary checkout):",
        "  next  [--json]",
        "  start <id> [--co-author <value>]",
        "  merge <id> [--branch <b>] [--plan <text>] [--co-author <value>] [--resume]",
        "  land  <id> [--timeout-ms <ms>] [--poll-ms <ms>]",
        "",
        "Run `bun run tasks:<command> --help` for details.",
      ].join("\n");
  }
}

function usage(command?: string, exitCode = 2): never {
  const out = exitCode === 0 ? console.log : console.error;
  out(usageText(command));
  process.exit(exitCode);
}

function parseValueFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) fail(`${flag} requires a value`);
  return value;
}

const VALUE_FLAGS = new Set(["--co-author", "--branch", "--plan", "--timeout-ms", "--poll-ms"]);

function parseId(rest: string[]): string | undefined {
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (VALUE_FLAGS.has(arg)) {
      i++;
      continue;
    }
    if (!arg.startsWith("-")) return arg;
  }
  return undefined;
}

if (import.meta.main) {
  try {
    const [command, ...rest] = process.argv.slice(2);
    const root = process.cwd();
    if (!command) usage(undefined, 2);
    if (command === "--help" || command === "-h" || command === "help") {
      const topic = rest[0];
      usage(topic, 0);
    }
    if (rest.includes("--help") || rest.includes("-h")) {
      usage(command, 0);
    }
    const id = parseId(rest);
    const args = rest;
    if (command === "next") {
      const tasks = nextTasks(root);
      if (rest.includes("--json"))
        console.log(
          JSON.stringify(
            tasks.map((task) => {
              const { text: taskText, ...copy } = task;
              void taskText;
              return copy;
            }),
          ),
        );
      else
        for (const task of tasks)
          console.log(
            `${task.id} ${task.title}${task.blocking.length ? ` (blocked by ${task.blocking.join(", ")})` : task.status !== "todo" ? ` (${task.status})` : ""}`,
          );
    } else if (command === "start" && id) {
      const coAuthor = parseValueFlag(args, "--co-author");
      console.log(startTask(root, id, coAuthor ? { coAuthor } : {}));
    } else if (command === "merge" && id) {
      const mergeOptions: MergeOptions = {};
      const branchArg = parseValueFlag(args, "--branch");
      const planArg = parseValueFlag(args, "--plan");
      const coAuthorArg = parseValueFlag(args, "--co-author");
      if (branchArg) mergeOptions.branch = branchArg;
      if (planArg) mergeOptions.plan = planArg;
      if (coAuthorArg) mergeOptions.coAuthor = coAuthorArg;
      if (args.includes("--resume")) mergeOptions.resume = true;
      mergeTask(root, id, mergeOptions);
    } else if (command === "land" && id) {
      const timeoutRaw = parseValueFlag(args, "--timeout-ms");
      const timeoutArg = timeoutRaw !== undefined ? Number(timeoutRaw) : undefined;
      if (timeoutArg !== undefined && !(Number.isInteger(timeoutArg) && timeoutArg > 0))
        fail("--timeout-ms must be a positive integer");
      const pollRaw = parseValueFlag(args, "--poll-ms");
      const pollArg = pollRaw !== undefined ? Number(pollRaw) : undefined;
      if (pollArg !== undefined && !(Number.isInteger(pollArg) && pollArg > 0))
        fail("--poll-ms must be a positive integer");
      const landOptions: LandOptions = {};
      if (timeoutArg !== undefined) landOptions.timeoutMs = timeoutArg;
      if (pollArg !== undefined) landOptions.pollMs = pollArg;
      console.log(landTask(root, id, landOptions));
    } else {
      usage(
        command === "start" || command === "merge" || command === "land" ? command : undefined,
        2,
      );
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
