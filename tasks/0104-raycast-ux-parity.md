---
id: "0104"
title: Raycast UX parity in client-core and the TUI
status: todo
milestone: M6
depends: ["0103"]
---

## Goal

Interaction behaviour matches Raycast wherever a terminal allows, implemented
in `packages/client-core` where possible so every embedder inherits it.

## Context

Scope agreed with the owner on 2026-11-04 (decision 0009 still holds). Known
differences, from `docs/tui.md` and the client-core controller:

- Toasts stay while mounted; Raycast hides success and failure toasts after a
  few seconds, and animated toasts stay until updated.
- Action panel: sections, shortcut labels next to actions, and the default
  Raycast shortcuts (⌘K panel, ⌘↵ secondary action, ⌘C copy-style actions)
  mapped to terminal keys and listed in help.
- Form `Description`, `Separator` and `LinkAccessory` render as plain text.
- Navigation: `navigationTitle` and the back affordance per pushed view.

Start by writing a short parity checklist from the Raycast API docs and
behaviour (in `docs/tui.md`), then implement the items with the most corpus
usage first (`compat/raycast-usage.json` has weights).

## Acceptance

- [ ] Parity checklist in `docs/tui.md`, each item marked done, terminal
      limitation, or not planned.
- [ ] Toast lifetimes and styles match Raycast in client-core, with tests
      using fake timers.
- [ ] Action panel shows sections and shortcut labels; secondary action and
      the default shortcuts work; covered by tests.
- [ ] Form `Description`, `Separator` and `LinkAccessory` render properly.
- [ ] `blast serve` views gain the same behaviour (client-core), with no
      protocol change, or the change is documented in 0011.
- [ ] `bun run verify` passes.

## Out of scope

- Launcher features; visual polish already done in 0103.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
