---
id: "0039"
title: List and Grid prop completeness
status: review
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

- [x] Runtime tests per added behaviour; CLI e2e for `more`.
- [x] No non-deprecated `List*`/`Grid*` path left missing; remaining partials
      listed with reasons in Handoff.
- [x] `bun run verify` passes.

## Out of scope

- Real Quick Look, image loading, client layout.

## Handoff

```
Branch/commit: t3/list-grid-completeness @ b2e73915b96f533022a412259ddda273c66c10b5 (implementation; handoff commit follows)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok) in 45.7s
Done:
- Added List pagination, Quick Look metadata, legacy accessory/section props and nullable EmptyView icons.
- Added active-view CLI `more`, exhausted/missing pagination errors, fixtures and e2e tests.
- Added shared uncontrolled dropdown state and scoped persistence through storage.get/set; internal storage cannot collide with LocalStorage keys or be erased by its clear API.
- Audited List/Grid declarations, completed scene-data evidence and regenerated compat; zero non-deprecated List/Grid paths are missing.
- Added runtime/host persistence tests and CLI restoration across runs; full verify: 369 pass, 0 fail. No dependencies added.
Not done / risks:
- Native client filtering/ranking remains deferred; filtering/keepSectionOrder are scene requests. Search and selection handlers are fully dispatchable.
- Dropdown restoration validates options declared in children/sections. Items hidden in custom components, or loaded after the storage read, are not yet discovered. storeValue therefore remains partial. Controlled values win; idless dropdowns of the same type share the command's default storage slot.
- Real Quick Look, image loading and client layout remain out of scope.
```

Remaining non-deprecated partial paths (18 total; braces mean both List and Grid):

- `{List,Grid}.Props.filtering`, `{List,Grid}.Props.filtering.keepSectionOrder`,
  `{List,Grid}.Dropdown.Props.filtering`,
  `{List,Grid}.Dropdown.Props.filtering.keepSectionOrder`: native client filtering
  and ranking are not implemented.
- `{List,Grid}.Dropdown.Props.storeValue`: custom-component/late-loaded option
  restoration is incomplete as described above.
- `{List,Grid}`, `{List,Grid}.Props`, `{List,Grid}.Dropdown`,
  `{List,Grid}.Dropdown.Props`: aggregate coverage retains the filtering and
  dropdown restoration limits above.
