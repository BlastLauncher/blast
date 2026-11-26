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

- [ ] `bun run bench` exits 0 in < 2 minutes and prints all four groups.
- [ ] `bun run bench --samples 3` works; a JSON file appears in `.cache/bench/`.
- [ ] Helper tests pass with `bun test scripts/bench` (or the chosen path).
- [ ] `docs/performance.md` exists with a filled baseline table.
- [ ] `bun run verify` passes and does not run the bench.

## Out of scope

- Optimizing anything; this task only measures.
- Embedder-protocol changes (task 0194).
- CI integration or perf thresholds.
- Editing `PLAN.md`, `AGENTS.md` or other task files.

## Handoff

Filled in by the worker when finishing:

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
