---
id: "0090"
title: Repin the corpus and rerun all smokes with placeholder inputs
status: todo
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
Branch/commit:
Verify:
Done:
Not done / risks:
```
