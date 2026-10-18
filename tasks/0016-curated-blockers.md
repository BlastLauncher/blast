---
id: "0016"
title: Implement the APIs blocking the curated set (Icon, Color, Detail, …)
status: review
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

- [x] Tests for every implemented component, enum, alias and capability.
- [x] Updated `compat/SMOKE.md` committed; Handoff gives rendered count before
      and after and the remaining blockers.
- [x] `bun run verify` passes.

## Out of scope

- Navigation (`useNavigation`, `Action.Push`) — task 0017. Form, Grid, a
  desktop renderer.

## Handoff

```
Branch/commit: t3/curated-api-blockers @ b2440216a556d5032093004639d52b091b5e5bf4
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok) in 11.7s
Done:
- Implemented Action.OpenInBrowser (open.url { url }), Action.Paste/PasteAction
  (clipboard.paste { text }), and CopyToClipboardAction; callbacks follow successful
  capability responses. Added grant/deny/failure tests; broker remains deny-all.
- Implemented standalone Detail with actions/metadata Slots and scalar props.
- Generated all Icon/Color string values and member coverage from the declarations;
  compat:enums regenerates them and compat:check detects stale values/evidence.
- Added all 17 documented Keyboard.Shortcut.Common mappings for macOS/Windows,
  with the public documentation URL cited in code. No new dependencies.
- 199 tests pass; regenerated coverage and smoke reports. Curated rendering rose
  from 2/13 to 9/13. Deleted .cache/raycast-extensions after the final smoke run.
Not done / risks:
- markdown-reference/markdown-reference still needs useNavigation (task 0017).
- radix/colors, radix/primitives, and radix/themes still need List.Item.Detail;
  stopped at the task's listed APIs rather than expanding scope.
- Paste supports strings, numbers and content with text; file-only and HTML-only
  payloads reject before requesting a capability and are marked partial.
- Detail.Metadata components remain unsupported; this task implements standalone
  Detail and its metadata Slot, with parent coverage marked partial.
```
