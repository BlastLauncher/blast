---
id: "0201"
title: Task scripts work from their own worktree and never move the primary checkout
status: doing
milestone: M19
depends: []
---

## Goal

`tasks:start`, `tasks:merge` and `tasks:land` do all their git work in a
per-task worktree. The primary checkout stays on `main` for the whole loop, so
delegated children always start from `main`, landings can run from any
checkout, and `tasks:merge` reliably picks the worker branch.

## Context

- `scripts/tasks.ts` (`startTask`, `candidateBranches`, `updatedPlan`,
  `mergeTask`, `doneTask`, `taskWorkers`, `landTask`) and `scripts/tasks.test.ts`.
  Today `startTask` requires the primary checkout to be on a clean `main` and
  switches it to the task branch; `mergeTask`/`landTask` require being on the
  task branch; `landTask` ends with `git switch main` + `git pull`.
- Why it matters (from M17–M18): T3 cuts each child's worktree from the
  primary checkout's current commit, so while a land held it on a task branch,
  new children started on the wrong commit. Landing had to run in the primary
  checkout, one at a time. Reviewer worktrees sit on the same commit as the
  worker's branch, so the branch scan found two candidates and nearly every
  merge needed `--branch`. `tasks:merge` checks the PLAN line before merging
  the worker branch, so a line added on that branch was "missing". Parallel
  tasks ticking neighbouring PLAN lines made `tasks:land` stop on conflicts.
- Design (adjust if the code shows a better way, and say why in Handoff):
  1. A task worktree at a deterministic, gitignored path (for example
     `.cache/tasks/<NNNN-slug>`) holds the task branch. Make sure fmt, lint,
     typecheck, `git ls-files`-based test discovery and the docs site never
     pick files up from it.
  2. `tasks:start NNNN` creates the branch from `origin/main` in that worktree
     and commits the task file there (moving it out of the primary checkout).
     The primary checkout's HEAD and tree do not change.
  3. `tasks:merge NNNN` and `tasks:land NNNN` find the task worktree by id and
     work there, from whichever checkout they are run in. A fresh worktree has
     no `node_modules`: run `bun install --frozen-lockfile` there before any
     `bun run` step.
  4. Worker branch selection, in order: `--branch`; the branch named on the
     `Branch/commit:` line of the task's Handoff; then the existing scan, with
     branches at the same commit counted once. Still fail when two
     genuinely different candidates remain.
  5. Check the PLAN line after merging the worker branch, not before.
  6. `tasks:merge NNNN --resume`: when the worker merge commit exists but the
     done commit does not (for example verify failed under load), rerun the
     checks and make the done commit.
  7. In `tasks:land`, when merging `origin/main` conflicts only in `PLAN.md`
     checkbox lines, resolve by keeping every `[x]` from both sides, and still
     stop on any other conflict.
  8. After the PR merges, update local `main` without switching anything:
     fast-forward the primary checkout only if it is on a clean `main`,
     otherwise just `git fetch origin main:main` when it is safe, and report
     which happened. Remove the task worktree and merged worker worktrees.
- `docs/release.md` / `AGENTS.md` describe the loop; workers do not edit
  `AGENTS.md` (the orchestrator updates it in task 0203). Update any other doc
  that states the old checkout behaviour.

## Acceptance

- [ ] Tests (temp git repos, as `scripts/tasks.test.ts` does today, plus fake
      runners where faster) show: start/merge/land leave the primary
      checkout's HEAD, branch and working tree unchanged; merge picks the
      Handoff branch; same-commit duplicates are counted once; a PLAN line
      added on the worker branch is ticked; `--resume` finishes a failed done
      step; PLAN checkbox-only conflicts resolve and other conflicts still stop.
- [ ] `bun run tasks:start`, `tasks:merge`, `tasks:land` usage text and
      `--help` describe the new behaviour.
- [ ] `bun run verify` passes; tests stay deterministic and use no network.

## Out of scope

- Retrying infrastructure-cancelled CI jobs and a machine-wide verify lock (task 0202).
- `tasks:brief`, `tasks:clean`, and `AGENTS.md` (task 0203).
- Editing `PLAN.md`, `AGENTS.md` or other task files.

## Handoff

Filled in by the worker when finishing:

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
