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

- [ ] Tests for start: creates the branch from `origin/main`, refuses when not on
      main, refuses an existing branch.
- [ ] Tests for merge: refuses on `main`; picks the worker branch relative to the task
      branch; existing PLAN tick and verify behaviour unchanged.
- [ ] Tests for land: merges `origin/main` and aborts on conflict; pushes the task branch;
      creates or reuses the PR with the template body; waits for checks; fails on a
      failed or timed-out check; merges with `--merge --delete-branch`; cleans up.
- [ ] Test: no code path runs `git push origin main` (assert on recorded runner calls).
- [ ] `bun run verify` passes.

## Out of scope

- `AGENTS.md`, `PLAN.md`, CI workflows, GitHub repo settings.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
