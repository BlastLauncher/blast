import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { TASK_FILE } from "./check-workflow.ts";
import type { CommandRunner } from "./tasks.ts";

/** Bad command-line input; the CLI prints the subcommand usage and exits 2. */
export class UsageError extends Error {}

function fail(message: string): never {
  throw new Error(message);
}

export const ROLES = ["worker", "reviewer", "land"] as const;
export type Role = (typeof ROLES)[number];

export interface BriefOptions {
  role: Role;
  from?: string;
  round?: string;
  /** Path (relative to the root) of a findings file, one finding per line or list item. */
  findings?: string;
  avoid?: string[];
  diskGb?: number;
}

/** The task branch: `task/<id>-*` if started, else derived from `tasks/<id>-*.md`. */
function taskBranchFor(root: string, id: string, runner: CommandRunner): string {
  const refs = runner(
    "git",
    ["for-each-ref", "--format=%(refname)", `refs/heads/task/${id}-*`],
    root,
  );
  const branches = refs.stdout
    .split("\n")
    .filter(Boolean)
    .map((ref) => ref.slice("refs/heads/".length));
  if (branches.length > 1) fail(`multiple task branches for ${id}: ${branches.join(", ")}`);
  if (branches[0]) return branches[0];
  const dir = join(root, "tasks");
  const file = existsSync(dir)
    ? readdirSync(dir).find((name) => TASK_FILE.test(name) && name.startsWith(`${id}-`))
    : undefined;
  if (!file) fail(`task ${id} has no task/${id}-* branch and no tasks/${id}-*.md file`);
  return `task/${file.replace(/\.md$/, "")}`;
}

/** Findings as items: list markers are stripped, unmarked lines continue the previous item. */
export function findingItems(text: string): string[] {
  const marker = /^\s*(?:\d+[.)]|[-*])\s+/;
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.some((line) => marker.test(line))) return lines.map((line) => line.trim());
  const items: string[] = [];
  for (const line of lines) {
    if (marker.test(line) || items.length === 0) items.push(line.replace(marker, "").trim());
    else items[items.length - 1] += `\n   ${line.trim()}`;
  }
  return items;
}

const code = (items: string[]) => [...new Set(items)].map((item) => `\`${item}\``).join(", ");

/** The standard brief for a delegated child; the orchestrator appends task-specific checks. */
export function briefTask(
  root: string,
  id: string,
  options: BriefOptions,
  runner: CommandRunner,
): string {
  const { role, from } = options;
  if (!ROLES.includes(role)) throw new UsageError(`unknown role: ${String(role)}`);
  if (role !== "worker" && !from) throw new UsageError(`--role ${role} requires --from <branch>`);
  if (role === "land" && options.findings)
    throw new UsageError("--findings is for worker and reviewer");
  const findings = options.findings
    ? findingItems(readFileSync(resolve(root, options.findings), "utf8"))
    : [];
  if (options.findings && findings.length === 0)
    fail(`findings file is empty: ${options.findings}`);

  const taskBranch = taskBranchFor(root, id, runner);
  const slug = taskBranch.slice("task/".length);
  const taskPath = `tasks/${slug}.md`;
  const start = from ?? taskBranch;
  const title = { worker: "Worker", reviewer: "Reviewer", land: "Land agent" }[role];
  const round = options.round ? `, round ${options.round}` : "";
  const avoid = options.avoid?.length ? code(options.avoid) : "";
  const keep = `Do not modify ${code(["main", taskBranch, start])}; \`${taskBranch}\` is checked out in \`.cache/tasks/${slug}\`.`;

  const rules = [
    // Land agents run in the shared primary checkout, which stays on `main`:
    // resetting it to the worker branch would move the user's `main`.
    role === "land"
      ? "- Work in the checkout you start in, on `main`; never run `git reset`, `git switch` or `git checkout` there. `bun install --frozen-lockfile` first if `node_modules` is missing."
      : `- First run \`git reset --hard ${start} && bun install --frozen-lockfile\`: your worktree may start on any commit and has no \`node_modules\`.`,
    {
      worker: `- Commit in logical commits on your own branch. Do not push. ${keep}`,
      reviewer: `- Review \`git diff ${taskBranch}...${start}\` against \`${taskPath}\` Acceptance and AGENTS.md; check generated artifacts, not only verify. Do not fix, commit or push. ${keep}`,
      land: `- Push and merge only through \`tasks:land\`. ${keep}`,
    }[role],
    "- The machine is shared: never run two `bun run verify` at once; run focused `bun test <path>` while iterating.",
    "- Run long commands in the foreground and wait for them; never background them or end your turn while one runs.",
    `- Keep extra disk usage under ${options.diskGb ?? 1} GB and delete your scratch files.`,
    ...(avoid
      ? [
          role === "reviewer"
            ? `- A parallel task owns ${avoid}: report any change to them as a finding.`
            : `- A parallel task owns ${avoid}: do not edit them.`,
        ]
      : []),
    {
      worker: `- Before finishing, \`bun run verify\` passes and the Handoff section of \`${taskPath}\` is filled in and committed; never end your turn with uncommitted work. Your final message is only the Handoff block.`,
      reviewer:
        "- Your final message is a numbered findings list (each with `file:line` and a failure scenario) or `no findings`, then the `bun run verify` summary line.",
      land: "- Your final message is `PR <url>, head <sha>, checks <state>`.",
    }[role],
  ];

  const lines = [
    `Follow AGENTS.md. You are the ${title} for \`${taskPath}\`${round}.`,
    "",
    "Rules:",
    ...rules,
  ];
  if (role === "land") {
    lines.push(
      "",
      `Steps (\`tasks:merge\` and \`tasks:land\` work in \`.cache/tasks/${slug}\` from any checkout):`,
      `1. Unless \`git log --format=%s origin/main..${taskBranch}\` lists \`chore(${id}): done\`, run \`bun run tasks:merge ${id} --branch ${start}\`.`,
      `2. Run \`bun run tasks:land ${id}\`. Once the PR exists (\`gh pr view ${taskBranch} --json url\`), link it with \`link_pull_request\`.`,
      `3. If the only failed check is \`macos-example\` with "not acquired by Runner", run \`gh run rerun <run-id> --failed\` once (the run id is in the check's URL), then run \`bun run tasks:land ${id}\` again.`,
      "4. Stop on anything else (verify failure, merge conflict, another failed check) and report it; do not fix it.",
    );
  }
  if (findings.length > 0) {
    lines.push(
      "",
      role === "worker"
        ? "Fix these review findings:"
        : "Check that these findings from the previous round are fixed:",
      ...findings.map((item, index) => `${index + 1}. ${item}`),
    );
  }
  return lines.join("\n");
}

const VALUE_FLAGS = ["--role", "--from", "--round", "--findings", "--avoid", "--disk"];

export function parseBriefArgs(args: string[]): { id: string; options: BriefOptions } {
  const values = new Map<string, string[]>();
  let id: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (VALUE_FLAGS.includes(arg)) {
      const value = args[++i];
      if (!value || value.startsWith("--")) throw new UsageError(`${arg} requires a value`);
      values.set(arg, [...(values.get(arg) ?? []), value]);
    } else if (arg.startsWith("-")) throw new UsageError(`unknown option: ${arg}`);
    else if (id === undefined) id = arg;
    else throw new UsageError(`unexpected argument: ${arg}`);
  }
  const last = (flag: string) => values.get(flag)?.at(-1);
  const role = last("--role");
  if (!id) throw new UsageError("missing <id>");
  if (!role) throw new UsageError("--role is required");
  if (!ROLES.includes(role as Role)) throw new UsageError(`unknown role: ${role}`);
  const disk = last("--disk");
  const diskGb = disk === undefined ? undefined : Number(disk);
  if (diskGb !== undefined && !(diskGb > 0))
    throw new UsageError("--disk must be a positive number");
  const options: BriefOptions = { role: role as Role };
  const from = last("--from");
  const round = last("--round");
  const findings = last("--findings");
  if (from) options.from = from;
  if (round) options.round = round;
  if (findings) options.findings = findings;
  if (values.has("--avoid")) options.avoid = values.get("--avoid")!;
  if (diskGb !== undefined) options.diskGb = diskGb;
  return { id, options };
}

type ListedWorktree = {
  path: string;
  head?: string;
  branch?: string;
  prunable: boolean;
  locked: boolean;
};

function listWorktrees(text: string): ListedWorktree[] {
  const result: ListedWorktree[] = [];
  for (const line of text.split("\n")) {
    if (line.startsWith("worktree ")) {
      result.push({ path: line.slice("worktree ".length), prunable: false, locked: false });
      continue;
    }
    const current = result.at(-1);
    if (!current) continue;
    if (line.startsWith("HEAD ")) current.head = line.slice("HEAD ".length);
    else if (line.startsWith("branch refs/heads/"))
      current.branch = line.slice("branch refs/heads/".length);
    else if (/^prunable(?: |$)/.test(line)) current.prunable = true;
    else if (/^locked(?: |$)/.test(line)) current.locked = true;
  }
  return result;
}

function canonical(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

export type CleanEntry = {
  kind: "worktree" | "branch";
  /** Worktree path or branch name. */
  name: string;
  branch?: string;
  reason: "merged" | "duplicate" | "pruned";
  /** For a duplicate: the branch at the same commit that is kept. */
  kept?: string;
};

// Which branch of a same-commit group survives: pinned, then one with a live
// worktree, then task/ over other names over T3's throwaway t3/ names.
const tier = (branch: string) =>
  branch.startsWith("task/") ? 0 : branch.startsWith("t3/") ? 2 : 1;

/**
 * Lists, and with `apply` removes, worktrees and local branches that are merged
 * into origin/main, sit at the same commit as a kept branch, or whose worktree
 * directory is gone. Never touches the primary or invoking checkout, `main`,
 * locked or dirty worktrees, unique unmerged work, or an unmerged branch
 * checked out under `.cache/tasks/`.
 */
export function cleanTasks(root: string, apply: boolean, runner: CommandRunner): CleanEntry[] {
  const git = (cwd: string, ...args: string[]) => {
    const result = runner("git", args, cwd);
    if (result.status !== 0) fail(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
    return result.stdout;
  };
  const all = listWorktrees(git(root, "worktree", "list", "--porcelain"));
  const primary = all[0]!.path;
  if (
    runner("git", ["rev-parse", "--verify", "--quiet", "refs/remotes/origin/main"], primary).status
  )
    fail("origin/main does not exist; run git fetch origin");
  const merged = (ref: string) =>
    runner("git", ["merge-base", "--is-ancestor", ref, "refs/remotes/origin/main"], primary)
      .status === 0;
  const dirty = (path: string) => {
    const status = runner("git", ["status", "--porcelain", "--untracked-files=all"], path);
    return status.status !== 0 || status.stdout.trim() !== "";
  };
  const here = canonical(git(root, "rev-parse", "--show-toplevel").trim());
  const taskCache = join(canonical(primary), ".cache", "tasks") + sep;

  const heads = new Map<string, string>();
  for (const line of git(
    primary,
    "for-each-ref",
    "--format=%(refname) %(objectname)",
    "refs/heads",
  ).split("\n")) {
    const [ref, sha] = line.split(" ");
    if (ref && sha) heads.set(ref.slice("refs/heads/".length), sha);
  }
  const isMerged = new Map([...heads.keys()].map((b) => [b, merged(`refs/heads/${b}`)]));

  const entries: CleanEntry[] = [];
  const pinned = new Set(["main"]);
  const live: ListedWorktree[] = [];
  for (const [index, wt] of all.entries()) {
    const path = canonical(wt.path);
    const pin =
      index === 0 ||
      path === here ||
      wt.locked ||
      (!wt.prunable &&
        existsSync(wt.path) &&
        (dirty(wt.path) ||
          (path.startsWith(taskCache) && !!wt.branch && !isMerged.get(wt.branch))));
    if (pin) {
      if (wt.branch) pinned.add(wt.branch);
    } else if (wt.prunable || !existsSync(wt.path)) {
      entries.push({
        kind: "worktree",
        name: wt.path,
        ...(wt.branch ? { branch: wt.branch } : {}),
        reason: "pruned",
      });
    } else live.push(wt);
  }
  const hasLive = new Set(live.flatMap((wt) => (wt.branch ? [wt.branch] : [])));

  const removed = new Map<string, Pick<CleanEntry, "reason" | "kept">>();
  const groups = new Map<string, string[]>();
  for (const [branch, sha] of heads) {
    if (isMerged.get(branch)) {
      if (!pinned.has(branch)) removed.set(branch, { reason: "merged" });
    } else groups.set(sha, [...(groups.get(sha) ?? []), branch]);
  }
  const rank = (b: string) => [pinned.has(b) ? 0 : 1, hasLive.has(b) ? 0 : 1, tier(b)];
  for (const group of groups.values()) {
    const kept = group.toSorted((a, b) => {
      const [ra, rb] = [rank(a), rank(b)];
      return ra[0]! - rb[0]! || ra[1]! - rb[1]! || ra[2]! - rb[2]! || a.localeCompare(b);
    })[0]!;
    for (const branch of group)
      if (branch !== kept && !pinned.has(branch))
        removed.set(branch, { reason: "duplicate", kept });
  }
  const keptAt = new Map<string, string>();
  for (const [branch, sha] of heads)
    if (!removed.has(branch) && !keptAt.has(sha)) keptAt.set(sha, branch);

  for (const wt of live) {
    let why = wt.branch ? removed.get(wt.branch) : undefined;
    if (!wt.branch && wt.head) {
      const kept = keptAt.get(wt.head);
      why = merged(wt.head)
        ? { reason: "merged" }
        : kept
          ? { reason: "duplicate", kept }
          : undefined;
    }
    if (why)
      entries.push({
        kind: "worktree",
        name: wt.path,
        ...(wt.branch ? { branch: wt.branch } : {}),
        ...why,
      });
  }
  for (const [branch, why] of [...removed].toSorted(([a], [b]) => a.localeCompare(b)))
    entries.push({ kind: "branch", name: branch, ...why });

  if (apply) {
    if (entries.some((entry) => entry.reason === "pruned")) git(primary, "worktree", "prune");
    // No --force: git refuses a worktree that became dirty after the check above.
    for (const entry of entries)
      if (entry.kind === "worktree" && entry.reason !== "pruned")
        git(primary, "worktree", "remove", entry.name);
    for (const entry of entries)
      if (entry.kind === "branch") git(primary, "branch", "-D", entry.name);
  }
  return entries;
}

export function cleanReport(entries: CleanEntry[], apply: boolean): string {
  const lines = entries.map(
    (entry) =>
      `${entry.kind} ${entry.name}${entry.kind === "worktree" && entry.branch ? ` (${entry.branch})` : ""}: ${entry.reason}${entry.kept ? ` (same commit as ${entry.kept})` : ""}`,
  );
  const worktrees = entries.filter((entry) => entry.kind === "worktree").length;
  const counts = `${worktrees} worktree(s) and ${entries.length - worktrees} branch(es)`;
  lines.push(
    apply
      ? `removed ${counts}`
      : `dry run: would remove ${counts}; rerun with --apply to remove them`,
  );
  return lines.join("\n");
}

export function parseCleanArgs(args: string[]): boolean {
  for (const arg of args) if (arg !== "--apply") throw new UsageError(`unknown argument: ${arg}`);
  return args.includes("--apply");
}
