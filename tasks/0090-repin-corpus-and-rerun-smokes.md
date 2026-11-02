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
Branch/commit: t3/3d6d82aa @ ea249ea (handoff corrected by the orchestrator after review)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, workflow ok, test ok) in 50.1s
Done:
- Repinned the corpus to upstream bad7de01 and regenerated scans, selections, dependency data and all three smokes.
- Headless/TUI: 200 → 253 commands (237 rendered, 2 completed, 13 denied, 1 bundle-failed, 0 crashed). Deps: 56 → 52 (51 rendered, 1 denied).
- Attribution, per the review's per-command comparison: of the 200 commands in both runs, 8 improved and 0 got worse. All 8 come from placeholder inputs (5 arguments, 3 preferences), none from the repin or API 2.10.1. The 53 new commands come from `corpus:select` adding 20 `shared-deps` extensions (80 → 100). The deps change from 56 to 52 is selection churn.
- Peak .cache 586.4 MB (TUI smoke, budget 600 MB); left at 0 B.
Not done / risks:
- `cilium-docs/index` bundle-fails: it declares cheerio ^1.0.0-rc.12 and default-imports it, but the shared cheerio 1.2.0 ESM entry has no default export. Name-only "satisfied" and the major-only version guard miss this (task 0093).
- `corpus:select` is not stable: the shared-deps stratum re-requests its full quota on every run (task 0093).
```
