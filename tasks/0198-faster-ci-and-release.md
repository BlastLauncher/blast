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
Branch/commit: t3/56d98c7c @ dda79c97 (followed by this handoff commit)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 28.8s
Done:
- Parallelized `scripts/verify.ts` static/contract steps and switched tests to `bun test --parallel --no-isolate --randomize` (forwarding `--seed`), cutting local `bun run verify` from 88 s to 27.7 s on M3. Split the two slowest suites (`packages/cli/src/cli.test.ts`, 29.9 s in CI -> 4 files; `packages/serve/src/main.test.ts`, 10.6 s -> 2 files), bounded `scripts/mac-fixtures.ts` to 4 workers with resolved `nodePath` (1.3 s), and added `defaultNodePath()` in `packages/host/src/session.ts` (reused by `engine.ts` and `bundle.ts`) plus parallel-safety fixes (`dependencies.test.ts` NO_COLOR, `session.ts` shutdown EPIPE guard, `cli.ts` `observed = -1` script `wait` race, `cli-views.test.ts` alert script, `resize.test.tsx` waitForFrame predicate).
- Cut `tasks:land` check polling from 20 s to 5 s (`DEFAULT_LAND_POLL_MS` + `--poll-ms`), isolated `gitEnv` in `scripts/tasks.test.ts`, and replaced the 3× real-git `doneTask()` calls in the flaky push-guard test with pure fake runners (~2 ms).
- Updated `.github/workflows/ci.yml` with fail-safe path filtering (`scripts/ci-changes.ts`) on `macos-example`, `go-example`, `python-example`, and `tmux-plugin` (job-level `if:` so skipped jobs report `skipped`), `Ensure tmux` guard skipping `apt-get` when `tmux` is present, PR-only concurrency cancel (keeping `main` push runs intact), and `actions/cache@v6.1.0` for Swift `.build` (dropped unjustified Go build cache after measuring ~2–3 s compile time).
- Updated `.github/workflows/prerelease.yml` to run `verify-ci` (`scripts/release/wait-ci-verify.ts`, reusing `main` CI's `verify` check run or falling back locally) in parallel with `build`, cached Playwright Chromium on `ubuntu-24.04` (fixing the wip path to `.cache/browser-demo/deps/node_modules/.bin/playwright`), and parallelized `npm view` in `scripts/release/prerelease.ts`.
- Recorded the 20-line "CI and release" before/after table and trigger-change summary in `docs/performance.md` and updated `docs/release.md`.
Not done / risks:
- CI/prerelease after numbers in `docs/performance.md` are estimates because workers do not push or trigger workflows; replace with real PR/main run timings before or after merging.
- `prerelease.yml`'s Chromium install skips `--with-deps` on `ubuntu-24.04` based on recent logs showing all shared libraries are preinstalled (only extra CJK/X11 fonts were newly installed); if a future `ubuntu-24.04` image drops a runtime library, restore `--with-deps` on cache miss.
- Branch protection on `main` is currently 404 (ruleset `3620096` enforces only deletion and non-fast-forward); job-level `if:` still reports `skipped` for required-check compatibility.
```
