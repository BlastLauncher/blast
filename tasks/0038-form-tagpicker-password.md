---
id: "0038"
title: Form.TagPicker, Form.PasswordField, Form events and props
status: doing
milestone: M3
depends: []
---

## Goal

`Form.TagPicker` (168 extensions) and `Form.PasswordField` (132) render and
submit, and the remaining non-ref Form typing paths (`Form.Event`,
`Form.ItemProps`, `Form.Props`, `Form.LinkAccessory`, `*.Props` of existing
fields) have `@covers` evidence.

## Context

- Gaps: non-covered, non-deprecated entries in `compat/raycast-api.json`
  whose path starts with `Form`, excluding `*.focus`, `*.reset`,
  `Form.ItemReference*` and `storeValue` (task to follow).
- Form value model: `packages/runtime/src/api/form.ts` (tasks 0022/0035);
  FilePicker's `string[]` value is the closest pattern for TagPicker. Check
  every prop against `compat/raycast-api/index.d.ts`.
- `Form.PasswordField` must never put its value in the scene props or logs
  (secret); expose a `hasValue`/length-free flag instead and keep the value
  runtime-side for `onChange` and submit. Document this in
  `docs/architecture.md` (one or two sentences, Form paragraph).
- CLI `field <id> <value>`: TagPicker takes comma-separated values like
  FilePicker; PasswordField takes the raw string.
- `onFocus`/`onBlur` receive a `Form.Event` with `target.id`, `target.value`,
  `type`; if events are already dispatched, add evidence; otherwise implement.
- `@covers` tags, `bun run compat:report`, `bun run fmt` before committing
  generated reports. Parallel workers touch List/Grid (0039), image/keyboard/
  environment (0040) and OAuth (0041); keep to Form files.

## Acceptance

- [ ] Runtime tests: TagPicker controlled/uncontrolled + submit; PasswordField
      submit while its value is absent from every published scene; Form.Event
      on focus/blur.
- [ ] CLI e2e: a script fills both fields and submits.
- [ ] Every Form gap in scope is covered or explained in Handoff.
- [ ] `bun run verify` passes.

## Out of scope

- Field refs (`focus`/`reset`), `storeValue` persistence, drafts.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
