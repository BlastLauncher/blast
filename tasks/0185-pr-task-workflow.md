---
id: "0185"
title: Task scripts work through one pull request per task
status: doing
milestone: M14
depends: []
---

## Goal

`bun run tasks:start|merge|land` follow the PR-based loop described in
`AGENTS.md` ("Delegation"): one task branch and one PR per task, and nothing is
pushed to `main` directly.

## Context

- Code: `scripts/tasks.ts`, tests in `scripts/tasks.test.ts` (they use an
  injected `CommandRunner`; keep that style, no real git or network in tests).
- Read the new "Delegation (orchestrator)" section of `AGENTS.md` first; this
  task makes the scripts match it. Do not edit `AGENTS.md` or `PLAN.md`.
- **start `NNNN`**: run from `main` with a clean tree except for an uncommitted or
  committed `tasks/NNNN-*.md` (status `todo`). `git fetch origin`, create
  `task/NNNN-<slug>` from `origin/main` (slug = task file name without id and
  `.md`), switch to it, set `doing`, commit `chore: start NNNN (<title>)`, print the
  brief. If the branch already exists, fail with a clear message.
- **merge `NNNN`**: must run on that task branch (not `main`), clean tree. Same as today
  otherwise, but compare and find worker branches against the task branch
  instead of `main` (`<task-branch>..<worker>`), and skip the task branch itself and
  `main` as candidates.
- **land `NNNN`**: on the task branch with HEAD `chore(NNNN): done` (fix commits after
  it are allowed only if the done commit is in the branch; keep today's subject check
  simple: the done commit must exist on the branch). Steps:
  1. `git fetch origin` and `git merge --no-edit origin/main`; on conflict abort and
     fail naming the files.
  2. `git push -u origin <task-branch>`.
  3. Open a PR with `gh pr create --base main --head <task-branch>` (title = the task
     title prefixed with the conventional type from the task's first non-chore commit,
     or `feat(NNNN):` when unclear; body = `.github/pull_request_template.md` with the
     task id filled in and the task's Handoff block pasted from the merged worker
     branch). Reuse an existing open PR for the branch instead of failing.
  4. Poll `gh pr checks <pr> --json` (or `gh pr view --json statusCheckRollup`) until all
     checks complete, same timeout/poll options as today. Pending-forever checks
     time out with their names listed. Any failure stops with names.
  5. `gh pr merge <pr> --merge --delete-branch`; then `git switch main`,
     `git pull --ff-only origin main`, remove the worker worktree(s) whose branch is
     merged into main and delete those branches and the local task branch.
  6. Print the PR URL.
- Never call `git push origin main` anywhere in the script.

## Acceptance

- [x] Tests for start: creates the branch from `origin/main`, refuses when not on
      main, refuses an existing branch.
- [x] Tests for merge: refuses on `main`; picks the worker branch relative to the task
      branch; existing PLAN tick and verify behaviour unchanged.
- [x] Tests for land: merges `origin/main` and aborts on conflict; pushes the task branch;
      creates or reuses the PR with the template body; waits for checks; fails on a
      failed or timed-out check; merges with `--merge --delete-branch`; cleans up.
- [x] Test: no code path runs `git push origin main` (assert on recorded runner calls).
- [x] `bun run verify` passes.

## Out of scope

- `AGENTS.md`, `PLAN.md`, CI workflows, GitHub repo settings.

## Handoff

```
Branch/commit: t3/062b3be0 (round 2, from task/0185-pr-workflow) @ dc1da66
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 138.1s; 1168 pass, 0 fail
Done:
- start: branch is task/NNNN-<slug> (round 1 dropped the id), from origin/main after
  fetch; an uncommitted or local-only committed task file is carried over; other
  dirty paths, non-main and an existing branch are refused before any fetch.
- merge: runs only on a clean task branch; worker detection skips main and the task
  branch and uses `<task>...<worker>` (three dots: two dots listed other tasks'
  workers, which lack the file, as candidates); fixed round 1's undefined `task`.
- land: done commit must be in HEAD (round 1 searched --all); title and Handoff
  come from the task file in the done commit's parent; merge origin/main, abort and
  name conflicts; push -u the task branch; reuse an open PR (`gh pr list`) or create
  one with the filled template; poll `gh pr checks --json name,state,bucket`
  tolerating its exit 8/1; merge `--merge --delete-branch`; switch main, ff pull;
  remove only worktrees merged via this task; return/print the PR URL.
- tests: 26 in scripts/tasks.test.ts on temp local repos; fetch/push/pull/gh are
  simulated by the injected runner (origin/main is a local ref). Mutations
  (two-dot diff, branch from main, squash, push main, cleanup all) each fail tests.
Not done / risks:
- Diff is ~1000 lines, over the 600 guideline; most is the test rewrite.
- gh pr checks bucket names and exit codes follow gh 2.x docs; not run against GitHub.
- A task file committed on local main stays there; `git pull --ff-only` at the
  end of land then fails until main is reset. Commit task files on the task branch.
```
