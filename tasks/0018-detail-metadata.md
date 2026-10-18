---
id: "0018"
title: List.Item.Detail and Detail.Metadata components
status: review
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
Branch/commit: t3/detail-metadata @ 7bebcb5 (task file in the follow-up commit)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok) in 11.6s
Done:
- New `api/metadata.ts` builds the Metadata namespace from a prefix, so `Detail.Metadata.*` and `List.Item.Detail.Metadata.*` share one implementation while each scene node keeps its public Raycast path (`Detail.Metadata.Label`, `List.Item.Detail.Metadata.TagList.Item`, …).
- `api/detail.ts` adds `List.Item.Detail` (markdown/isLoading props, metadata as a `Slot`) with its own `Metadata`; `api/list.ts` attaches it as `List.Item.Detail`.
- Widened `ColorLike` in `api/types.ts` for `Label.text.color` / `TagList.Item.color`; `TagList.Item.onAction` serializes as a `$handler`.
- `api/metadata.test.ts` renders every component under both namespaces and asserts types, props, slots and a dispatched tag handler: 59 new `@covers` paths (27 `Detail.Metadata.*`, 32 `List.Item.Detail.*`); coverage 562 → 621 non-deprecated.
- `compat/{raycast-api.json,COVERAGE.md,smoke.json,SMOKE.md}` regenerated: smoke is 12/13 rendered, all three radix commands now render (`radix/colors` 51, `radix/primitives` 263, `radix/themes` 427 nodes); the only remaining failure is `markdown-reference` on `useNavigation` (task 0017).
- Fixtures/tests that asserted these were unsupported now use paths that still are: `fixtures/runtime/unsupported.js` renders `Form.Dropdown.Item`, and `unsupported.test.ts` swaps the old `Detail.Metadata.Label` / `List.Item.Detail` cases for `Form.Dropdown.Item` and `ActionPanel.Submenu`.
Not done / risks:
- Deprecated aliases stay unimplemented and untagged: `ListItem` is still a stub, so `ListItem.Detail.Metadata.*` remains missing in the report. `Detail.Props` itself is also untagged (pre-existing, as with `List.Props`).
- `List.Item.Detail` renders metadata structurally; no client-side rendering/markdown exists yet (out of scope, M4).
- Corpus check done with `bun run corpus:smoke`; `.cache/raycast-extensions` deleted afterwards.
```
