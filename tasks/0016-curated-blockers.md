---
id: "0016"
title: Implement the APIs blocking the curated set (Icon, Color, Detail, …)
status: doing
milestone: M3
depends: ["0015"]
---

## Goal

As many of the 13 curated commands as possible render their first scene,
with each newly implemented API covered by tests.

## Context

- Input: `compat/SMOKE.md` (after task 0015) names the first missing path per
  command: `Action.OpenInBrowser` ×5, `Action.Paste` ×3, `PasteAction`,
  `Detail`, `useNavigation` (→ task 0017, not here). Once these exist, the
  next missing paths will surface; extensions also import `Icon`, `Color`,
  `Keyboard` and `CopyToClipboardAction`, so implement those too.
- Stub values now fail when used as props (`unsupportedPath` in
  `packages/runtime/src/api/unsupported.ts`); implemented exports go in
  `packages/runtime/src/api/implemented.ts` so they replace the stubs.
- Enums: generate `Icon` and `Color` values from the enum members in
  `compat/raycast-api/index.d.ts` (exact string values, e.g.
  `AddPerson = "add-person-16"`) via a script under `scripts/compat/`; keep the
  generated file checked by `compat:check`. `Keyboard.Shortcut.Common` values
  are not in the declarations: take them from Raycast's public API docs
  (developers.raycast.com) and cite the page in a comment.
- Components follow the existing scene conventions (`docs/architecture.md`):
  host element type = public path, element props → `Slot`.
- Privileged actions use capabilities: `Action.OpenInBrowser` →
  `open.url { url }`; `Action.Paste`/`PasteAction` → `clipboard.paste
  { text }`. Name each new capability in Handoff; the smoke runner's broker
  stays deny-all, so a denied capability only matters when the action runs.
- Deprecated aliases (`CopyToClipboardAction`, `PasteAction`) are the same
  components as their modern paths.
- Tag everything with `// @covers`, run `bun run compat:report`, then re-run
  `bun run corpus:smoke` and commit the updated report (after `bun run fmt`).
- If a curated command needs something large beyond this list, stop at the
  list and report what remains in Handoff instead of growing scope.

## Acceptance

- [ ] Tests for every implemented component, enum, alias and capability.
- [ ] Updated `compat/SMOKE.md` committed; Handoff gives rendered count before
      and after and the remaining blockers.
- [ ] `bun run verify` passes.

## Out of scope

- Navigation (`useNavigation`, `Action.Push`) — task 0017. Form, Grid, a
  desktop renderer.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
