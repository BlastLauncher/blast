import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
  return readdirSync(join(root, "tasks"))
    .filter((name) => TASK_FILE.test(name))
    .toSorted();
}

export function readTasks(root: string): TaskInfo[] {
  return taskFiles(root).flatMap((file) => {
    const text = readFileSync(join(root, "tasks", file), "utf8");
    const fm = parseFrontmatter(text);
    if (!fm) return [];
    return [
      {
        id: String(fm.id),
        file,
        title: String(fm.title ?? ""),
        status: String(fm.status ?? ""),
        milestone: String(fm.milestone ?? ""),
        depends: Array.isArray(fm.depends) ? fm.depends.map(String) : [],
        text,
      },
    ];
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

function branch(runner: CommandRunner, root: string): string {
  return runOrFail(runner, root, "git", ["branch", "--show-current"]).stdout.trim();
}

/** Paths with uncommitted changes, untracked files listed one by one. */
function dirtyPaths(runner: CommandRunner, root: string): string[] {
  return runOrFail(runner, root, "git", ["status", "--porcelain", "--untracked-files=all"])
    .stdout.split("\n")
    .filter((line) => line.trim())
    .map((line) => line.slice(3));
}

function requireTaskBranchClean(runner: CommandRunner, root: string): string {
  const current = branch(runner, root);
  if (!current || current === "main") fail("must be on the task branch, not main");
  if (dirtyPaths(runner, root).length) fail("working tree is not clean");
  return current;
}

function taskById(root: string, id: string): TaskInfo {
  const task = readTasks(root).find((item) => item.id === id);
  if (!task) fail(`task ${id} does not exist`);
  return task;
}

export function taskBranchName(file: string): string {
  return `task/${file.replace(/\.md$/, "")}`;
}

const exists = (runner: CommandRunner, root: string, ref: string) =>
  runner("git", ["show-ref", "--verify", "--quiet", `refs/heads/${ref}`], root).status === 0;

export type TaskMutationOptions = { coAuthor?: string };

export function startTask(
  root: string,
  id: string,
  optionsOrRunner: TaskMutationOptions | CommandRunner = {},
  maybeRunner: CommandRunner = realRunner,
): string {
  const options = typeof optionsOrRunner === "function" ? {} : optionsOrRunner;
  const runner = typeof optionsOrRunner === "function" ? optionsOrRunner : maybeRunner;
  if (branch(runner, root) !== "main") fail("must be on main");
  const task = taskById(root, id);
  const taskPath = `tasks/${task.file}`;
  // The new task file may still be uncommitted on main; it moves to the task branch.
  if (dirtyPaths(runner, root).some((path) => path !== taskPath)) fail("working tree is not clean");
  if (task.status !== "todo") fail(`task ${id} has status ${task.status}, expected todo`);
  const updated = task.text.replace(/^(status:\s*)todo\s*$/m, "$1doing");
  if (updated === task.text) fail(`task ${id} has no todo status line`);
  const taskBranch = taskBranchName(task.file);
  if (exists(runner, root, taskBranch)) fail(`branch ${taskBranch} already exists`);
  runOrFail(runner, root, "git", ["fetch", "origin"]);
  runOrFail(runner, root, "git", ["switch", "-c", taskBranch, "origin/main"]);
  // Written after the switch: a file committed only on local main is absent on origin/main.
  writeFileSync(join(root, taskPath), updated);
  runOrFail(runner, root, "git", ["add", taskPath]);
  const commitArgs = ["commit", "-m", `chore: start ${id} (${task.title})`];
  if (options.coAuthor) commitArgs.push("-m", `Co-Authored-By: ${options.coAuthor}`);
  runOrFail(runner, root, "git", commitArgs);
  return `Follow AGENTS.md. You are the Worker for \`${taskPath}\`.`;
}

type Worktree = { path: string; branch: string };

function worktrees(runner: CommandRunner, root: string): Worktree[] {
  const text = runOrFail(runner, root, "git", ["worktree", "list", "--porcelain"]).stdout;
  const result: Worktree[] = [];
  let path = "";
  for (const line of text.split("\n")) {
    if (line.startsWith("worktree ")) path = line.slice(9);
    if (line.startsWith("branch refs/heads/") && path) {
      result.push({ path, branch: line.slice("branch refs/heads/".length) });
      path = "";
    }
  }
  return result;
}

function candidateBranches(
  runner: CommandRunner,
  root: string,
  task: TaskInfo,
  taskBranch: string,
): string[] {
  const slug = task.file.slice(5, -3);
  const candidates: string[] = [];
  for (const worktree of worktrees(runner, root)) {
    if (worktree.branch === "main" || worktree.branch === taskBranch) continue;
    if (worktree.branch.includes(slug)) {
      candidates.push(worktree.branch);
      continue;
    }
    const touched = runner(
      "git",
      ["diff", "--name-only", `${taskBranch}..${worktree.branch}`, "--", `tasks/${task.file}`],
      root,
    );
    if (touched.status === 0 && touched.stdout.split("\n").includes(`tasks/${task.file}`))
      candidates.push(worktree.branch);
  }
  return candidates.toSorted();
}

/** PLAN.md with the task ticked, or with `planText` appended as a ticked item
 * at the end of the task milestone's checklist. Pure, so merge can check it
 * before touching git. */
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

export function mergeTask(
  root: string,
  id: string,
  options: { branch?: string; plan?: string; coAuthor?: string } = {},
  runner: CommandRunner = realRunner,
): void {
  const taskBranch = requireTaskBranchClean(runner, root);
  const task = taskById(root, id);
  const candidates = options.branch
    ? [options.branch]
    : candidateBranches(runner, root, task, taskBranch);
  if (!options.branch && candidates.length !== 1)
    fail(
      `expected one worker branch for ${task.file}; candidates: ${candidates.join(", ") || "none"}`,
    );
  const selected = candidates[0]!;
  if (!exists(runner, root, selected)) fail(`branch ${selected} does not exist`);
  const ahead = runOrFail(runner, root, "git", [
    "rev-list",
    "--count",
    `${taskBranch}..${selected}`,
  ]).stdout.trim();
  if (ahead === "0") fail(`branch ${selected} is not ahead of ${taskBranch}`);
  // Fail on a missing PLAN line before anything changes.
  updatedPlan(readFileSync(join(root, "PLAN.md"), "utf8"), task, options.plan);
  const merged = runner("git", ["merge", "--no-ff", selected], root);
  if (merged.status !== 0) {
    runner("git", ["merge", "--abort"], root);
    fail(`merge of ${selected} failed; merge was aborted`);
  }
  // A merge that adds a workspace package or dependency leaves node_modules
  // stale, and verify would fail on unresolved imports.
  const lockChanged = runner("git", ["diff", "--quiet", "HEAD^1", "HEAD", "--", "bun.lock"], root);
  if (lockChanged.status !== 0) {
    const installed = runner("bun", ["install", "--frozen-lockfile"], root, { inherit: true });
    if (installed.status !== 0) fail("bun install --frozen-lockfile failed after the merge");
  }
  unlinkSync(join(root, "tasks", task.file));
  const planPath = join(root, "PLAN.md");
  writeFileSync(planPath, updatedPlan(readFileSync(planPath, "utf8"), task, options.plan));
  for (const command of [
    ["bun", ["run", "check:workflow"]],
    ["bun", ["run", "verify"]],
  ] as Array<[string, string[]]>) {
    const result = runner(command[0], command[1], root, { inherit: true });
    if (result.status !== 0)
      fail(`${command[1].join(" ")} failed; fix the merged tree before committing done`);
  }
  runOrFail(runner, root, "git", ["add", "-A"]);
  const commitArgs = ["commit", "-m", `chore(${id}): done`];
  if (options.coAuthor) commitArgs.push("-m", `Co-Authored-By: ${options.coAuthor}`);
  runOrFail(runner, root, "git", commitArgs);
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

type GhCheck = { name?: string; state?: string; bucket?: string };

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
  root: string,
  id: string,
): { path: string; text: string; title: string } {
  const subject = `chore(${id}): done`;
  const log = runOrFail(runner, root, "git", [
    "log",
    "--format=%H %s",
    "--fixed-strings",
    `--grep=${subject}`,
    "HEAD",
  ]).stdout;
  const done = log
    .split("\n")
    .map((line) => line.split(" "))
    .find(([, ...words]) => words.join(" ") === subject)?.[0];
  if (!done) fail(`no ${subject} commit on this branch; run tasks:merge ${id} first`);
  const deleted = runOrFail(runner, root, "git", [
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
  const text = runOrFail(runner, root, "git", ["show", `${done}^:${path}`]).stdout;
  return { path, text, title: String(parseFrontmatter(text)?.title ?? `task ${id}`) };
}

/** Worktrees whose branch was merged into the task branch and is new relative to origin/main. */
function taskWorkers(runner: CommandRunner, root: string, taskBranch: string): Worktree[] {
  return worktrees(runner, root).filter(
    (item) =>
      item.branch !== "main" &&
      item.branch !== taskBranch &&
      runner("git", ["merge-base", "--is-ancestor", item.branch, "HEAD"], root).status === 0 &&
      runOrFail(runner, root, "git", [
        "rev-list",
        "--count",
        `origin/main..${item.branch}`,
      ]).stdout.trim() !== "0",
  );
}

function openPullRequest(runner: CommandRunner, root: string, taskBranch: string): string {
  const listed = runOrFail(runner, root, "gh", [
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

function waitForChecks(
  runner: CommandRunner,
  root: string,
  pr: string,
  options: Required<Omit<LandOptions, "runner">>,
): void {
  const { now, sleep, log, timeoutMs, pollMs } = options;
  const deadline = now() + timeoutMs;
  const maxPolls = Math.max(1, Math.ceil(timeoutMs / pollMs) + 1);
  let checks: GhCheck[] = [];
  for (let polls = 0; now() <= deadline && polls < maxPolls; polls++) {
    // gh exits 8 while checks are pending and 1 when one failed or none are reported yet.
    const result = runner("gh", ["pr", "checks", pr, "--json", "name,state,bucket"], root);
    try {
      checks = JSON.parse(result.stdout) as GhCheck[];
    } catch {
      if (!/no checks reported/i.test(result.stderr))
        fail(`gh pr checks ${pr} failed: ${result.stderr.trim() || "invalid JSON"}`);
      checks = [];
    }
    const named = (bucket: string[]) =>
      checks.filter((check) => bucket.includes(check.bucket ?? "")).map((c) => c.name ?? "unnamed");
    const failed = named(["fail", "cancel"]);
    if (failed.length) fail(`checks failed: ${failed.join(", ")}`);
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

/** Pushes the task branch, opens or reuses its PR, waits for green checks,
 * merges it and cleans up. Returns the PR URL. */
export function landTask(root: string, id: string, options: LandOptions = {}): string {
  const runner = options.runner ?? realRunner;
  const timing = {
    sleep: options.sleep ?? ((ms: number) => Bun.sleepSync(ms)),
    now: options.now ?? (() => Date.now()),
    log: options.log ?? ((line: string) => console.log(line)),
    timeoutMs: options.timeoutMs ?? 1_800_000,
    pollMs: options.pollMs ?? 20_000,
  };
  const taskBranch = requireTaskBranchClean(runner, root);
  const done = doneTask(runner, root, id);
  runOrFail(runner, root, "git", ["fetch", "origin"]);
  const merged = runner("git", ["merge", "--no-edit", "origin/main"], root);
  if (merged.status !== 0) {
    const files = runner("git", ["diff", "--name-only", "--diff-filter=U"], root)
      .stdout.split("\n")
      .filter(Boolean);
    runner("git", ["merge", "--abort"], root);
    fail(
      `merging origin/main into ${taskBranch} failed; merge was aborted${files.length ? `; conflicts: ${files.join(", ")}` : ""}`,
    );
  }
  // Collected before the PR merge, while origin/main still separates this task's work.
  const workers = taskWorkers(runner, root, taskBranch);
  runOrFail(runner, root, "git", ["push", "-u", "origin", taskBranch]);
  let pr = openPullRequest(runner, root, taskBranch);
  if (!pr) {
    const subjects = runOrFail(runner, root, "git", [
      "log",
      "--reverse",
      "--no-merges",
      "--format=%s",
      "origin/main..HEAD",
    ]).stdout.split("\n");
    const template = readFileSync(join(root, ".github/pull_request_template.md"), "utf8");
    const created = runOrFail(runner, root, "gh", [
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
  waitForChecks(runner, root, pr, timing);
  runOrFail(runner, root, "gh", ["pr", "merge", pr, "--merge", "--delete-branch"]);
  runOrFail(runner, root, "git", ["switch", "main"]);
  runOrFail(runner, root, "git", ["pull", "--ff-only", "origin", "main"]);
  for (const worker of workers) {
    if (runner("git", ["merge-base", "--is-ancestor", worker.branch, "main"], root).status !== 0)
      continue;
    runOrFail(runner, root, "git", ["worktree", "remove", worker.path]);
    runOrFail(runner, root, "git", ["branch", "-d", worker.branch]);
  }
  // gh pr merge --delete-branch usually deletes the local branch already.
  if (exists(runner, root, taskBranch))
    runOrFail(runner, root, "git", ["branch", "-d", taskBranch]);
  return pr;
}

function usage(): never {
  console.error(
    "usage: tasks.ts next [--json] | start <id> [--co-author <value>] | merge <id> [--branch <b>] [--plan <text>] [--co-author <value>] | land <id> [--timeout-ms <ms>]",
  );
  process.exit(2);
}

if (import.meta.main) {
  try {
    const [command, id, ...args] = process.argv.slice(2);
    const root = process.cwd();
    if (command === "next") {
      const tasks = nextTasks(root);
      if (args.includes("--json"))
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
      const coAuthorIndex = args.indexOf("--co-author");
      const coAuthor = coAuthorIndex >= 0 ? args[coAuthorIndex + 1] : undefined;
      console.log(startTask(root, id, coAuthor ? { coAuthor } : {}));
    } else if (command === "merge" && id) {
      const branchIndex = args.indexOf("--branch");
      const planIndex = args.indexOf("--plan");
      const coAuthorIndex = args.indexOf("--co-author");
      const mergeOptions: { branch?: string; plan?: string; coAuthor?: string } = {};
      const branchArg = branchIndex >= 0 ? args[branchIndex + 1] : undefined;
      const planArg = planIndex >= 0 ? args[planIndex + 1] : undefined;
      const coAuthorArg = coAuthorIndex >= 0 ? args[coAuthorIndex + 1] : undefined;
      if (branchArg) mergeOptions.branch = branchArg;
      if (planArg) mergeOptions.plan = planArg;
      if (coAuthorArg) mergeOptions.coAuthor = coAuthorArg;
      mergeTask(root, id, mergeOptions);
    } else if (command === "land" && id) {
      const timeoutIndex = args.indexOf("--timeout-ms");
      const timeoutArg = timeoutIndex >= 0 ? Number(args[timeoutIndex + 1]) : undefined;
      if (timeoutArg !== undefined && !(Number.isInteger(timeoutArg) && timeoutArg > 0))
        fail("--timeout-ms must be a positive integer");
      console.log(landTask(root, id, timeoutArg === undefined ? {} : { timeoutMs: timeoutArg }));
    } else usage();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
