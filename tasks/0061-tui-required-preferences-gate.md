---
id: "0061"
title: TUI launch gate asks only for missing required preferences; full preferences are their own view
status: doing
milestone: M4
depends: []
---

## Goal

Launching a command whose required preferences are missing shows a short
setup screen with only those fields. Editing all preferences happens in a
separate Preferences view, like Raycast's extension settings.

## Context

- Today `prepare()` in `packages/tui/src/picker.tsx` opens `PreferencesForm`
  (`packages/tui/src/preferences.tsx`) with **every** extension + command
  preference whenever any required one is missing. That is the bug to fix.
- A preference is "missing" when `required`, it has no `default`, and the
  stored value (extension values merged with that command's values, see
  `createPreferenceStore` in `packages/host/src/preferences.ts`) is
  `undefined` or `""`.
- Launch gate: title `Set up <command title>`, one line saying that these
  values are required before the command can run, then only the missing
  fields. Enter saves them (in the right extension/command scope, as the
  current save code does) and launches. Esc returns to the picker without
  launching.
- Preferences view: opened by Ctrl-E on a picker row and by the extension's
  `openExtensionPreferences` / `openCommandPreferences` (`preferences.open`
  handler in picker.tsx; scope `extension` shows only the extension section).
  It is a full view with its own header (`Preferences — <extension title>`),
  grouped into an `Extension` section and a `<command title>` section (omit
  empty sections). It shows every field. Required fields get a marker, and the
  focused field's `description` appears under it. Add `description?: string`
  to `Preference` in `packages/host/src/bundle.ts` `parsePreferences` (it is
  optional in the Raycast manifest). Enter saves, Esc returns to the picker,
  and it never launches.
- Keep the field editing behaviour of `PreferencesForm` (text input, masked
  password, Space checkbox, ←/→ dropdown). Splitting it into a shared field
  list plus two thin screens is fine.
- Task 0062 restyles the TUI after this. Keep markup plain; do not add colors
  or a theme here.

## Acceptance

- [ ] Test in `packages/tui/src/picker.test.tsx`: a manifest with one
      required-without-default extension preference, one optional extension
      preference and one required command preference that is already stored.
      Enter on the command shows a frame containing `Set up` and the missing
      field's title only (optional and stored ones absent). After typing a
      value + Enter, the command launches and receives the value.
- [ ] Test: Ctrl-E opens a frame containing `Preferences —`, both section
      headers and all fields, including optional ones and the focused field's
      description. Enter saves, Esc returns to the picker, and no launch happens.
- [ ] Test: `preferences.open` with scope `extension` shows only the
      Extension section.
- [ ] The existing test "required preferences block launch, persist, reach the
      runtime and Ctrl-E edits them" is updated or replaced, not deleted
      without equivalent coverage.
- [ ] `docs/tui.md` Picker section describes the gate and the view.
- [ ] `bun run verify` passes.

## Out of scope

- Colors, borders and theme (0062). Password encryption. Changing the
  preference store format. Host/runtime changes beyond `description`.

## Handoff

Filled in by the worker when finishing:

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
