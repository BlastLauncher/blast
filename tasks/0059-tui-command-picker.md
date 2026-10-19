---
id: "0059"
title: TUI command picker with live manifest and launch arguments
status: doing
milestone: M4
depends: []
---

## Goal

`bun run tui <extensionDir>` without a command opens a picker listing the
manifest's commands. Enter launches the selected command, and leaving the
command returns to the picker. Edits to `package.json` show up in the picker
while it is open, so a whole extension can be explored in one session.

## Context

- Entry: `packages/tui/src/main.tsx`. It currently requires `<command>`; keep
  that form working and make it optional. Session: `session.ts`
  `openCommand`. Command UI: `app.tsx` `App` with `onQuit`.
- Put the picker in new modules (`picker.ts` for pure logic, `picker.tsx`
  for the view). Keep `app.tsx` changes minimal; parallel tasks touch the
  TUI.
- Rows show the command `title`, plus `subtitle`/`description` and its mode
  (view, no-view, menu-bar). The picker filters by typed text like the List
  view does: case-insensitive match on title, subtitle, name. Show the
  extension title in the header.
- Live manifest: watch `package.json` (`fs.watch`, debounced) while the
  picker is open and re-read it. Invalid JSON or a missing `commands` array
  shows an inline error line and keeps the last good list. Never crash or
  exit. Because every launch calls `openCommand`, it re-bundles, so source
  edits are picked up on the next launch.
- Launch arguments: if the command declares `arguments`, show a small
  argument form before launch. Use `text`, `password` (masked) and
  `dropdown` (its `data` options) with the placeholders. Required arguments
  must be filled before Enter launches. Pass the values through
  `startCommand`'s arguments, as the CLI `--argument` does; see `cli.ts`.
  Extend `openCommand` options as needed.
- Leaving a command means Esc at the root view, a no-view command
  finishing, or the error screen after a crash. Each of these closes the
  session and returns to the picker, with the previous selection kept.
  Ctrl-C quits the whole TUI from anywhere. The process exits 1 only if the
  last launched command crashed and the user then quits. Direct mode
  (`<extensionDir> <command>`) keeps today's behaviour exactly.
- Docs: update `docs/tui.md` (≤ 120 lines) with the picker keys and usage.

## Acceptance

- [ ] Tests (testRender) cover each of these:
  - Picker lists the commands of a fixture extension.
  - Filtering narrows the list.
  - Enter launches; the command renders, then Esc returns to the picker.
  - A required argument blocks launch until it is filled, then reaches the
    command (assert in a fixture that renders its argument).
  - Rewriting the fixture's `package.json` in a temp copy updates the list.
    Invalid JSON shows the error line and keeps the list.
- [ ] Direct mode behaviour unchanged: the existing TUI tests pass untouched.
- [ ] No-view and crashed commands return to the picker (tested).
- [ ] Fixtures live under `fixtures/` and are never modified in place. Live
      manifest tests copy them to a temp directory.
- [ ] `bun run verify` passes.

## Out of scope

- Installing dependencies before launch, and the preferences prompt (task 0060).
- Watching source files or hot-reloading a running command.
- Multiple extensions or a global launcher root.

## Handoff

```
Branch/commit: t3/tui-command-picker @ 9990e0c
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok) in 73.2s
Done:
- picker.ts: pure logic — manifest parsing (defaults, validation), row text
  (title, subtitle/description, mode), case-insensitive filtering on
  title/subtitle/name, required-argument check.
- picker.tsx: CommandPicker view (search input, rows, fs.watch on
  package.json with 100 ms debounce, inline manifest/launch error lines,
  argument form) and CommandSession shell (openCommand lifecycle, return to
  picker with selection kept, Ctrl-C exit, exit 1 only after a crashed last
  launch).
- session.ts: openCommand gains argumentValues (passed to startCommand like
  the CLI's --argument).
- app.tsx: optional onExit prop used by Ctrl-C so picker mode can quit the
  whole TUI from inside a command; direct mode unchanged.
- main.tsx: command optional; picker mode renders CommandSession.
- Tests: picker.test.ts (6 logic tests), picker.test.tsx (7 testRender
  tests: listing, filtering, launch + Esc return, required argument form,
  live manifest update + invalid JSON, no-view return, crash return +
  exit 1, launch failure). Fixtures only via temp copies.
- docs/tui.md: Picker section (119 lines total).
Not done / risks:
- Pre-existing flake in packages/tui app.test.tsx (no-view HUD test timing
  out at 5 s under load, cascading) reproduced on base f7d5b17; not caused
  by this change.
- A password argument's placeholder shows while empty (masked dots once
  typed); no clipboard paste into the argument form.
- Dropdown arguments default to their first option (matches the List
  accessory's behaviour); a manifest dropdown with no data renders "(no
  options)" and cannot be filled.
```

