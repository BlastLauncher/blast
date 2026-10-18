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

- [x] Runtime tests: TagPicker controlled/uncontrolled + submit; PasswordField
      submit while its value is absent from every published scene; Form.Event
      on focus/blur.
- [x] CLI e2e: a script fills both fields and submits.
- [x] Every Form gap in scope is covered or explained in Handoff.
- [x] `bun run verify` passes.

## Out of scope

- Field refs (`focus`/`reset`), `storeValue` persistence, drafts.

## Handoff

```
Branch/commit: t3/form-tagpicker-password @ 0b93090
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok) in 33.4s (364 tests)
Done:
- Form.TagPicker (string[] value like FilePicker, placeholder, Item children with icon), Form.LinkAccessory (target/text), Form.PasswordField, Form.DatePicker.isFullDay in packages/runtime/src/api/form.ts
- PasswordField secrecy: Field grew an internal `secret` mode — scene props drop value/defaultValue, carry boolean hasValue; value stays runtime-side for onChange, focus/blur events and submit. Documented in docs/architecture.md.
- CLI `field` accepts comma-separated TagPicker values; fixtures/extensions/form gains a `secret` command whose extension masks the password; new cli.test.ts e2e asserts the secret never appears in printed scenes.
- Runtime tests in form.test.ts: TagPicker controlled/uncontrolled/submit/focus, PasswordField secret-free (every published scene checked), isFullDay, LinkAccessory, enableDrafts recorded, keepSectionOrder recorded.
- All 72 in-scope non-deprecated Form paths now covered/partial (compat report regenerated: 63.5% → 67.6% non-deprecated). The remaining in-scope entries were "Props" type aliases of fields already tested — covered with tags on the existing tests.
Not done / risks:
- storeValue/drafts/refs remain recorded-only (`partial` tags, next task).
- PasswordField hasValue collapses to `value !== ""` (length-free) — secrets with only whitespace count as set.
- Unsupported stub test dropped its Form.TagPicker example (now implemented); other stub cases remain.
- isFullDay semantic (local time exactly midnight) inferred from docs, not verified against Raycast's binary.
```
