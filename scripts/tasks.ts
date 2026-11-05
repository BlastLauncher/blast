import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TASK_FILE, parseFrontmatter } from "./check-workflow.ts";

export type CommandResult = { status: number; stdout: string; stderr: string };
export type CommandRunner = (command: string, args: string[], cwd: string) => CommandResult;

const realRunner: CommandRunner = (command, args, cwd) => {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
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

export function readyTasks(root: string): Array<TaskInfo & { blocking: string[] }> {
  const open = new Set(readTasks(root).map((task) => task.id));
  return readTasks(root)
    .filter((task) => task.status === "todo")
    .map((task) => ({ ...task, blocking: task.depends.filter((id) => open.has(id)) }))
    .toSorted((a, b) => a.id.localeCompare(b.id));
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

function requireMainClean(runner: CommandRunner, root: string): void {
  if (branch(runner, root) !== "main") fail("must be on main");
  if (runOrFail(runner, root, "git", ["status", "--porcelain"]).stdout.trim())
    fail("working tree is not clean");
}

function taskById(root: string, id: string): TaskInfo {
  const task = readTasks(root).find((item) => item.id === id);
  if (!task) fail(`task ${id} does not exist`);
  return task;
}

export function startTask(root: string, id: string, runner: CommandRunner = realRunner): string {
  requireMainClean(runner, root);
  const task = taskById(root, id);
  if (task.status !== "todo") fail(`task ${id} has status ${task.status}, expected todo`);
  const updated = task.text.replace(/^(status:\s*)todo\s*$/m, "$1doing");
  if (updated === task.text) fail(`task ${id} has no todo status line`);
  writeFileSync(join(root, "tasks", task.file), updated);
  runOrFail(runner, root, "git", ["add", join("tasks", task.file)]);
  runOrFail(runner, root, "git", [
    "commit",
    "-m",
    `chore: start ${id} (${task.title})`,
    "-m",
    "Co-Authored-By: Codex <noreply@openai.com>",
  ]);
  return `Follow AGENTS.md. You are the Worker for \`tasks/${task.file}\`.`;
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

function candidateBranches(runner: CommandRunner, root: string, task: TaskInfo): string[] {
  const candidates: string[] = [];
  for (const worktree of worktrees(runner, root)) {
    if (worktree.branch === "main") continue;
    if (worktree.branch.includes(task.file.slice(5, -3))) {
      candidates.push(worktree.branch);
      continue;
    }
    const touched = runner(
      "git",
      ["diff", "--name-only", `main..${worktree.branch}`, "--", `tasks/${task.file}`],
      root,
    );
    if (touched.status === 0 && touched.stdout.split("\n").includes(`tasks/${task.file}`))
      candidates.push(worktree.branch);
  }
  return candidates.toSorted();
}

function planUpdate(root: string, task: TaskInfo, planText?: string): void {
  const path = join(root, "PLAN.md");
  const plan = readFileSync(path, "utf8");
  const tick = new RegExp(`^- \\[ \\] ${task.id}(?:\\s|$)`, "m");
  if (tick.test(plan)) {
    writeFileSync(
      path,
      plan.replace(tick, (line) => line.replace("- [ ]", "- [x]")),
    );
    return;
  }
  if (!planText) fail(`PLAN.md has no unchecked ${task.id} line; pass --plan "<text>"`);
  const heading = new RegExp(`^### ${task.milestone}\\s*$`, "m");
  if (!heading.test(plan)) fail(`PLAN.md has no ${task.milestone} milestone heading`);
  writeFileSync(
    path,
    plan.replace(heading, (line) => `${line}\n\n- [x] ${planText}`),
  );
}

export function mergeTask(
  root: string,
  id: string,
  options: { branch?: string; plan?: string } = {},
  runner: CommandRunner = realRunner,
): void {
  requireMainClean(runner, root);
  const task = taskById(root, id);
  const candidates = options.branch ? [options.branch] : candidateBranches(runner, root, task);
  if (!options.branch && candidates.length !== 1)
    fail(
      `expected one worker branch for ${task.file}; candidates: ${candidates.join(", ") || "none"}`,
    );
  const selected = candidates[0]!;
  const verifyBranch = runner("git", ["show-ref", "--verify", `refs/heads/${selected}`], root);
  if (verifyBranch.status !== 0) fail(`branch ${selected} does not exist`);
  const ahead = runOrFail(runner, root, "git", [
    "rev-list",
    "--count",
    `main..${selected}`,
  ]).stdout.trim();
  if (ahead === "0") fail(`branch ${selected} is not ahead of main`);
  const merged = runner("git", ["merge", "--no-ff", selected], root);
  if (merged.status !== 0) {
    runner("git", ["merge", "--abort"], root);
    fail(`merge of ${selected} failed; merge was aborted`);
  }
  unlinkSync(join(root, "tasks", task.file));
  planUpdate(root, task, options.plan);
  for (const command of [
    ["bun", ["run", "check:workflow"]],
    ["bun", ["run", "verify"]],
  ] as Array<[string, string[]]>) {
    const result = runner(command[0], command[1], root);
    if (result.status !== 0)
      fail(`${command[1].join(" ")} failed; fix the merged tree before committing done`);
  }
  runOrFail(runner, root, "git", ["add", "-A"]);
  runOrFail(runner, root, "git", ["commit", "-m", `chore(${id}): done`]);
}

type GhRun = { status?: string; conclusion?: string; name?: string };

export interface LandOptions {
  runner?: CommandRunner;
  sleep?: (ms: number) => void;
  now?: () => number;
  timeoutMs?: number;
  pollMs?: number;
}

export function landTask(root: string, id: string, options: LandOptions = {}): void {
  const runner = options.runner ?? realRunner;
  const sleep = options.sleep ?? ((ms: number) => Bun.sleepSync(ms));
  const now = options.now ?? (() => Date.now());
  const timeoutMs = options.timeoutMs ?? 120_000;
  const pollMs = options.pollMs ?? 1_000;
  const subject = runOrFail(runner, root, "git", [
    "show",
    "-s",
    "--format=%s",
    "HEAD",
  ]).stdout.trim();
  if (subject !== `chore(${id}): done`) fail(`HEAD is not chore(${id}): done`);
  const head = runOrFail(runner, root, "git", ["rev-parse", "HEAD"]).stdout.trim();
  runOrFail(runner, root, "git", ["push", "origin", "main"]);
  const deadline = now() + timeoutMs;
  const maxPolls = Math.max(1, Math.ceil(timeoutMs / pollMs) + 1);
  let runs: GhRun[] = [];
  let polls = 0;
  while (now() <= deadline && polls++ < maxPolls) {
    const result = runOrFail(runner, root, "gh", [
      "run",
      "list",
      "--commit",
      head,
      "--json",
      "status,conclusion,name",
    ]);
    try {
      runs = JSON.parse(result.stdout) as GhRun[];
    } catch {
      fail("gh returned invalid run JSON");
    }
    if (runs.length > 0 && runs.every((run) => run.status === "completed")) break;
    sleep(pollMs);
  }
  if (runs.length === 0 || runs.some((run) => run.status !== "completed"))
    fail("GitHub Actions did not complete before timeout");
  const failed = runs.filter((run) => run.conclusion !== "success");
  if (failed.length > 0)
    fail(`GitHub Actions failed: ${failed.map((run) => run.name ?? "unnamed").join(", ")}`);
  const secondParent = runOrFail(runner, root, "git", ["rev-parse", "HEAD^2"]).stdout.trim();
  const worker = worktrees(runner, root).find((item) => {
    if (item.branch === "main") return false;
    return runner("git", ["rev-parse", item.branch], root).stdout.trim() === secondParent;
  });
  if (!worker) fail(`could not find worktree for task ${id}`);
  runOrFail(runner, root, "git", ["worktree", "remove", worker.path]);
  runOrFail(runner, root, "git", ["branch", "-d", worker.branch]);
}

function usage(): never {
  console.error(
    "usage: tasks.ts next [--json] | start <id> | merge <id> [--branch <b>] [--plan <text>] | land <id>",
  );
  process.exit(2);
}

if (import.meta.main) {
  try {
    const [command, id, ...args] = process.argv.slice(2);
    const root = process.cwd();
    if (command === "next") {
      const tasks = readyTasks(root);
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
            `${task.id} ${task.title}${task.blocking.length ? ` (blocked by ${task.blocking.join(", ")})` : ""}`,
          );
    } else if (command === "start" && id) console.log(startTask(root, id));
    else if (command === "merge" && id) {
      const branchIndex = args.indexOf("--branch");
      const planIndex = args.indexOf("--plan");
      const mergeOptions: { branch?: string; plan?: string } = {};
      const branchArg = branchIndex >= 0 ? args[branchIndex + 1] : undefined;
      const planArg = planIndex >= 0 ? args[planIndex + 1] : undefined;
      if (branchArg) mergeOptions.branch = branchArg;
      if (planArg) mergeOptions.plan = planArg;
      mergeTask(root, id, mergeOptions);
    } else if (command === "land" && id) landTask(root, id);
    else usage();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
