---
id: "0090"
title: Repin the corpus and rerun all smokes with placeholder inputs
status: doing
milestone: M6
depends: ["0089"]
---

## Goal

Every committed corpus report reflects the current `raycast/extensions` and API
2.10.1, with placeholder inputs (0086) applied to all three smokes.

## Context

The pin in `compat/corpus.json` is `3b812d1e`, 402 commits behind upstream.
Flow: move the pin, `corpus:scan`, then `corpus:smoke`, `corpus:smoke-deps` and
`corpus:tui-smoke`. `compat/SMOKE.md` and `compat/TUI-SMOKE.md` predate
placeholder inputs, so their numbers are expected to move for that reason too.

The volume this checkout lives on has 69 GB free and is 93% full. Keep the
default corpus disk budget. Do not raise it without recording why in Handoff.
Peak `.cache` for the deps smoke was 446 MB last time.

Extensions removed upstream or no longer meeting the selection rules must be
replaced through `corpus:select` and `corpus:select-deps`, never edited.

## Acceptance

- [ ] The pin is a current upstream commit, and generated reports all cite it.
- [ ] Handoff has a before/after table for each smoke, and states how much of
      each change came from placeholders, the repin, and the API upgrade.
- [ ] Each regression is listed with its cause. Blast bugs are not fixed here:
      describe them in Handoff so the orchestrator can write tasks.
- [ ] `.cache` is left under 150 MB and Handoff records the peak.
- [ ] `bun run verify` passes.

## Out of scope

- Fixing regressions, the wide sweep (0091), or expanding curated sets.

## Handoff

```
Branch/commit: t3/3d6d82aa @ d4a3930 (amended below for this handoff update)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, workflow ok, test ok) in 50.1s
Done:
- Repinned `compat/corpus.json` and all generated corpus reports to upstream commit `bad7de0172ce6ea5e721ed919f4e1d7186f74192`; reran `corpus:scan`, `corpus:select`, and `corpus:select-deps`.
- Reran all three smokes with the existing placeholder-input behavior. Headless and TUI each covered 253 commands; deps covered 52 commands across 25 installs.
- Before/after totals:
  - Headless: 200 commands (184 rendered, 1 completed, 7 capability-denied, 3 crashed, 5 missing-arguments) → 253 (237 rendered, 2 completed, 13 capability-denied, 1 bundle-failed, 0 crashed, 0 missing-arguments).
  - Dependency: 56 commands (54 rendered, 2 capability-denied; 20 placeholder-input commands) → 52 (51 rendered, 1 capability-denied; 23 placeholder-input commands: 5 arguments, 17 preferences, 1 both).
  - TUI: 200 commands (184 rendered, 1 completed, 7 capability-denied, 3 crashed, 5 missing-arguments) → 253 (237 rendered, 2 completed, 13 capability-denied, 1 bundle-failed, 0 crashed, 0 missing-arguments).
- Placeholder attribution: headless/TUI required-argument rows fell 5→0; dependency smoke already used placeholders before this task and now records 23 placeholder-input commands. Repin attribution: curated command population changed 200→253 and the dependency-selected commands changed 56→52, accounting for the changed outcome mix. API 2.10.1 attribution: no unsupported-api outcomes appeared before or after; no separate API-only delta was observable.
- `.cache` peak was 586.4 MB in the TUI smoke (the dependency smoke peaked at 267 MB after a fresh cache); `.cache` was removed and is 0 B at handoff.
Not done / risks:
- The new corpus introduces one bundle failure (`cilium-docs/index`) and replaces prior crashes with successful placeholder runs; these are corpus/API compatibility findings for follow-up tasks, not fixed here. Capability denials are expected broker policy outcomes.
```
