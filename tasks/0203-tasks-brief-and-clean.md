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

```
Branch/commit: t3/tasks-brief-clean @ 153b95cc
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 40.5s
Done:
- scripts/tasks-ops.ts: `tasks:brief` (worker|reviewer|land) builds the opener
  and one shared rule list (reset+install, own branch/no push/named branches
  kept, shared-machine verify, foreground + role final message, disk +
  scratch, `--avoid` paths), the reviewer three-dot diff, the land steps
  (tasks:merge unless done, tasks:land, link PR, one macos-example rerun, stop
  on anything else) and numbered `--findings`. The task branch comes from
  `task/<id>-*`, or from `tasks/<id>-*.md` before tasks:start.
- `tasks:clean [--apply]` (dry run by default) lists merged, same-commit
  duplicate and pruned worktrees/branches. Of a duplicate group it keeps, in
  order, a pinned branch, one with a live worktree, then task/ over t3/.
  Pinned: primary and invoking checkout, `main`, locked or dirty worktrees,
  unmerged branches under `.cache/tasks/`. `worktree remove` runs without
  --force, so git also refuses a worktree that turned dirty after the check.
- Rewrote the round-1 wip from 710 down to 366 lines: the runner is injected
  rather than duplicated, `--flag=value` parsing and the 3-way task lookup are
  gone, and the three per-role rule copies are now one list. Wired into
  tasks.ts (usage text, exit 2 on UsageError) and package.json.
- Tests in scripts/tasks.test.ts (12 new): every role's opener, rules,
  branches and findings; usage errors from the API and the CLI; clean dry
  run, apply (exactly the listed entries), the invoking checkout and a
  missing origin/main, all on temp repos. A mutation check confirmed that
  removing the dirty or invoking-checkout pin fails the tests.
Not done / risks:
- Diff is 670 lines (257 of them tests), a little over the 600 guide.
- `--round` takes any string (e.g. `1b`), not only an integer.
- A child that just reset to a branch and has not committed yet is a clean
  duplicate. If its twin is kept elsewhere, `--apply` removes its worktree.
  The usage text says to apply only when no child is running.
- Dry run against this repo (not applied) lists t3/5654e3b9 and t3/f2635565
  as duplicates of branches with live worktrees, and t3/fb92ad22 as merged.
- Land step 3 duplicates any automatic macos-example retry 0202 adds; drop it
  when the AGENTS.md delegation section is rewritten.
```

`bun run tasks:brief 0203 --role reviewer --from t3/example`:

```
Follow AGENTS.md. You are the Reviewer for `tasks/0203-tasks-brief-and-clean.md`.

Rules:
- First run `git reset --hard t3/example && bun install --frozen-lockfile`: your worktree may start on any commit and has no `node_modules`.
- Review `git diff task/0203-tasks-brief-and-clean...t3/example` against `tasks/0203-tasks-brief-and-clean.md` Acceptance and AGENTS.md; check generated artifacts, not only verify. Do not fix, commit or push. Do not modify `main`, `task/0203-tasks-brief-and-clean`, `t3/example`; `task/0203-tasks-brief-and-clean` is checked out in `.cache/tasks/0203-tasks-brief-and-clean`.
- The machine is shared: never run two `bun run verify` at once; run focused `bun test <path>` while iterating.
- Run long commands in the foreground and wait for them; never background them or end your turn while one runs.
- Keep extra disk usage under 1 GB and delete your scratch files.
- Your final message is a numbered findings list (each with `file:line` and a failure scenario) or `no findings`, then the `bun run verify` summary line.
```
