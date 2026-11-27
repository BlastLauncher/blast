---
id: "0203"
title: tasks:brief prints standard delegation briefs; tasks:clean removes stale worktrees and branches
status: doing
milestone: M19
depends: ["0201"]
---

## Goal

The orchestrator gets every child's standard rules from one command instead
of retyping them, and one command clears merged or duplicate worktrees and
branches.

## Context

- Every brief in M17–M19 repeated the same preamble, and briefs that left a
  rule out got the failure it prevents (a worker ended its turn mid-test with
  uncommitted work; children started on the wrong commit; a land child
  backgrounded `tasks:land`). The rules:
  - start with `git reset --hard <branch> && bun install --frozen-lockfile`
    (T3 may cut the worktree from any commit; a fresh worktree has no
    `node_modules`);
  - commit on your own branch, do not push, do not modify the named branches;
  - the machine is shared: never run two `verify` at once;
  - run long commands in the foreground and wait; the final message is the
    Handoff block (worker), a numbered findings list or "no findings" plus the
    verify summary line (reviewer), or `PR <url>, head <sha>, checks <state>`
    (land);
  - disk budget, and delete scratch files;
  - files to stay out of (a parallel task owns them).
- `bun run tasks:brief <id> --role worker|reviewer|land [--from <branch>]
  [--round <n>] [--findings <file>] [--avoid <path>]... [--disk <GB>]` prints
  the full brief to stdout: the AGENTS.md opener ("Follow AGENTS.md. You are
  the Worker for `tasks/NNNN-*.md`."), the rules above, the reviewer diff
  command (`git diff <task-branch>...<from>`), numbered findings for a new
  round, and for `land` the `tasks:merge`/`tasks:land` steps as they work
  after task 0201 (task worktree under `.cache/tasks/`, foreground, one
  `macos-example` "not acquired by Runner" rerun, stop on anything else,
  link the PR). Keep the wording short; the orchestrator adds task-specific
  checks after it.
- `bun run tasks:clean [--apply]`: lists, and with `--apply` removes,
  worktrees and local branches that are merged into `origin/main`, or sit at
  the same commit as another branch whose work is kept, or whose worktree
  directory is gone (`git worktree prune`). It never touches the primary
  checkout, `main`, a branch with commits not on `origin/main` (unless a
  same-commit twin is kept), a worktree with uncommitted changes, or a
  branch that is checked out in a running task worktree under `.cache/tasks/`
  unless it is merged. Default is a dry run.
- Code lives in `scripts/tasks.ts` (or a small sibling module) with tests in
  `scripts/tasks.test.ts`. Task 0202 edits `waitForChecks` in parallel; stay
  away from it.
- The orchestrator rewrites the AGENTS.md delegation section on this task
  branch after you finish; do not edit AGENTS.md.

## Acceptance

- [ ] Tests: each `tasks:brief` role prints its opener, every rule above, the
      right branch names and, with `--findings`, numbered findings; unknown
      roles and missing `--from` for reviewer/land fail with usage.
- [ ] Tests (temp git repos): `tasks:clean` dry run lists merged, duplicate
      and pruned entries; `--apply` removes exactly those; unmerged work,
      dirty worktrees, `main` and the primary checkout are never touched.
- [ ] `bun run tasks:brief 0203 --role reviewer --from t3/example` prints a
      complete brief (paste it into Handoff).
- [ ] `bun run verify` passes.

## Out of scope

- `waitForChecks`, CI retry and the verify lock (task 0202).
- Editing `PLAN.md`, `AGENTS.md` or other task files.

## Handoff

Filled in by the worker when finishing:

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
