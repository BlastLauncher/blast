---
id: "0016"
title: Implement the APIs blocking the curated set (Icon, Color, Detail, …)
status: todo
milestone: M3
depends: ["0015"]
---

## Goal

As many of the 13 curated commands as possible render their first scene,
with each newly implemented API covered by tests.

## Context

- Input: `compat/SMOKE.md` after task 0015 names the exact missing paths.
  Expected at least: `Icon`, `Color`, `Keyboard.Shortcut.Common`, `Detail`
  (+ `Detail.Props.markdown`), `Action.OpenInBrowser`, and the legacy aliases
  `CopyToClipboardAction` and `PasteAction`.
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

- Form, Grid, navigation (`useNavigation`, `Action.Push`) unless one of the
  listed blockers requires it; a real desktop renderer.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
