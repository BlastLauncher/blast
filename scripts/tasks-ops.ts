import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, resolve, sep } from "node:path";
import { TASK_FILE, parseFrontmatter } from "./check-workflow.ts";
import type { CommandResult, CommandRunner } from "./tasks.ts";

export const BRIEF_ROLES = ["worker", "reviewer", "land"] as const;
export type BriefRole = (typeof BRIEF_ROLES)[number];

export class BriefUsageError extends Error {}

export interface BriefOptions {
  role: BriefRole;
  from?: string;
  round?: number;
  findings?: string;
  avoid?: string[];
  diskGb?: number;
}

export interface CleanOptions {
  apply?: boolean;
}

export type CleanReason = "merged" | "duplicate" | "pruned";

export interface CleanWorktreeEntry {
  path: string;
  branch?: string;
  head?: string;
  reason: CleanReason;
  keptBranch?: string;
}

export interface CleanBranchEntry {
  branch: string;
  head: string;
  reason: "merged" | "duplicate";
  keptBranch?: string;
}

export interface CleanResult {
  apply: boolean;
  worktrees: CleanWorktreeEntry[];
  branches: CleanBranchEntry[];
}

type PorcelainWorktree = {
  path: string;
  head?: string;
  branch?: string;
  detached: boolean;
  bare: boolean;
  prunable: boolean;
  locked: boolean;
};

const defaultRunner: CommandRunner = (command, args, cwd, options): CommandResult => {
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

function fail(message: string): never {
  throw new Error(message);
}

function runOrFail(
  runner: CommandRunner,
  cwd: string,
  command: string,
  args: string[],
): CommandResult {
  const result = runner(command, args, cwd);
  if (result.status !== 0) {
    fail(`${command} ${args.join(" ")} failed${result.stderr ? `: ${result.stderr.trim()}` : ""}`);
  }
  return result;
}

function canonicalPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

export function parseWorktreesPorcelain(text: string): PorcelainWorktree[] {
  const result: PorcelainWorktree[] = [];
  let current: PorcelainWorktree | undefined;
  for (const line of text.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (current) result.push(current);
      current = {
        path: line.slice("worktree ".length),
        detached: false,
        bare: false,
        prunable: false,
        locked: false,
      };
    } else if (!current) {
      continue;
    } else if (line.startsWith("HEAD ")) {
      current.head = line.slice("HEAD ".length).trim();
    } else if (line.startsWith("branch refs/heads/")) {
      current.branch = line.slice("branch refs/heads/".length);
    } else if (line === "detached") {
      current.detached = true;
    } else if (line === "bare") {
      current.bare = true;
    } else if (line === "prunable" || line.startsWith("prunable ")) {
      current.prunable = true;
    } else if (line === "locked" || line.startsWith("locked ")) {
      current.locked = true;
    }
  }
  if (current) result.push(current);
  return result;
}

function resolveTaskTarget(
  root: string,
  id: string,
  runner: CommandRunner,
): { taskPath: string; taskBranch: string; taskSlug: string } {
  const tasksDir = join(root, "tasks");
  if (existsSync(tasksDir)) {
    for (const file of readdirSync(tasksDir).toSorted()) {
      if (!TASK_FILE.test(file)) continue;
      const fm = parseFrontmatter(readFileSync(join(tasksDir, file), "utf8"));
      if (fm && String(fm.id) === id) {
        const slug = file.replace(/\.md$/, "");
        return { taskPath: `tasks/${file}`, taskBranch: `task/${slug}`, taskSlug: slug };
      }
    }
  }

  const prefix = `task/${id}-`;
  const wtList = runner("git", ["worktree", "list", "--porcelain"], root);
  if (wtList.status === 0) {
    const wt = parseWorktreesPorcelain(wtList.stdout).find((entry) =>
      entry.branch?.startsWith(prefix),
    );
    if (wt?.branch) {
      const slug = wt.branch.slice("task/".length);
      return { taskPath: `tasks/${slug}.md`, taskBranch: wt.branch, taskSlug: slug };
    }
  }

  const refs = runner(
    "git",
    ["for-each-ref", "--format=%(refname:short)", `refs/heads/${prefix}*`],
    root,
  );
  if (refs.status === 0) {
    const branch = refs.stdout
      .split("\n")
      .map((line) => line.trim())
      .find((name) => name.startsWith(prefix));
    if (branch) {
      const slug = branch.slice("task/".length);
      return { taskPath: `tasks/${slug}.md`, taskBranch: branch, taskSlug: slug };
    }
  }

  fail(`task ${id} does not exist`);
}

function parseNumberedFindings(raw: string): string[] {
  const normalized = raw.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  const lines = normalized.split("\n");
  const numbered = /^\s*\d+[.)]\s+(.*)$/;
  const bulleted = /^\s*[-*]\s+(.*)$/;

  if (lines.some((line) => numbered.test(line))) {
    const items: string[] = [];
    for (const line of lines) {
      const match = numbered.exec(line);
      if (match) {
        items.push(match[1]!.trim());
      } else if (items.length > 0 && line.trim()) {
        items[items.length - 1] = `${items[items.length - 1]}\n   ${line.trim()}`;
      }
    }
    return items.filter(Boolean);
  }

  if (lines.some((line) => bulleted.test(line))) {
    const items: string[] = [];
    for (const line of lines) {
      const match = bulleted.exec(line);
      if (match) {
        items.push(match[1]!.trim());
      } else if (items.length > 0 && line.trim()) {
        items[items.length - 1] = `${items[items.length - 1]}\n   ${line.trim()}`;
      }
    }
    return items.filter(Boolean);
  }

  return lines.map((line) => line.trim()).filter(Boolean);
}

function formatUniqueList(items: string[]): string {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const item of items) {
    if (!seen.has(item)) {
      seen.add(item);
      unique.push(item);
    }
  }
  return unique.join(", ");
}

function formatProtectedBranches(branches: string[]): string {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const branch of branches) {
    if (!seen.has(branch)) {
      seen.add(branch);
      unique.push(`\`${branch}\``);
    }
  }
  if (unique.length <= 1) return unique[0] ?? "";
  return `${unique.slice(0, -1).join(", ")}, and ${unique.at(-1)}`;
}

/** Builds a concise, literal delegation brief for worker, reviewer, or land children. */
export function briefTask(
  root: string,
  id: string,
  options: BriefOptions,
  runner: CommandRunner = defaultRunner,
): string {
  const { role } = options;
  if (!BRIEF_ROLES.includes(role)) {
    throw new BriefUsageError(`unknown role: ${String(role)}`);
  }
  if ((role === "reviewer" || role === "land") && !options.from) {
    throw new BriefUsageError(`--from <branch> is required for --role ${role}`);
  }
  if (
    options.round !== undefined &&
    !(Number.isInteger(options.round) && options.round >= 1)
  ) {
    throw new BriefUsageError("--round must be a positive integer");
  }
  const diskGb = options.diskGb ?? 1;
  if (!(Number.isFinite(diskGb) && diskGb > 0)) {
    throw new BriefUsageError("--disk must be a positive number");
  }

  let findingsList: string[] = [];
  if (options.findings !== undefined) {
    const findingsPath = isAbsolute(options.findings)
      ? options.findings
      : resolve(root, options.findings);
    if (!existsSync(findingsPath)) {
      fail(`findings file not found: ${options.findings}`);
    }
    findingsList = parseNumberedFindings(readFileSync(findingsPath, "utf8"));
    if (findingsList.length === 0) {
      fail(`findings file is empty: ${options.findings}`);
    }
  }

  const { taskPath, taskBranch, taskSlug } = resolveTaskTarget(root, id, runner);
  const avoid = options.avoid?.length ? formatUniqueList(options.avoid) : "";

  if (role === "worker") {
    const startBranch = options.from ?? taskBranch;
    const protectedList = formatProtectedBranches([
      "main",
      "origin/main",
      `${taskBranch} (and its .cache/tasks/ worktree)`,
      ...(options.from && options.from !== taskBranch ? [options.from] : []),
    ]);
    const lines = [
      `Follow AGENTS.md. You are the Worker for \`${taskPath}\`.`,
      "",
      "First command (T3 may cut your worktree from any commit; a fresh worktree has no `node_modules`):",
      `\`git reset --hard ${startBranch} && bun install --frozen-lockfile\``,
      "",
      "Rules:",
      `- Commit on your own branch; do not push. Do not modify ${protectedList}.`,
      "- Shared machine: never run two `bun run verify` at once. Run focused tests while iterating.",
      "- Run long commands in the foreground and wait; never end your turn with uncommitted work.",
      `- Keep extra disk usage under ${diskGb} GB, and delete scratch files.`,
      ...(avoid ? [`- Stay out of (owned by a parallel task): ${avoid}.`] : []),
      `- Fill Handoff in \`${taskPath}\` and commit it; your final message is only the Handoff block (\`Branch/commit:\`, \`Verify:\`, \`Done:\`, \`Not done / risks:\`).`,
    ];
    if (findingsList.length > 0) {
      lines.push(
        "",
        options.round ? `Round ${options.round} findings to fix:` : "Findings to fix:",
        ...findingsList.map((item, index) => `${index + 1}. ${item}`),
      );
    } else if (options.round && options.round > 1) {
      lines.push("", `Round ${options.round}.`);
    }
    return lines.join("\n");
  }

  const from = options.from!;
  if (role === "reviewer") {
    const protectedList = formatProtectedBranches(["main", "origin/main", taskBranch, from]);
    const lines = [
      `Follow AGENTS.md. You are the Reviewer for \`${taskPath}\`.`,
      "",
      "First command (T3 may cut your worktree from any commit; a fresh worktree has no `node_modules`):",
      `\`git reset --hard ${from} && bun install --frozen-lockfile\``,
      "",
      "Inspect the diff:",
      `\`git diff ${taskBranch}...${from}\``,
      "",
      "Rules:",
      `- Read-only review: do not rewrite the work, do not push, and do not modify ${protectedList}.`,
      "- Shared machine: never run two `bun run verify` at once.",
      "- Run `bun run verify` and acceptance checks in the foreground and wait.",
      `- Keep extra disk usage under ${diskGb} GB, and delete scratch files.`,
      ...(avoid ? [`- Stay out of (owned by a parallel task): ${avoid}.`] : []),
      `- Check the diff, generated/untracked artifacts, \`${taskPath}\` Acceptance, and AGENTS.md.`,
      '- Final message: a numbered findings list (`file:line`, failure scenario) or `no findings`, plus the `bun run verify` summary line.',
    ];
    if (findingsList.length > 0) {
      lines.push(
        "",
        options.round
          ? `Round ${options.round} findings to verify:`
          : "Previous findings to verify:",
        ...findingsList.map((item, index) => `${index + 1}. ${item}`),
      );
    } else if (options.round && options.round > 1) {
      lines.push("", `Round ${options.round} review.`);
    }
    return lines.join("\n");
  }

  const protectedList = formatProtectedBranches(["main", "origin/main", from]);
  const lines = [
    `Follow AGENTS.md. You are the Land agent for \`${taskPath}\`.`,
    "",
    "First command (T3 may cut your worktree from any commit; a fresh worktree has no `node_modules`):",
    `\`git reset --hard ${from} && bun install --frozen-lockfile\``,
    "",
    `Steps (run in the foreground and wait; \`tasks:merge\` and \`tasks:land\` operate in \`.cache/tasks/${taskSlug}\` and leave the primary checkout untouched):`,
    `1. If \`chore(${id}): done\` is not yet on \`${taskBranch}\`, run \`bun run tasks:merge ${id} --branch ${from}\` in the foreground.`,
    `2. Run \`bun run tasks:land ${id}\` in the foreground, and link the PR (\`link_pull_request\`).`,
    `3. If \`tasks:land\` fails only because \`macos-example\` reports "not acquired by Runner", rerun that failed check once and rerun \`bun run tasks:land ${id}\` in the foreground. Stop on any other failure, merge conflict, or second check failure.`,
    "",
    "Rules:",
    `- Do not push directly to \`main\` and do not modify ${protectedList}; only \`tasks:land\` pushes \`${taskBranch}\` and merges the PR.`,
    "- Shared machine: never run two `bun run verify` at once.",
    `- Keep extra disk usage under ${diskGb} GB, and delete scratch files.`,
    ...(avoid ? [`- Stay out of (owned by a parallel task): ${avoid}.`] : []),
    "- Final message: `PR <url>, head <sha>, checks <state>`.",
  ];
  if (findingsList.length > 0) {
    lines.push(
      "",
      options.round ? `Round ${options.round} notes:` : "Notes:",
      ...findingsList.map((item, index) => `${index + 1}. ${item}`),
    );
  }
  return lines.join("\n");
}

function branchTier(branch: string): number {
  if (branch.startsWith("task/")) return 0;
  if (!branch.startsWith("t3/")) return 1;
  return 2;
}

function compareKeepOrder(a: string, b: string): number {
  return branchTier(a) - branchTier(b) || a.localeCompare(b);
}

function isDirtyWorktree(runner: CommandRunner, wtPath: string): boolean {
  const status = runner("git", ["status", "--porcelain", "--untracked-files=all"], wtPath);
  if (status.status !== 0) return true;
  return status.stdout.split("\n").some((line) => line.trim() !== "");
}

/**
 * Lists (and with `apply: true`, removes) worktrees and local branches that are
 * merged into `origin/main`, sit at the same commit as a kept branch, or whose
 * worktree directory is gone. Never touches the primary checkout, `main`,
 * dirty worktrees, unique unmerged work, or unmerged `.cache/tasks/` worktrees.
 */
export function cleanTasks(
  root: string,
  options: CleanOptions = {},
  runner: CommandRunner = defaultRunner,
): CleanResult {
  const apply = options.apply === true;
  const listed = runOrFail(runner, root, "git", ["worktree", "list", "--porcelain"]);
  const allWorktrees = parseWorktreesPorcelain(listed.stdout);
  const primary = allWorktrees[0];
  if (!primary) fail("no primary git worktree found");

  if (
    runner("git", ["rev-parse", "--verify", "--quiet", "refs/remotes/origin/main"], primary.path)
      .status !== 0
  ) {
    fail("origin/main does not exist");
  }

  const primaryCanon = canonicalPath(primary.path);
  const tasksCachePrefix = `${join(primaryCanon, ".cache", "tasks")}${sep}`;

  const refsOutput = runOrFail(runner, primary.path, "git", [
    "for-each-ref",
    "--format=%(refname:short)%09%(objectname)",
    "refs/heads",
  ]).stdout;
  const branches: Array<{ branch: string; head: string }> = [];
  const branchHeadMap = new Map<string, string>();
  for (const line of refsOutput.split("\n")) {
    if (!line.trim()) continue;
    const [branch, head] = line.split("\t");
    if (branch && head) {
      branches.push({ branch, head });
      branchHeadMap.set(branch, head);
    }
  }

  const isMergedRef = (ref: string): boolean =>
    runner("git", ["merge-base", "--is-ancestor", ref, "refs/remotes/origin/main"], primary.path)
      .status === 0;

  const mergedByBranch = new Map<string, boolean>();
  for (const { branch } of branches) {
    mergedByBranch.set(branch, isMergedRef(`refs/heads/${branch}`));
  }

  const protectedBranches = new Set<string>(["main"]);
  if (primary.branch) protectedBranches.add(primary.branch);

  type InspectedWorktree = {
    wt: PorcelainWorktree;
    gone: boolean;
    dirty: boolean;
  };
  const inspected: InspectedWorktree[] = [];
  for (const wt of allWorktrees.slice(1)) {
    const gone = wt.prunable || !existsSync(wt.path);
    const dirty = !gone && (wt.locked || isDirtyWorktree(runner, wt.path));
    inspected.push({ wt, gone, dirty });
    if (!gone && wt.branch) {
      const isTaskCache = canonicalPath(wt.path).startsWith(tasksCachePrefix);
      if (dirty || (isTaskCache && !mergedByBranch.get(wt.branch))) {
        protectedBranches.add(wt.branch);
      }
    }
  }

  const branchDisposition = new Map<
    string,
    { status: "kept" | "merged" | "duplicate"; keptBranch?: string }
  >();
  const unmergedGroups = new Map<string, string[]>();

  for (const { branch, head } of branches) {
    if (protectedBranches.has(branch)) {
      branchDisposition.set(branch, { status: "kept" });
      if (!mergedByBranch.get(branch)) {
        const group = unmergedGroups.get(head) ?? [];
        group.push(branch);
        unmergedGroups.set(head, group);
      }
      continue;
    }
    if (mergedByBranch.get(branch)) {
      branchDisposition.set(branch, { status: "merged" });
      continue;
    }
    const group = unmergedGroups.get(head) ?? [];
    group.push(branch);
    unmergedGroups.set(head, group);
  }

  for (const group of unmergedGroups.values()) {
    const protectedInGroup = group.filter((b) => protectedBranches.has(b)).toSorted(compareKeepOrder);
    const winner = protectedInGroup[0] ?? group.toSorted(compareKeepOrder)[0]!;
    if (!branchDisposition.has(winner)) {
      branchDisposition.set(winner, { status: "kept" });
    }
    for (const branch of group) {
      if (protectedBranches.has(branch) || branch === winner) continue;
      branchDisposition.set(branch, { status: "duplicate", keptBranch: winner });
    }
  }

  const keptHeadToBranch = new Map<string, string>();
  for (const { branch, head } of branches) {
    if (branchDisposition.get(branch)?.status === "kept" && !keptHeadToBranch.has(head)) {
      keptHeadToBranch.set(head, branch);
    }
  }

  const removableWorktrees: CleanWorktreeEntry[] = [];
  for (const { wt, gone, dirty } of inspected) {
    if (gone) {
      removableWorktrees.push({
        path: wt.path,
        ...(wt.branch !== undefined ? { branch: wt.branch } : {}),
        ...(wt.head !== undefined ? { head: wt.head } : {}),
        reason: "pruned",
      });
      continue;
    }
    if (dirty) continue;
    if (wt.branch) {
      const disp = branchDisposition.get(wt.branch);
      if (disp?.status === "merged" || disp?.status === "duplicate") {
        removableWorktrees.push({
          path: wt.path,
          branch: wt.branch,
          ...(wt.head !== undefined ? { head: wt.head } : {}),
          reason: disp.status,
          ...(disp.keptBranch !== undefined ? { keptBranch: disp.keptBranch } : {}),
        });
      }
      continue;
    }
    if (wt.detached && wt.head) {
      if (isMergedRef(wt.head)) {
        removableWorktrees.push({ path: wt.path, head: wt.head, reason: "merged" });
      } else {
        const keptBranch = keptHeadToBranch.get(wt.head);
        if (keptBranch) {
          removableWorktrees.push({
            path: wt.path,
            head: wt.head,
            reason: "duplicate",
            keptBranch,
          });
        }
      }
    }
  }

  const removableBranches: CleanBranchEntry[] = [];
  for (const { branch, head } of branches) {
    const disp = branchDisposition.get(branch);
    if (disp?.status === "merged" || disp?.status === "duplicate") {
      removableBranches.push({
        branch,
        head,
        reason: disp.status,
        ...(disp.keptBranch !== undefined ? { keptBranch: disp.keptBranch } : {}),
      });
    }
  }

  removableWorktrees.sort((a, b) => a.path.localeCompare(b.path));
  removableBranches.sort((a, b) => a.branch.localeCompare(b.branch));

  if (apply) {
    if (removableWorktrees.some((wt) => wt.reason === "pruned")) {
      runOrFail(runner, primary.path, "git", ["worktree", "prune"]);
    }
    for (const wt of removableWorktrees) {
      if (wt.reason === "pruned") continue;
      runOrFail(runner, primary.path, "git", ["worktree", "remove", "--force", wt.path]);
    }
    for (const entry of removableBranches) {
      runOrFail(runner, primary.path, "git", ["branch", "-D", entry.branch]);
    }
  }

  return { apply, worktrees: removableWorktrees, branches: removableBranches };
}

export function formatCleanReport(result: CleanResult): string {
  if (result.worktrees.length === 0 && result.branches.length === 0) {
    return result.apply ? "clean: nothing to remove" : "clean (dry run): nothing to remove";
  }
  const lines: string[] = [];
  for (const wt of result.worktrees) {
    const tag =
      wt.reason === "duplicate" && wt.keptBranch
        ? `duplicate -> ${wt.keptBranch}`
        : wt.reason;
    const branchNote = wt.branch ? ` (${wt.branch})` : "";
    lines.push(`worktree ${wt.path}${branchNote} [${tag}]`);
  }
  for (const b of result.branches) {
    const tag =
      b.reason === "duplicate" && b.keptBranch ? `duplicate -> ${b.keptBranch}` : b.reason;
    lines.push(`branch ${b.branch} [${tag}]`);
  }
  const counts = `${result.worktrees.length} worktree(s), ${result.branches.length} branch(es)`;
  lines.push(
    result.apply
      ? `clean: removed ${counts}`
      : `clean (dry run): would remove ${counts} (pass --apply to remove)`,
  );
  return lines.join("\n");
}

function readArgValue(args: string[], index: number, flag: string): { value: string; next: number } {
  const arg = args[index]!;
  if (arg.startsWith(`${flag}=`)) {
    const value = arg.slice(flag.length + 1);
    if (!value) throw new BriefUsageError(`${flag} requires a value`);
    return { value, next: index };
  }
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new BriefUsageError(`${flag} requires a value`);
  return { value, next: index + 1 };
}

export function parseBriefArgs(args: string[]): { id: string; options: BriefOptions } {
  let id: string | undefined;
  let role: string | undefined;
  let from: string | undefined;
  let roundRaw: string | undefined;
  let findings: string | undefined;
  let diskRaw: string | undefined;
  const avoid: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--role" || arg.startsWith("--role=")) {
      const parsed = readArgValue(args, i, "--role");
      role = parsed.value;
      i = parsed.next;
    } else if (arg === "--from" || arg.startsWith("--from=")) {
      const parsed = readArgValue(args, i, "--from");
      from = parsed.value;
      i = parsed.next;
    } else if (arg === "--round" || arg.startsWith("--round=")) {
      const parsed = readArgValue(args, i, "--round");
      roundRaw = parsed.value;
      i = parsed.next;
    } else if (arg === "--findings" || arg.startsWith("--findings=")) {
      const parsed = readArgValue(args, i, "--findings");
      findings = parsed.value;
      i = parsed.next;
    } else if (arg === "--avoid" || arg.startsWith("--avoid=")) {
      const parsed = readArgValue(args, i, "--avoid");
      avoid.push(parsed.value);
      i = parsed.next;
    } else if (arg === "--disk" || arg.startsWith("--disk=")) {
      const parsed = readArgValue(args, i, "--disk");
      diskRaw = parsed.value;
      i = parsed.next;
    } else if (arg.startsWith("-")) {
      throw new BriefUsageError(`unknown option: ${arg}`);
    } else if (id === undefined) {
      id = arg;
    } else {
      throw new BriefUsageError(`unexpected argument: ${arg}`);
    }
  }

  if (!id) throw new BriefUsageError("missing <id>");
  if (!role) throw new BriefUsageError("--role is required");
  if (!BRIEF_ROLES.includes(role as BriefRole)) {
    throw new BriefUsageError(`unknown role: ${role} (expected ${BRIEF_ROLES.join("|")})`);
  }
  let round: number | undefined;
  if (roundRaw !== undefined) {
    round = Number(roundRaw);
    if (!(Number.isInteger(round) && round >= 1)) {
      throw new BriefUsageError("--round must be a positive integer");
    }
  }
  let diskGb: number | undefined;
  if (diskRaw !== undefined) {
    diskGb = Number(diskRaw);
    if (!(Number.isFinite(diskGb) && diskGb > 0)) {
      throw new BriefUsageError("--disk must be a positive number");
    }
  }
  return {
    id,
    options: {
      role: role as BriefRole,
      ...(from !== undefined ? { from } : {}),
      ...(round !== undefined ? { round } : {}),
      ...(findings !== undefined ? { findings } : {}),
      ...(avoid.length > 0 ? { avoid } : {}),
      ...(diskGb !== undefined ? { diskGb } : {}),
    },
  };
}

export function parseCleanArgs(args: string[]): CleanOptions {
  let apply = false;
  for (const arg of args) {
    if (arg === "--apply") {
      apply = true;
    } else {
      throw new BriefUsageError(`unknown argument: ${arg}`);
    }
  }
  return { apply };
}
