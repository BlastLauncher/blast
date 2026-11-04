---
id: "0107"
title: macOS example, part 2 — AppKit launcher window
status: doing
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

- [x] Executable target `BlastLauncher` (AppKit) launches with an extension
      directory argument and shows the command picker, then the command.
- [x] Presenter unit tests over the 0106 contract fixtures: rows, selection,
      search text, action panel rows with shortcut labels, toasts, detail
      markdown, empty and loading states, back affordance.
- [x] Key mapping tests: arrows, Return, ⌘K, ⌘↵, Esc, typing → the right
      `ControllerInput`.
- [x] AppKit view tests build windows offscreen in XCTest and assert rendered
      content (row titles, selected row, panel visibility) without user input.
- [x] End-to-end test: launcher model + real `blast serve` + `hello-list`,
      driven through the presenter: search, move, primary action, fake
      clipboard handler receives the text.
- [x] CI `macos-example` job runs all of it; README documents running the app.
- [x] `bun run verify` passes.

## Out of scope

- Global hotkey, real clipboard/open handlers, multi-extension root (0108).

## Handoff

```
Branch/commit: t3/0adb68c6 @ 4631945 (draft t3/macos-appkit-launcher merged first)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 77.6s
Swift tests: swift test -> 68 tests in 9 suites passed (19 presenter, 9 AppKit, 40 BlastKit)
Done:
- BlastPresenter (Foundation + BlastKit only): display models for every ControllerView kind (list, grid, form, menu-bar, detail, empty, loading) with rows/title/subtitle/icon text/selection, search text and placeholder, action rows with shortcut labels, toast, detail markdown, title and back affordance; a command picker over extension manifest commands.
- Key mapping from a Foundation-only LauncherKey to ControllerInput: arrows, Return, Command+Return, Command+K, Escape (closeActions / back / nil), typing (search or actionsQuery) and other Command shortcuts as key presses.
- BlastLauncher executable: NSPanel with a search field that keeps focus, a view-based NSTableView (LauncherRowCell), NSTextView markdown detail, action panel, back button, toast and empty/loading labels; keys, search and clicks come back as ControllerInput.
- Tests: presenter over all seven fixtures plus synthetic loading/empty views; key mapping; AppKit windows built offscreen (row titles, selection, action-panel visibility, detail markdown, back button); manifest parsing; and an end-to-end run through the presenter against real blast serve + hello-list (search, move, primary) with a fake clipboard.copy handler receiving "banana".
- README documents running the app (`swift run --package-path examples/macos-launcher BlastLauncher <extension-dir> [command]`), BLAST_REPO_ROOT, and all test layers; `swift test` covers everything in the existing macos-example CI job.
Not done / risks:
- Real clipboard/open handlers and global hotkeys stay out of scope (0108); granted capabilities are logged to stderr and answer null.
- Action-panel rows are display-only: navigation and activation go through server inputs, not click targets.
- The AppKit tests need a WindowServer session (macos-latest provides one); they never order the window front or run an event loop.
- One extension directory per launch; a multi-extension root is 0108.
```
