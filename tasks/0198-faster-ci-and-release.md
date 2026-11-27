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
Branch/commit: t3/stabilize-parallel-tests @ eb0b832c (followed by this handoff commit)
Verify: 10/10 consecutive runs passed + fixed --seed=20261127 passed:
  Run 1: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 33.7s [--seed=4157966147]
  Run 2: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 36.5s [--seed=1418558769]
  Run 3: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 39.5s [--seed=3531937687]
  Run 4: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 43.3s [--seed=58974828]
  Run 5: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 52.5s [--seed=598984088]
  Run 6: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 88.2s [--seed=3652059619]
  Run 7: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 41.1s [--seed=3959950567]
  Run 8: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 37.5s [--seed=145312887]
  Run 9: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 34.9s [--seed=2905999356]
  Run 10: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 37.2s [--seed=298756610]
  Fixed seed (--seed=20261127): 1265 pass, 0 fail (1266 tests across 177 files, 1 skipped) — verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 37.3s
Done:
- Round 1: parallelized `scripts/verify.ts` static/contract steps and switched tests to `bun test --parallel --no-isolate --randomize`, split slow CLI/serve suites, bounded `scripts/mac-fixtures.ts` and added `defaultNodePath()`, shortened `tasks:land` polling (`DEFAULT_LAND_POLL_MS = 5_000`) and replaced slow real-git work in `scripts/tasks.test.ts`, added CI path filters and Swift/Chromium caching, added `prerelease.yml` `verify-ci` reuse (`scripts/release/wait-ci-verify.ts`), and updated `docs/performance.md` + `docs/release.md`.
- Round 2 — sync-replay unsubscribe safety: added shared `packages/host/src/test-helper.ts` (`waitForScene`, `waitForSubscription`, excluded from release tarballs via `**/*test-helper.ts`) that unsubscribes synchronously after `subscribe()`/`scenes()` returns when settled during replay, and migrated `runtime-pool.test.ts`, `install-dependencies.test.ts`, `index.test.ts`, `tsconfig-paths.test.ts`, `extension.test.ts`, `root.test.ts`, and `launch-flow.test.ts` onto it (with a regression test in `index.test.ts`). Updated `packages/tui/src/test-support.ts` (`waitScene`, `waitSceneMatch`) to replace `queueMicrotask(() => stop?.())` with synchronous cleanup and migrated `tmux-extension.test.ts`, `tpm-extension.test.ts`, and `session.test.ts`.
- Round 2 — non-test sync-replay fixes & product guard: fixed the same `const stop = session.scenes(...)` TDZ bug in `scripts/bench/index.ts`, guarded sync-replay unsubscribes in `scripts/corpus/smoke-command.ts` and `packages/cli/src/cli.ts`, and made `session.scenes()` in `packages/host/src/session.ts` remove the listener if the synchronous replay callback throws (real users hitting an exception during replay no longer leak a broken listener; normal synchronous replay behaviour is unchanged).
- Round 2 — parallel contention timeouts: added `NODE_COMPILE_CACHE` and raised the 3 s hang guard to 15 s in `packages/runtime/src/process-test-helper.ts`, raised tight 2 s / 2.5 s subprocess timeouts in `packages/runtime/src/main.test.ts` and `packages/cli/src/cli-capabilities.test.ts` to 15 s, isolated `dataDir` in `packages/host/src/bundle.test.ts`, and passed `--timeout=15000` in `scripts/verify.ts` so process-spawning tests do not hit Bun's 5 s default under 8× parallel load.
- Round 2 — `verify-ci` comments: updated header comments in `scripts/release/wait-ci-verify.ts` and `.github/workflows/prerelease.yml` to state plainly that running `bun run verify` locally in `verify-ci` is the fallback gate (logic unchanged).
Not done / risks:
- CI/prerelease after numbers in `docs/performance.md` remain estimates until the orchestrator replaces them with the PR/main run timings.
- `prerelease.yml`'s Chromium install skips `--with-deps` on `ubuntu-24.04` (restore on cache miss if a future runner image drops a shared library).
- Round-2 `verify` wall times (33.7–88.2 s) were measured while the host Mac had heavy unrelated background load (Xcode / iOS Simulator); `docs/performance.md` keeps the idle M3 baseline (27.7 s).
```
