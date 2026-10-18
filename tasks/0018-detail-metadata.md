---
id: "0018"
title: List.Item.Detail and Detail.Metadata components
status: doing
milestone: M3
depends: []
---

## Goal

`List.Item.Detail` and the metadata components (`Label`, `Link`,
`Separator`, `TagList`, `TagList.Item`) render into the scene for both
`List.Item.Detail.Metadata.*` and `Detail.Metadata.*`, unblocking the three
`radix` curated commands.

## Context

- `compat/SMOKE.md`: `radix/colors`, `radix/primitives`, `radix/themes` stop
  at `List.Item.Detail`. Coverage paths: 32 under `List.Item.Detail` in
  `compat/raycast-api.inventory.json`, and the matching `Detail.Metadata.*`
  paths. Check every prop in `compat/raycast-api/index.d.ts`.
- `Detail` already exists in `packages/runtime/src/api/detail.ts` and renders
  its `metadata` prop into a `Slot`; reuse the same metadata components for
  both namespaces (same host element types with their public paths, e.g.
  `Detail.Metadata.Label` vs `List.Item.Detail.Metadata.Label`).
- Follow scene conventions in `docs/architecture.md` (element props → `Slot`).
  `TagList.Item.onAction` is a handler; `Label.text` may be a string or
  `{ value, color }`.
- `List.Item` already renders its `detail` prop into a `Slot`; it only needs
  `List.Item.Detail` itself to exist (attach it in `list.ts`).
- Another worker is implementing navigation in parallel (`action.ts`, a new
  navigation module); avoid editing those. If `compat/` conflicts later, the
  orchestrator regenerates it.
- `@covers` every implemented path, `bun run compat:report`, re-run
  `bun run corpus:smoke` and commit the reports (after `bun run fmt`).

## Acceptance

- [ ] Tests render each metadata component under both namespaces and assert
      scene types, props, slots and the TagList item handler.
- [ ] The three radix commands render in `compat/SMOKE.md` (or Handoff names
      the next blocker exactly).
- [ ] `bun run verify` passes.

## Out of scope

- Navigation, Form, Grid. Any desktop rendering of markdown.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
