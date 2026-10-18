---
id: "0039"
title: List and Grid prop completeness
status: doing
milestone: M3
depends: []
---

## Goal

Every non-deprecated `List.*` and `Grid.*` path is covered: accessories,
`quickLook`, tooltip forms of title/subtitle/icon, `pagination` (206
extensions), dropdown `filtering`/`storeValue`/`onSearchTextChange`, sections,
`EmptyView` props and the `Props` interfaces.

## Context

- Gaps: non-covered, non-deprecated entries in `compat/raycast-api.json`
  whose path starts with `List` or `Grid` (~70 today, many `partial`). Decide
  per path whether it needs code or only evidence; partial tags become full
  where the behaviour is now complete.
- Components: `packages/runtime/src/api/list.ts`, `grid.ts` (pagination type
  already declared there), dropdowns, `slot.ts`. Check every prop against
  `compat/raycast-api/index.d.ts`.
- `pagination`: scene carries `pageSize`/`hasMore` and an `onLoadMore`
  handler; add a CLI script command `more` that dispatches `onLoadMore` on the
  active List/Grid, documented in `--help` and `docs/architecture.md`.
- `quickLook` is data for clients (`{ name, path }`); no OS preview.
- Dropdown `storeValue`: persist the selected value per command via the
  existing storage capability path (host keys by extension; use a
  Blast-internal key prefix that cannot collide with extension LocalStorage
  keys and document it). If that cannot be done cleanly, record as partial
  and explain in Handoff.
- `@covers`, `compat:report`, `fmt`. Parallel workers: Form (0038), image/
  keyboard/environment (0040), OAuth (0041). Avoid `form.ts`.

## Acceptance

- [ ] Runtime tests per added behaviour; CLI e2e for `more`.
- [ ] No non-deprecated `List*`/`Grid*` path left missing; remaining partials
      listed with reasons in Handoff.
- [ ] `bun run verify` passes.

## Out of scope

- Real Quick Look, image loading, client layout.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
