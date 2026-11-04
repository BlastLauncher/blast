---
id: "0107"
title: macOS example, part 2 — AppKit launcher window
status: todo
milestone: M7
depends: ["0106"]
---

## Goal

An AppKit launcher window drives a Raycast extension through `BlastKit`: search
field, results list, action panel, detail, toasts and back navigation, with the
UI logic covered by tests rather than manual clicking.

## Context

AppKit only (no SwiftUI). Keep AppKit thin: a pure-Swift presenter (no AppKit
imports) maps `ControllerView` to display models and key events to
`ControllerInput`; AppKit views render display models. Use `NSPanel`,
`NSTextField`/`NSSearchField`, `NSTableView` (view-based), `NSTextView` for
markdown detail via `NSAttributedString`.

## Acceptance

- [ ] Executable target `BlastLauncher` (AppKit) launches with an extension
      directory argument and shows the command picker, then the command.
- [ ] Presenter unit tests over the 0106 contract fixtures: rows, selection,
      search text, action panel rows with shortcut labels, toasts, detail
      markdown, empty and loading states, back affordance.
- [ ] Key mapping tests: arrows, Return, ⌘K, ⌘↵, Esc, typing → the right
      `ControllerInput`.
- [ ] AppKit view tests build windows offscreen in XCTest and assert rendered
      content (row titles, selected row, panel visibility) without user input.
- [ ] End-to-end test: launcher model + real `blast serve` + `hello-list`,
      driven through the presenter: search, move, primary action, fake
      clipboard handler receives the text.
- [ ] CI `macos-example` job runs all of it; README documents running the app.
- [ ] `bun run verify` passes.

## Out of scope

- Global hotkey, real clipboard/open handlers, multi-extension root (0108).

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
