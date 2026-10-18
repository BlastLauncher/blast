---
id: "0031"
title: Generate every runtime enum from the declarations, incl. nested ones
status: doing
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

- [ ] No hand-written enum value objects remain under `packages/runtime/src/api/`.
- [ ] `bun run verify` passes; `bun run corpus:smoke` unchanged.

## Out of scope

- New API behaviour.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
