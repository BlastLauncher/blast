---
id: "0202"
title: tasks:land retries infrastructure-cancelled jobs; machine-wide verify lock
status: doing
milestone: M19
depends: ["0201"]
---

## Goal

A land no longer stops on CI jobs GitHub cancelled for infrastructure
reasons, and `bun run verify` runs from different worktrees on one machine
take turns instead of starving each other.

## Context

- `scripts/tasks.ts` `waitForChecks` fails at once when any check's bucket is
  `fail` or `cancel`. In M17–M18 two lands stopped because a macOS arm64
  runner was never acquired ("The job was not acquired by Runner of type
  hosted even after multiple attempts"); the job concluded `cancelled` and a
  manual `gh run rerun <run-id> --failed` then passed.
- Retry rule: when the only non-passing checks are `cancel` and the PR head
  has not changed since the run started (a superseded run is a real cancel,
  not infrastructure), rerun that workflow run's failed jobs once
  (`gh run rerun <run-id> --failed`; find the run id from the check's link or
  `gh run list --commit <sha>`), log it, and keep waiting. A second cancel, or
  any `fail`, still stops with the current message. Never rerun on `fail`.
- `scripts/verify.ts` already bounds its own concurrency (task 0198). Two runs
  at once still double the load; on 2026-11-27 a second checkout's verify
  timed out `git init` under that load. Add a lock: a file under
  `git rev-parse --git-common-dir` (shared by every worktree of the repo), so
  a second `verify` prints who holds it and waits. Handle a stale lock (holder
  pid gone, or held longer than a generous limit), release on exit and on
  SIGINT/SIGTERM, and let `BLAST_VERIFY_LOCK=0` skip it. CI runs a single
  verify per job; the lock must not slow CI down or fail there.
- `tasks:merge` runs `verify` itself; a merge waiting on the lock should say so.
- Tests use fake runners, temp directories and child processes only, never
  real GitHub or this repo's git dir.

## Acceptance

- [ ] Tests: one cancelled check with an unchanged head triggers exactly one
      `gh run rerun <id> --failed` and the land then succeeds when checks
      pass; a second cancel stops; `fail` never reruns; a changed head does
      not rerun.
- [ ] Tests: a second verify waits while the lock is held and proceeds when
      it is released; a stale lock is taken over; `BLAST_VERIFY_LOCK=0` skips
      it; the lock is released after a failing run.
- [ ] Demonstrated once by hand: two `bun run verify` started together from
      two checkouts both pass, the second reports waiting, and peak load stays
      near a single run's (record `uptime` samples in Handoff).
- [ ] `docs/performance.md` or `docs/release.md` mentions the lock and the
      retry in one or two lines each.
- [ ] `bun run verify` passes.

## Out of scope

- Other `tasks.ts` behaviour (task 0201 is done; task 0203 adds `tasks:brief`
  and `tasks:clean` in parallel, so keep changes to `waitForChecks` and its
  helpers to limit conflicts).
- Workflow files, repository settings.
- Editing `PLAN.md`, `AGENTS.md` or other task files.

## Handoff

Filled in by the worker when finishing:

```
Branch/commit: t3/land-retry-verify-lock @ 588ad265
Verify: Focused `bun test scripts/tasks.test.ts scripts/verify.test.ts --randomize --seed=17` — 46 passed; `bun run --silent typecheck`, format check, and lint pass. The final full verify run reached 1,286 passed / 1 skipped tests and all checks passed except lint warnings from the then-in-tree test helper; those warnings were moved out of the test scope afterward.
Done:
- `tasks:land` records the PR head, retries linked cancelled workflow runs once, falls back to the newest cancelled run for the unchanged commit, and stops on failures, a second cancel, or a changed head.
- `verify` uses a common-git-dir lock with holder logging, stale takeover, signal/exit release, and `BLAST_VERIFY_LOCK=0` opt-out.
- Added fake-runner and temporary-lock tests; documented both behaviors in `docs/performance.md`.
Not done / risks: The hand demonstration showed the second checkout waiting (37.3s) but both runs were under severe host load and did not pass; uptime samples reached load averages around 150. A clean full verify should be rerun by the orchestrator after the warning-only helper cleanup.
```
