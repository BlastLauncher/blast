---
id: "0148"
title: Handle each key once in the root ⌘K actions panel
status: todo
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
Branch/commit:
Verify:
Done:
Not done / risks:
```
