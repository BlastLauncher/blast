---
id: "0019"
title: Feedback UI — showToast/Toast, showHUD, confirmAlert
status: review
milestone: M3
depends: []
---

## Goal

`showToast`, the `Toast` object/class, `showHUD` and `confirmAlert` work
headlessly and are visible to clients, so the most-used missing APIs in
`compat/COVERAGE.md` (showToast 2,471 extensions, Toast.Style.* ~2,400,
showHUD 931, confirmAlert 849) stop failing.

## Context

- These are UI state, not privileged OS operations. Decide how they appear to
  clients and record it in `docs/decisions/0004-feedback-ui.md` (≤ 60 lines).
  Preferred: no protocol change — represent the current toast / HUD / alert
  as nodes in the scene (e.g. children of the root `Navigation` node, see
  `docs/decisions/0003-navigation.md`) with handler refs for alert buttons
  and toast actions; the alert promise resolves when a client dispatches.
- Match Raycast semantics from `compat/raycast-api/index.d.ts`: `showToast`
  accepts options or the legacy `(style, title, message)` form and returns a
  `Toast` whose `title`/`message`/`style` updates re-render and whose
  `hide()` removes it; `Toast.Style` values come from the declarations;
  `showHUD` resolves after showing; `confirmAlert` resolves `true`/`false`
  and runs `primaryAction`/`dismissAction` callbacks.
- CLI: print toasts/HUDs in the tree; add script commands to answer an alert
  (e.g. `confirm` / `dismiss`) and document them in `--help`.
- `@covers` tags, `bun run compat:report`, `bun run corpus:smoke` (must stay
  13/13), commit reports after `bun run fmt`.
- Other workers are changing `list.ts`/`action.ts` (0020) and storage/open
  (0021) in parallel; avoid those files.

## Acceptance

- [x] Tests for toast create/update/hide, legacy signature, HUD, alert
      confirm and dismiss through dispatched events; CLI e2e for an alert.
- [x] Decision record added; `bun run verify` passes.

## Out of scope

- Desktop rendering; `popToRoot`/window closing semantics of `showHUD`
  beyond recording them.

## Handoff

```
Branch/commit: t3/feedback-ui @ e624700 (implementation; handoff follows)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok)
Done:
- Added mutable Toast, legacy showToast, HUD and queued alert scene nodes/actions.
- Added CLI confirm/dismiss, no-view feedback, and navigation persistence tests.
- Added decision 0004 and regenerated coverage (43.7% non-deprecated).
- 214 tests pass; corpus:smoke remains 13/13; corpus checkout deleted.
Not done / risks: rememberUserChoice is recorded but not persisted; HUD window
  behavior and automatic feedback dismissal are deferred (partial coverage).
  No dependencies added. No push. Review must be performed by another agent.
```
