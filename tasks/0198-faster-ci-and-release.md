---
id: "0198"
title: Measure and cut CI, release and local verify time
status: doing
milestone: M18
depends: []
---

## Goal

A task lands faster: PR CI, the v3 prerelease workflow, local `bun run verify`
and `tasks:land` each take measurably less wall time, with no check dropped
silently. A short before/after table proves it.

## Context

- Workflows: `.github/workflows/ci.yml` (jobs `verify` ~116 s, `macos-example`
  ~66 s plus runner queueing, `go-example` ~28 s, `python-example` ~21 s,
  `tmux-plugin` ~15 s; whole run ~2 min), `prerelease.yml` (~4 min on every
  `main` push touching packages; it re-runs verify, build, smoke, browser e2e).
  `site.yml`, `compat-upgrade.yml`, `sync-tmux-plugin.yml` also exist.
- Local gate: `scripts/verify.ts` runs format, lint, typecheck, compat,
  protocol, mac-fixtures, workflow, then `bun test` (~100–115 s, of which
  tests ~90 s over ~1250 tests). Verify randomizes test order; keep that.
- `tasks:land` (`scripts/tasks.ts`, `waitForChecks`) polls PR checks; look at
  its poll interval and whether it could start earlier or wait less.
- Recent pain: GitHub macOS arm64 runners sometimes are never acquired
  ("not acquired by Runner … capacity constraints"), blocking the land. One
  `scripts/tasks.test.ts` test with a 5 s timeout flaked under heavy load.
- First measure: per-job and per-step durations from recent runs
  (`gh run view <id> --json jobs`), the slowest test files
  (`bun test` timing), and how much of each job is install/cache/setup.
  Then optimize in order of measured payoff. Candidate ideas, only if the
  numbers support them: dependency and toolchain caching (Bun, Go, Swift
  `.build`, Playwright Chromium), path filters so example jobs run only when
  their inputs change, running independent verify steps in parallel,
  splitting the slowest tests, avoiding duplicate work between `ci.yml` and
  `prerelease.yml` for the same commit, `concurrency` cancel of superseded PR
  runs, shorter land polling.
- Branch protection may list required check names. A job that is skipped by
  a path filter must still report success (or keep the same name in a
  skip-path), or merges will hang. Check `gh api repos/BlastLauncher/blast/branches/main/protection`
  (read-only) and design around it; never change repo settings.
- Release safety stays: the publish job must still build, smoke-test and
  browser-test exactly what it publishes, and still use trusted publishing.

## Acceptance

- [x] `docs/performance.md` gains a "CI and release" section (≤ 30 lines) with
      a before/after table: PR CI wall time, each CI job, prerelease run, local
      `bun run verify`, `tasks:land` overhead. Before numbers come from real
      runs on `main`. You do not push, so measure local after numbers
      yourself and mark CI after numbers as estimates; the orchestrator
      replaces them with the PR's real CI times before merging.
- [x] Every check that ran before still runs for the inputs it covers; list
      any check whose trigger changed and why.
- [x] The flaky `scripts/tasks.test.ts` timeout is fixed without just raising
      it blindly (remove the slow work from the test, or make it fake).
- [x] `docs/release.md` reflects any workflow change.
- [x] `bun run verify` passes; tests stay deterministic and randomized.

## Out of scope

- Repository settings, secrets, branch protection changes.
- Dropping the macOS, Go or Python example coverage entirely.
- Docs other than `docs/performance.md` and `docs/release.md` (task 0199
  rewrites the rest in parallel).
- Editing `PLAN.md`, `AGENTS.md` or other task files.

## Handoff

Filled in by the worker when finishing:

```
Branch/commit: t3/f8ab3aa3 @ 4acda3f6 (followed by this docs + handoff commit; merged origin/main @ a0196725)
Verify:
  Concurrency sweep on 8-core M3 (--seed=20261127, restored timeouts):
    - Round 2 unbounded (reviewer): ~26s wall, load 7 -> 24, 12 bun + 21 node + 11 esbuild (looped/concurrent >400 load)
    - BLAST_VERIFY_JOBS=2: 42.5s wall, load 2.84 -> 3.76, peak (5 bun, 12 node, 3 esbuild)
    - BLAST_VERIFY_JOBS=3 (chosen default for 8c): 30.2s wall, load 3.32 -> 3.87, peak (7 bun, 11 node, 6 esbuild)
    - BLAST_VERIFY_JOBS=4: 28.0s wall, load 3.87 -> 7.75, peak (8 bun, 12 node, 6 esbuild)
  Stress check (a) — 5 consecutive runs with default bounded settings (jobs=3 on 8c):
    - Run 1 (--seed=2524085356): verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 30.4s [tests 28.23s, load 2.49 -> 4.87]
    - Run 2 (--seed=2515569068): verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 30.9s [tests 28.63s, load 4.87 -> 7.69]
    - Run 3 (--seed=252573629):  verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 34.3s [tests 32.05s, load 7.40 -> 8.91]
    - Run 4 (--seed=2638700937): verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 33.3s [tests 31.00s, load 8.28 -> 9.16]
    - Run 5 (--seed=396499013):  verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 32.6s [tests 30.15s, load 8.51 -> 8.51]
  Stress check (b) — 2 concurrent checkouts of 4acda3f6 (total wall 54.4s, uptime sampled every 1s: start load 5.86, peak load 18.06 across 53 samples):
    - Checkout 1 (--seed=2660596725): verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 50.7s [tests 48.39s]
    - Checkout 2 (--seed=3988266174): verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 52.0s [tests 47.64s]
Done:
- Round 1: parallelized `scripts/verify.ts` static/contract steps and switched tests to `bun test --parallel --no-isolate --randomize`, split slow CLI/serve suites, bounded `scripts/mac-fixtures.ts` and added `defaultNodePath()`, shortened `tasks:land` polling (`DEFAULT_LAND_POLL_MS = 5_000`) and replaced slow real-git work in `scripts/tasks.test.ts`, added CI path filters and Swift/Chromium caching, added `prerelease.yml` `verify-ci` reuse (`scripts/release/wait-ci-verify.ts`), and updated `docs/performance.md` + `docs/release.md`.
- Round 2: added sync-replay unsubscribe safety (`packages/host/src/test-helper.ts`, `packages/tui/src/test-support.ts`, `packages/host/src/session.ts`, `packages/cli/src/cli.ts`, `scripts/bench/index.ts`, `scripts/corpus/smoke-command.ts`), isolated `dataDir` in `packages/host/src/bundle.test.ts`, added `NODE_COMPILE_CACHE` in `packages/runtime/src/process-test-helper.ts`, and clarified `verify-ci` fallback comments.
- Round 3 — bounded verify concurrency: added `resolveVerifyLimits()` in `scripts/verify.ts` (with `BLAST_VERIFY_JOBS` env override and `scripts/verify.test.ts`) defaulting to `~40%` of host cores (`jobs = 1/2/3/6` on `2/4/8/16` cores): runs pure static checks in a bounded pool (`staticConcurrency <= 2`) with `--threads <= 2` forwarded to `oxfmt` (`scripts/fmt.ts`) and `oxlint`, runs `mac-fixtures` separately afterwards with bounded `--concurrency <= 2` (`defaultFixtureConcurrency()` in `scripts/mac-fixtures.ts`), and runs `bun test --parallel=<jobs> --no-isolate --max-concurrency=<min(4, jobs)>`.
- Round 3 — timeout restoration: removed `--timeout=15000` from `scripts/verify.ts`, restored `WAIT_TIMEOUT_MS = 3_000` in `packages/runtime/src/process-test-helper.ts` (keeping `NODE_COMPILE_CACHE`), restored the four `2000` ms timeouts in `packages/runtime/src/main.test.ts`, restored `2500` ms in `packages/cli/src/cli-capabilities.test.ts:240`, and lowered `waitForScene` default timeout in `packages/host/src/test-helper.ts` from 15 s to 5 s. No timeout raises needed to be kept.
- Round 3 — workflow & TUI fixes + docs: exported `playwrightVersion` from `packages/web/build/assets.ts` and derived `.github/workflows/prerelease.yml`'s Chromium cache key from it while keeping `--with-deps` on cache miss and running `playwright install-deps chromium` on cache hit; wrapped `waitSceneMatch`'s sync replay in `try/catch` in `packages/tui/src/test-support.ts` (with a regression test in `packages/tui/src/session.test.ts`); updated `docs/performance.md` with bounded local verify timings.
Not done / risks:
- CI/prerelease after numbers in `docs/performance.md` remain estimates until the orchestrator replaces them with the PR/main run timings.
- Final `bun run verify` after the docs/handoff edit (below) verifies formatting, workflow limits, and tests on the final commit.
```
