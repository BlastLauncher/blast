---
id: "0084"
title: Form editing in the client-core controller (and over blast serve views)
status: doing
milestone: M5
depends: []
---

## Goal

Embedders using the controller, in-process or through `blast serve` views,
can edit forms. Field focus, text edits, checkbox, dropdown and tag picker
choices, date and file values, password entry and submit all go through
controller inputs, and the view model carries everything needed to draw a
form. Non-JS embedders get the full Raycast form behaviour.

## Context

- Controller: `packages/client-core/src/controller.ts`. Today it exposes
  `view().form` with fields and focus id only. Form editing lives in
  `packages/tui/src/form.tsx` (about 260 lines), using `form-view.ts` helpers
  (`formFields`, `nextField`, `formOptions`, `formDropdownOptions`,
  `parseDate`). Read form.tsx for the exact behaviour, including:
  - TextArea Enter/newline;
  - Ctrl-S / Ctrl-Enter submit;
  - Tab/Shift-Tab focus;
  - Space to toggle;
  - ←/→ option cursor;
  - TagPicker multi-select;
  - DatePicker ISO parsing with an error;
  - FilePicker comma paths;
  - PasswordField never echoing (the runtime keeps the value; the scene has
    `hasValue`);
  - focus/blur events and the focus requests from the scene.
    Also see `docs/architecture.md` "Forms".
- Add inputs to the controller:
  - `{ type: "focus", id }` and `{ type: "focusNext" | "focusPrev" }`;
  - `{ type: "setValue", id, value }` for text, textarea, date strings and
    file paths;
  - `{ type: "toggle", id }`;
  - `{ type: "optionMove", delta }` and `{ type: "optionChoose" }` for
    dropdowns and tag pickers;
  - `{ type: "submit" }`.
    Each produces the `onChange`, `onFocus`/`onBlur` and submit events form.tsx
    sends today. Validation errors (such as a bad date) appear in the view and
    send nothing. Passwords: `setValue` sends the value to the runtime, and the
    view only ever exposes `hasValue`. Never put the password in the view.
- View model `form`: per field it carries:
  - kind, id, title, info/placeholder and error;
  - the display value: text, checked, selected option(s) with titles, date
    text, file list, or a password mask flag;
  - options for dropdowns and tag pickers (ranked by the current dropdown
    query when filtering applies), plus the option cursor;
  - focus.
    Keep it JSON-only.
- Migrate `packages/tui/src/form.tsx` to the controller inputs so the TUI
  stays the conformance demo. Form tests must keep passing; list any
  expectation changes with reasons.
- `blast serve`: `session.input` already forwards controller inputs. Extend
  the protocol's `ControllerInput` validator (`packages/protocol/src/embedder.ts`)
  with the new input types, regenerate the schema (`bun run protocol:schema`),
  and add one serve child-process test editing and submitting a form.

## Acceptance

- [ ] Controller form tests cover every field kind above, focus events,
      validation, password non-exposure (`JSON.stringify(view())` never
      contains the typed password), and submit.
- [ ] The TUI form runs on the controller; `bun test packages/tui` passes.
- [ ] Serve form round-trip test passes; `bun run protocol:check` is clean.
- [ ] `bun run verify` passes.

## Out of scope

- Visual changes, new field kinds, drafts (the runtime already owns them).

## Handoff

Filled in by the worker when finishing:

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
