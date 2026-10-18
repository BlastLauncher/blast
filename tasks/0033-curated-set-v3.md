---
id: "0033"
title: Curated set v3 — harder strata; empty menu-bar scenes count as rendered
status: review
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

- [x] Classification test for the empty menu-bar case; selection tests for
      the new strata; reproducible `compat/corpus.json`.
- [x] `bun run verify` passes; `.cache/raycast-extensions` deleted.

## Out of scope

- Runtime/API changes.

## Handoff

```
Branch/commit: t3/curated-set-v3 @ 7af3920
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok) in 28.3s
Done:
- Selection gains four additive feature strata (grid, menu-bar,
  action-variants, selection-apis), five picks each, filled after the
  exclusive form/detail/utils/list-only strata: the first 40 picks in
  `compat/corpus.json` are identical to before, checked name by name, and
  `corpus:select` reproduces the file from the pin.
- A candidate whose sources import a bare specifier Blast cannot resolve (a
  package or a tsconfig alias; test files skipped) is rejected as
  `unprovided-import`. The manifest check alone let `buildkite` and `octarine`
  through, and both bundled as missing dependencies.
- A menu-bar command whose first scene has `root: null` is now `rendered` with
  detail "empty menu bar" (`one-thing/show-one-thing`, previously the one
  timeout); every other mode still waits for a root.
- Smoke report (60 extensions, after `bun run fmt`): 149 commands — rendered
  143, completed 1, capability-denied 4, bundle-failed 0, crashed 0, timeout 0,
  unsupported-mode 0, unsupported-api 1.
- Top first-missing API: `Action.CreateQuicklink` (`rectangle/index`), the only
  API gap; the other four failures are denied capabilities, not APIs
  (`clipboard.copy` x2, `open.url`, `command.launch`). The new strata do reach
  what 0034/0035 target — `ActionPanel.Submenu` (`multi-ai-chat`, `appgrid`),
  `Form.FilePicker` / `getSelectedText` (`color-studio-picker`,
  `text-decorator`, `cangjie`, `fix-helper`) — and all of those rendered with no
  dropped-prop warnings, so they add render evidence, not failures.
Not done / risks:
- `.cache` is deleted after the run (no corpus left on disk). The 20 new picks
  are reproduced by `corpus:select`, not read back from the committed file.
- The import rule is textual and skips test files; a resolvable-looking specifier
  that only appears in a comment would still reject a candidate (none observed
  in the pinned corpus).
- Ranked order, not a size cap, picked `rectangle` (42 commands) and `fix-helper`
  (3253 nodes), so the report is larger and a few rows are heavy.
```
