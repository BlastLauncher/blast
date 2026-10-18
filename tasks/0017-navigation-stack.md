---
id: "0017"
title: Navigation stack — useNavigation, Action.Push, pop
status: review
milestone: M3
depends: ["0016"]
---

## Goal

Commands can push and pop views (`useNavigation().push/pop`, `Action.Push`),
and clients see the navigation stack in the scene and can request a pop.

## Context

- Needed by `markdown-reference` (curated) and used by 1,233 corpus
  extensions (`Action.Push`, see `compat/COVERAGE.md`).
- Scene shape is a design choice: propose it in Handoff-free form first — add
  a short section to `docs/decisions/0001-*.md` or a new
  `docs/decisions/0003-navigation.md` (≤ 60 lines) describing how the stack
  appears in the scene (e.g. root `Navigation` node with one child per stack
  entry, only the top one rendered/interactive) and how a client asks to go
  back (e.g. a `pop` handler on that node). Keep the protocol unchanged if
  possible: events + handler refs are already enough.
- Behaviour to match Raycast: `push(component)` shows it on top;
  `pop()` returns to the previous view preserving its state; `Action.Push`
  pushes `target` on action; `onPush`/`onPop` callbacks fire.
- Update the CLI script language with `back` (dispatch the pop handler) and
  document it in `--help`.
- `@covers` tags for `useNavigation`, `Action.Push` and its props; regenerate
  `compat/`; re-run `bun run corpus:smoke` and commit the report.

## Acceptance

- [x] Reconciler/API tests: push, pop, state preserved, callbacks.
- [x] CLI e2e test: `action <push title>` → new view; `back` → previous view.
- [x] Decision recorded; `bun run verify` passes.

## Out of scope

- `popToRoot`, `launchCommand`, closing the main window.

## Handoff

```
Branch/commit: t3/navigation-stack-scene @ a65100192bea442eb843f1c780388f8358bb24cd (implementation)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok) in 12.7s
Done:
- Implemented per-command useNavigation push/pop and Action.Push/PushAction with callbacks, stable state and ids, and inactive handler exclusion.
- Recorded Navigation/Navigation.Entry scene conventions in decision 0003; retained the event protocol.
- Added CLI back/help, API/reconciler coverage and Node CLI e2e tests; 205 tests pass.
- Regenerated compatibility and smoke reports; corpus smoke renders 9/13 commands, with no crashes or timeouts. Deleted .cache/raycast-extensions.
Not done / risks: Scene consumers must traverse the Navigation wrapper. markdown-reference now reaches the next blocker, ActionPanel.Item; radix still needs List.Item.Detail (parallel task). onPush runs after scheduling the push, before React commits. No dependencies added; list.ts untouched.
```
