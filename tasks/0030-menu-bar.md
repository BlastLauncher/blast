---
id: "0030"
title: Menu-bar commands — MenuBarExtra and its items
status: review
milestone: M3
depends: []
---

## Goal

`menu-bar` mode commands run instead of failing with `UNSUPPORTED`:
`MenuBarExtra` (342 extensions) with `Item` (+ `alternate`, `subtitle`,
`shortcut`, `tooltip`, `onAction`), `Section`, `Submenu`, `Separator`, and
props `icon`, `title`, `tooltip`, `isLoading`.

## Context

- Today `packages/runtime/src/main.ts` rejects `mode: "menu-bar"`. Decide how a
  menu-bar command appears to clients and record it in
  `docs/decisions/0005-menu-bar.md` (≤ 60 lines). Preferred: same scene
  protocol, root `MenuBarExtra` node (no `Navigation`), items dispatch
  `onAction` like actions; the command stays alive while the client shows it
  and shuts down when told; `isLoading` matters because Raycast unloads
  menu-bar commands when loading finishes and the menu is closed — record
  that lifecycle rule, and implement the headless part (the session ends after
  `isLoading` becomes false and no menu is open, if feasible; else document).
- Check every prop in `compat/raycast-api/index.d.ts`; `MenuBarExtra.Item`
  `onAction` receives an event with `type: "left-click" | "right-click"`.
- CLI: menu-bar commands print their tree; `action <title>` dispatches items.
- Smoke: `one-thing/show-one-thing` should move from `unsupported-mode`.
- `@covers`, `bun run compat:report`, `bun run corpus:smoke`, commit reports
  after `bun run fmt`. Other workers build launch/window APIs (0028) and Grid
  (0029) in parallel; coordinate on `main.ts` by keeping changes minimal.

## Acceptance

- [x] Runtime/process tests for a menu-bar fixture: render, item action with
      click event, isLoading lifecycle as decided.
- [x] Decision recorded; `bun run verify` passes.

## Out of scope

- A real OS menu bar; background refresh intervals (`interval` in the
  manifest) — record only.

## Handoff

```
Branch/commit: t3/menu-bar-commands @ HEAD (feat(0030): render menu-bar commands and dispatch menu items)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok) in 26.1s
Done:
- Implemented every declared MenuBarExtra prop and child component; alternate Slot and inherited shortcuts.
- Runtime renders menu-bar roots without Navigation; CLI action sends left-click; both click types tested.
- Decision 0005 documents loading lifecycle, shutdown, null rendering and client responsibilities.
- 295 tests pass; coverage regenerated; corpus smoke: 60 rendered, 1 completed, 2 capability-denied, 3 unsupported-api.
- one-thing/show-one-thing moves from unsupported-mode to unsupported-api (updateCommandMetadata); corpus checkout deleted.
Not done / risks:
- Automatic unload awaits menu-open protocol/client state; isLoading lifecycle coverage remains partial.
- OS menu bar, interval scheduling and menu-bar Navigation feedback are deferred as documented.
- No dependencies added; no corpus extensions edited or installed; no push.
```
