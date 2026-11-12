---
id: "0148"
title: Handle each key once in the root ⌘K actions panel
status: doing
milestone: M8
depends: []
---

## Goal

In the root launcher's ⌘K actions panel, ↑/↓ move exactly one action and ↵
runs the selected action exactly once.

## Context

- `examples/browser-demo/root-launcher.tsx` renders the panel as its own cmdk
  `<Command>` (`Actions`), which handles ↑/↓/↵ itself (moves selection via
  `onValueChange` → `onActionHighlight`, runs `onSelect` → `onAction`) and
  calls `preventDefault`.
- `examples/browser-demo/client.ts` (document `keydown`, `if (actionOpen)`
  branch, ~line 1496) also moves `actionSelected` and calls `runAction()`
  for the same keys without checking `event.defaultPrevented`, so a key can
  act twice (skip an action; run one twice, e.g. open two tabs).
- 0147 already fixed the same pattern for the root list (cmdk owns
  arrows, `vimBindings={false}`, Ctrl+N/P move one row); follow that fix.
- Reproduce first in a real browser and state the before behaviour in
  Handoff.

## Acceptance

- [ ] `site-e2e.ts`: open ⌘K on a root row with ≥ 3 actions, press ↓ once
      and assert the second action is selected; press ↵ and assert the
      action ran once (e.g. one popup/page opened, or one toast).
- [ ] Root list ↑/↓/Ctrl+N/P and the 0146 shortcut checks still pass.
- [ ] `bun run site:e2e` (Chromium) passes; Firefox lane passes in the
      Playwright Docker image.
- [ ] `bun run verify` passes.

## Out of scope

- Extension (non-root) action panels, which client-core drives.

## Handoff

Filled in by the worker when finishing:

```
Branch/commit: `t3/fix-root-actions-double-keys` @ 2d0a5db (plus e2e coverage commit below)
Verify: `verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok)`
Done: Added a root ⌘K e2e covering three actions, one ArrowDown selecting GitHub, and exactly one `window.open` on Enter; the check runs before either browser lane diverges. Chromium site e2e passed with the guard.
Not done / risks: Firefox Docker lane was not run in this session. Regression proof: temporarily removing the guard made the new flow fail at the existing root selection scroll assertion (the duplicate ArrowDown advanced selection twice); the guard was restored before verification.
```
