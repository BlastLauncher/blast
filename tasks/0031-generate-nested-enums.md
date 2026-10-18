---
id: "0031"
title: Generate every runtime enum from the declarations, incl. nested ones
status: review
milestone: M3
depends: []
---

## Goal

All runtime enum values come from `scripts/compat/generate-enums.ts`, not
hand-written copies, so a `@raycast/api` upgrade updates them automatically.

## Context

- Hand-written today (all verified correct against the declarations, but they
  will drift on upgrades): `ActionStyle` in `packages/runtime/src/api/action.ts`,
  Toast/Alert styles in `feedback.ts`, `GridInset`/`GridItemSize`/`GridFit` in
  `grid.ts`, and possibly others (grep for `as const` objects of string
  literals under `packages/runtime/src/api/`).
- Extend the generator to emit every `enum` in `compat/raycast-api/index.d.ts`
  (top-level and inside namespaces, plus non-exported enums referenced by
  exported consts such as `ActionStyle`), keyed by the declaration name, into
  `enums.generated.ts`; then import them where hand copies exist. Keep
  `compat:check` failing on a stale generated file.
- Behaviour must not change: existing tests stay green unchanged except
  imports; add a test asserting the generator's output contains every enum
  declared in the file.
- No `compat/` report changes are expected (paths are already covered).

## Acceptance

- [x] No hand-written enum value objects remain under `packages/runtime/src/api/`.
- [x] `bun run verify` passes; `bun run corpus:smoke` unchanged.

## Out of scope

- New API behaviour.

## Handoff

```
Branch/commit: t3/generate-nested-enums @ dbd6a40
Verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok) — 318 tests, 45 files
Done:
  - generate-enums.ts emits every string enum in the declarations (17 paths:
    top-level, namespaced, and unexported alias backs like `ToastStyle_2`),
    keyed by declaration name; `AI.Model`'s string-literal member ids are
    supported. `PUBLIC_ENUMS` (the old allowlist) now only selects which paths
    get `@covers` tags and the public-surface check, so compat/ is unchanged.
  - enums.generated.ts / enums.generated.test.ts regenerated: the test asserts
    every declared enum is generated with its declared members (the requested
    test) and that the public API surface serves the public enum values.
  - Hand-written copies replaced by generated imports: ActionStyle (action.ts),
    Alert.ActionStyle + Toast.Style (feedback.ts, enum lines only), GridInset/
    GridFit/GridItemSize (grid.ts), DatePickerType (form.ts). Type aliases and
    re-exports kept, so no behaviour or public-surface change.
  - generate-enums.test.ts updated: numeric enums now throw anywhere in the
    file (strict, as before), not just when on the allowlist.
Not done / risks:
  - corpus:smoke not run: .cache/ has no corpus in this worktree and the brief
    said no corpus access is needed. Values are byte-identical to the removed
    hand copies, so smoke behaviour cannot change; compat/ (report, inventory,
    coverage) is untouched per git status.
  - feedback.ts touched only in enum imports/definitions, per the 0032
    parallel-work instruction (import block + Alert/Toast.Style lines).
```
