---
id: "0193"
title: Add a bench script and record a perf baseline
status: doing
milestone: M17
depends: []
---

## Goal

`bun run bench` measures the numbers PR #109 and the tmux daemon optimized,
prints a table, and writes JSON to `.cache/bench/`. A short doc records one
baseline run, so later changes can be compared and task 0194 can decide on
embedder view patches from data.

## Context

- PR #109 (`04eb4793`) added a standby runtime pool
  (`packages/host/src/runtime-pool.ts`) and runtime → host `scene.patch`
  updates (`packages/protocol/src/messages.ts`, opt-in via
  `InitMessage.scenePatches`, set in `packages/host/src/session.ts`).
- `scripts/tui-benchmark.ts` already measures TUI first frame, keystroke
  latency and popup startup with the OpenTUI test renderer; it is not wired
  into `package.json`. Reuse or call it rather than duplicating it.
- Measure at least:
  1. Time from launching `fixtures/extensions/hello-list` through the host
     engine to its first scene: cold (no standby child) vs warm (pool primed).
  2. Bytes on the runtime → host wire for one update of a large list
     (1,000 and 10,000 items; one-item prop change and a search filter):
     full `scene` vs `scene.patch`.
  3. Bytes per update that a `blast serve` embedder receives for the same
     updates (whole views today; see `packages/serve/src/serve.ts`).
  4. The existing TUI numbers from `scripts/tui-benchmark.ts`.
- Report median and p95 over N samples (default small enough to finish in
  under 2 minutes; `--samples` to change it). Timing is machine-dependent:
  keep it out of `bun run verify` and out of `bun test`.
- Pure helpers (stats, byte measurement of synthetic scenes, table
  formatting) get deterministic tests next to the script.
- Output: JSON under `.cache/bench/` (gitignored); never commit it. Do not
  write absolute home paths into any committed file.
- Baseline doc: `docs/performance.md`, ≤ 60 lines: how to run, what each
  number means, one baseline table with machine/OS/Node/Bun versions
  (no hostnames or user paths). Link it from `docs/architecture.md` in one line.

## Acceptance

- [x] `bun run bench` exits 0 in < 2 minutes and prints all four groups.
- [x] `bun run bench --samples 3` works; a JSON file appears in `.cache/bench/`.
- [x] Helper tests pass with `bun test scripts/bench` (or the chosen path).
- [x] `docs/performance.md` exists with a filled baseline table.
- [x] `bun run verify` passes and does not run the bench.

## Out of scope

- Optimizing anything; this task only measures.
- Embedder-protocol changes (task 0194).
- CI integration or perf thresholds.
- Editing `PLAN.md`, `AGENTS.md` or other task files.

## Handoff

Filled in by the worker when finishing:

```
Branch/commit: t3/bench-baseline @ 27fa43871591055a4382f4c35ed5b1d7615e5ee3
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 111.0s
Done:
- Added `scripts/bench/index.ts` and `scripts/bench/helpers.ts` wired as `bun run bench` (supporting `--samples N` and `--out <path>`), measuring (1) host launch of `fixtures/extensions/hello-list` to first scene across cold, cached-no-pool, and warm pool-primed engines, (2) runtime -> host `scene` vs `scene.patch` wire bytes for 1,000- and 10,000-item lists (one-item prop change and search filter), (3) `blast serve` embedder wire bytes (`session.view` + `session.scene`, plus selection move down) for the same updates, and (4) TUI metrics reused from `scripts/tui-benchmark.ts`, writing JSON to `.cache/bench/`.
- Refactored `scripts/tui-benchmark.ts` to export its measurement helpers while preserving standalone `bun scripts/tui-benchmark.ts` execution.
- Added deterministic unit tests in `scripts/bench/helpers.test.ts` covering CLI parsing, median/p95 stats, synthetic scene/patch/view byte measurement, and table/report formatting (9 tests, 48 assertions).
- Recorded the baseline run in `docs/performance.md` (53 lines) and linked it from `docs/architecture.md` in one line (198 lines).
Not done / risks:
- No new dependencies added; timings depend on host machine and CPU scheduling (e.g., Apple Silicon E/P-core placement can shift warm launch between ~7 ms and ~23 ms, though warm remains 3x–10x faster than cached-no-pool).
- `warm (pool primed)` waits 400 ms (`PREWARM_SETTLE_MS`) for standby workers to finish `--prewarm`; on very slow machines, a standby child could still be finishing shim preload when claimed.
- `scripts/tui-benchmark.ts` emits pre-existing React `act(...)` warnings to stderr during async `helloListFirstFrameMs` frames (same as existing `packages/tui` tests).
```
