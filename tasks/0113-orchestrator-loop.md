---
id: "0113"
title: Orchestrator loop commands (tasks:next, start, merge, land)
status: doing
milestone: M7
depends: []
---

## Goal

The mechanical part of the AGENTS.md delegation loop becomes four `bun run
tasks:*` commands. Each one checks its preconditions and stops at the first
failure. Delegating to a worker and reviewing stay with the orchestrator.

## Context

The loop is AGENTS.md "Delegation", steps 1 and 4. Run by hand, it has gone
wrong in these ways:

- merging a guessed branch name instead of the one in `git worktree list`;
- `;`-chained commands that kept going after a failure, so cleanup deleted an
  unmerged branch;
- PLAN.md going over its line limit;
- gating on `bun run verify | tail` without the exit code.

Build one script, `scripts/tasks.ts`, with pure parsing and planning logic
plus a thin runner. Add the package.json scripts `tasks:next`, `tasks:start`,
`tasks:merge` and `tasks:land`. Reuse the task-file parsing rules from
`scripts/check-workflow.ts`: export and share them rather than duplicating.

1. `tasks:next [--json]` lists ready tasks. A task is ready when its status is
   `todo` and every id in `depends` has no file in `tasks/`, because merged
   tasks are deleted. The list is ordered by id. Dependencies that are still
   open are shown as blocking.
2. `tasks:start <id>`
   - **Preconditions:** you are on `main`, the tree is clean, and the task
     exists with status `todo`.
   - **Effect:** sets `status: doing` and commits
     `chore: start NNNN (<title>)` with the Co-Authored-By trailer.
   - **Output:** the worker brief, exactly `Follow AGENTS.md. You are the
     Worker for \`tasks/<file>\`.`
3. `tasks:merge <id> [--branch <b>]`
   - **Branch:** without `--branch`, find the single worktree branch whose
     commits touch `tasks/<file>` or whose name contains the slug. If there
     are zero or several candidates, fail and list them.
   - **Preconditions:** on `main`, clean tree, the branch exists and is ahead
     of `main`.
   - **Effect, in order:**
     1. `git merge --no-ff`;
     2. delete the task file;
     3. tick `- [ ] NNNN` in PLAN.md. If there is no such line, require
        `--plan "<text>"` to append to the current milestone's checklist.
     4. Run `check:workflow`, then `bun run verify`, judging by exit code.
     5. Commit `chore(NNNN): done`.
   - **Failures:**
     - A merge conflict aborts the merge and exits non-zero.
     - A failed verify leaves the merge commit in place but makes no done
       commit. It prints what to fix and exits non-zero.
4. `tasks:land <id>`
   - **Preconditions:** the done commit is HEAD.
   - **Effect, in order:**
     1. `git push origin main`.
     2. Wait for every GitHub Actions run for HEAD to complete, using
        `gh run list --commit`. Poll with a bounded timeout and an injected
        clock or sleep.
     3. Exit non-zero, naming the failed jobs, if any run did not succeed.
     4. Only after success, remove that task's worktree with `git worktree
        remove` and delete its branch with `git branch -d`, never `-D`.

Tests:

- Run real `git` in temporary repos under `os.tmpdir()`.
- `gh`, `git push` and `bun run verify` go through an injected runner, faked in
  tests.
- No network.
- Cover the precondition failures, ambiguous branch detection, merge conflict
  abort, the verify-failure path, the PLAN tick and the missing-line path, CI
  failure (no cleanup), and CI success (cleanup).

## Safety (hard rules)

T3 Code, the app running the agents, has an open window on this Mac.

- Never run `tasks:land`, `git push` or `gh` against the real repository.
- Never run any of the new commands on the real checkout. Tests use temporary
  repos only.
- Never `rm -rf` a path held in a shell variable; use `fs.rm` on paths the test
  created.
- Do not edit AGENTS.md or PLAN.md; the orchestrator updates them after review.

## Acceptance

- [ ] `scripts/tasks.ts` and its tests cover every bullet under "Tests".
- [ ] `bun run tasks:next` on the real repo prints this task's state; reading
      is safe.
- [ ] `check-workflow.ts` shares its task parsing with `tasks.ts`, and the
      existing check-workflow tests pass unchanged.
- [ ] docs/ gets no new file. The Handoff includes a five-line usage summary
      for the orchestrator to put into AGENTS.md.
- [ ] `bun run verify` passes.

## Out of scope

- Calling T3 or delegation APIs.
- Writing task files.
- Choosing models.
- Releases.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
