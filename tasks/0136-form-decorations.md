---
id: "0136"
title: Form separators and descriptions in the controller view
status: doing
milestone: M8
depends: ["0135"]
---

## Goal

`Form.Separator` and `Form.Description` reach every client through
client-core's `ControllerView`, so the browser renders them in declaration
order between the fields.

## Context

- `packages/client-core/src/form-view.ts` builds `view.form.fields` only from
  editable node types (`editable` / `formFields()`). Separators and descriptions
  are dropped. `fields` drives focus and Tab order, and must stay editable-only.
- The TUI draws decorations by reading raw scene nodes (`packages/tui/src/form.tsx`,
  `form.children`). The browser renderer (`examples/web-launcher/render.js`)
  has branches for `Form.Separator` and `Form.Description` that never run.
- Add an ordered list to the form view, for example:

  ```
  form.items: Array<
    | { kind: "field"; id }
    | { kind: "separator"; id }
    | { kind: "description"; id; title; text }
  >
  ```

  It holds every visible child in declaration order, with fields referenced by
  id. The change is additive: existing `fields` and `focusId` are unchanged.
  Pick names that match the surrounding style.

- Render `form.items` in `render.js`, and delete the dead branches inside the
  field map.
- `examples/macos-launcher` checks fixture JSON against the controller view
  (`mac-fixtures` in verify). Regenerate those fixtures with their script; never
  edit them by hand. The Swift model must decode the new field, or ignore it,
  without breaking `swift test` if it runs. See how earlier additive view fields
  were handled.
- The `browser-fields` fixture already declares a Separator and a Description
  (task 0135). Use it.

## Acceptance

- [ ] Unit test in `packages/client-core`: `form.items` order matches declaration
      order with mixed fields, separators and descriptions. `fields` still holds
      editable fields only, and Tab still skips decorations.
- [ ] `bun run site:e2e` asserts that the `browser-fields` form shows the
      separator and the description text, in order between the right fields.
- [ ] The macOS fixtures are regenerated and `mac-fixtures` passes.
- [ ] `bun run verify` passes. `site:e2e` passes 3 times in a row.

## Out of scope

- Do not change the TUI. Switching it to `form.items` is optional later work.
  If you do switch it, keep its output identical.
- No `Form.LinkAccessory` rendering beyond what is trivial; note it in Handoff
  if skipped.

## Handoff

Filled in by the worker when finishing:

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
