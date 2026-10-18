---
id: "0017"
title: Navigation stack — useNavigation, Action.Push, pop
status: todo
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

- [ ] Reconciler/API tests: push, pop, state preserved, callbacks.
- [ ] CLI e2e test: `action <push title>` → new view; `back` → previous view.
- [ ] Decision recorded; `bun run verify` passes.

## Out of scope

- `popToRoot`, `launchCommand`, closing the main window.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
