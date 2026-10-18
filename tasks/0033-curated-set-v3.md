---
id: "0033"
title: Curated set v3 — harder strata; empty menu-bar scenes count as rendered
status: doing
milestone: M3
depends: []
---

## Goal

Add about 20 harder curated extensions so the smoke report keeps exposing
real gaps, and stop counting a menu-bar command that renders `null` as a
timeout.

## Context

- Today (`compat/SMOKE.md`): 62/66 render, 1 completed, 2 expected
  capability denials, 1 timeout — `one-thing/show-one-thing`, a menu-bar
  command that renders `null` with an empty cache (valid in Raycast: nothing
  shown). Classify a `menu-bar` command whose first scene has `root: null` as
  `rendered` with detail "empty menu bar" (`scripts/corpus/smoke.ts`,
  `smoke-run.ts` must accept a null first scene for menu-bar mode).
- Extend `scripts/corpus/selection.ts` / `select.ts` (task 0023) with new
  strata, keeping all 40 existing picks first and selection reproducible:
  ~5 Grid, ~5 menu-bar, ~5 using `ActionPanel.Submenu` or `Action.*`
  variants beyond CopyToClipboard/OpenInBrowser/Paste/Push, ~5 using
  `Form.FilePicker`, `getSelectedText` or `getSelectedFinderItems`. Same
  static exclusions (offline, deps ⊆ api/utils, no child_process/AppleScript).
- Run `bun run corpus:smoke`, commit reports after `bun run fmt`; Handoff
  lists rendered count and the top first-missing APIs.
- Other workers implement Action variants (0034) and selection/file APIs
  (0035) in parallel; do not touch `packages/`.

## Acceptance

- [ ] Classification test for the empty menu-bar case; selection tests for
      the new strata; reproducible `compat/corpus.json`.
- [ ] `bun run verify` passes; `.cache/raycast-extensions` deleted.

## Out of scope

- Runtime/API changes.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
