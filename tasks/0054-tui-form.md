---
id: "0054"
title: "TUI Form: fields, focus, SubmitForm, drafts"
status: doing
milestone: M4
depends: ["0053"]
---

## Goal

`bun run tui fixtures/extensions/form index` renders the Form as a vertical
list of labelled fields; Tab/Shift-Tab (and ↑/↓ outside text areas) move
focus, each field type is editable, and Enter / Ctrl-K run `Action.SubmitForm`
so the extension receives the values.

## Context

- Read `docs/tui.md`, the "Forms" section of `docs/architecture.md`, and
  `packages/tui/src/{view.ts,app.tsx}`. Fields expose runtime-owned `value` +
  `onChange` handlers; the client sends `onChange` events and never keeps the
  source of truth (controlled values win). `PasswordField` carries only
  `hasValue`: render a mask, send typed characters via `onChange`, never echo.
- Put Form code in its own module(s) (e.g. `packages/tui/src/form.tsx` plus
  pure helpers in `form-view.ts`) and keep the `app.tsx` change to the
  dispatch on the active view's root type; task 0055 (Grid) edits the same
  app in parallel, so keep shared-file edits small.
- Field types: TextField, TextArea (multi-line; Enter inserts a newline, Ctrl-Enter
  or Ctrl-S submits), PasswordField, Checkbox (Space toggles), Dropdown and
  TagPicker (option list from scene children; Enter/Space selects, TagPicker
  multi-select), DatePicker (typed ISO date/time; invalid input shows an error
  and is not sent), FilePicker (typed path list, no OS dialog),
  Description, Separator, LinkAccessory as text. Unknown types use the
  existing placeholder.
- Show `title`, `info`, `error` and `placeholder`; `focused` from the scene and
  the `onFocus`/`onBlur` handlers follow client focus changes.
- Footer shows the primary form action; Ctrl-K opens the existing action
  panel with the form's `actions` Slot. Esc behaviour is unchanged (pop/quit).
- Tests via `@opentui/react/test-utils` against `fixtures/extensions/form`
  (index, and `secret` for the password mask). Assert on the submitted values
  shown in the scene (the fixture writes them to `navigationTitle`).
- Add a "Forms" subsection to `docs/tui.md` with the key rules.

## Acceptance

- [ ] Test: fill TextField, edit TextArea, choose Dropdown option, toggle
      Checkbox, enter a date, submit → navigationTitle shows those values.
- [ ] Test: PasswordField frame never contains the typed secret.
- [ ] Pure helper tests for focus order and date parsing.
- [ ] Handoff describes a manual PTY run of the form fixture.
- [ ] `bun run verify` passes.

## Out of scope

- Grid / dropdown accessory (0055), runtime or protocol changes, OS file
  dialogs, rich date-picker widgets.

## Handoff

Filled in by the worker when finishing:

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
