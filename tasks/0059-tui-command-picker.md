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
Branch/commit:
Verify:
Done:
Not done / risks:
```
