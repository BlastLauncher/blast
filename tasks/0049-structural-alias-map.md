---
id: "0049"
title: Explicit alias map for structural deprecated duplicates
status: doing
milestone: M3
depends: []
---

## Goal

Structural deprecated duplicates whose runtime identity already holds
(`ActionPanelItem` → `Action`, legacy `*Action` components → `Action.*`,
`ArgumentsLaunchProps`/`FormLaunchProps` → `LaunchProps`, internal-name
targets such as `Form.DropdownItem` → `Form.Dropdown.Item`) inherit coverage
like inferred aliases do, so deprecated "missing" drops to the genuinely
unsupported legacy APIs only.

## Context

- Task 0047 added inferred alias targets (`scripts/compat/inventory.ts`) and
  `via` inheritance (`scripts/compat/coverage.ts`), but deliberately not for
  structural duplicates. Its Handoff (git log of `tasks/0047-*`) lists the
  remaining 219 deprecated gaps by group.
- Add a small, reviewed, checked-in map (e.g. `scripts/compat/aliases.ts`:
  alias path → target path, one line each with a short reason). The inventory
  generator applies it only when the declared shapes are structurally
  compatible: write a check that every member path of the alias exists under
  the target (fail generation otherwise, listing the mismatches) so the map
  cannot hide a real difference. Members that exist only on the alias stay
  missing.
- Identity/assignability tests for each mapped alias in
  `packages/runtime/src/api/aliases.test.ts` with `@covers <Alias>`.
- Do not fabricate: `Preference`, `ActionPanelState`, `useActionPanel`,
  `render`, `randomId`, `preferences`, `useId` stay missing unless genuinely
  implemented; list them in Handoff.
- `compat:inventory`, `compat:report`, `fmt`.

## Acceptance

- [x] Map + structural compatibility check with unit tests (a mismatching
      fixture fails generation).
- [x] Identity tests per mapped alias; regenerated compat.
- [x] Handoff: deprecated before/after and the remaining gaps with reasons.
- [x] `bun run verify` passes.

## Out of scope

- Implementing legacy imperative APIs (`render`, `useActionPanel`, …).

## Handoff

```
Branch/commit: t3/structural-alias-map @ fa10c13e409e24b5f61a15afa985574c7e6ce1d4
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok) in 68.8s
Done:
- Added 14 explicit structural aliases; generation checks both roots and every
  descendant path/kind, reports all mismatches, and fails before applying the map.
- Added structural drift/unit fixtures, a generation rejection fixture, and
  assignability evidence for erased ArgumentsLaunchProps/FormLaunchProps exports.
  Existing identity tests exercise every mapped component.
- Regenerated inventory/report: deprecated 601 covered / 119 partial / 219 missing
  became 655 covered / 234 partial / 50 missing (939 total). Non-deprecated stays
  1496 covered / 38 partial / 0 missing (1534 total). No new dependencies.
Not done / risks:
- No imperative legacy implementations or additional runtime behaviors added.
- The check validates inventoried member paths/kinds, not arbitrary TypeScript
  signature equivalence; reviewed mappings and runtime/type tests supply evidence.
- Verification hit one intermittent existing CLI persistence shutdown failure
  (seed 1911741933, runtime SIGTERM). The isolated test passed with that seed;
  it also passed in the initial full gate. No persistence code was changed.
```

Remaining deprecated gaps (50 entries, grouped; no coverage fabricated):

- `Preference` and its 10 fields, `Preferences`, `preferences`: old preference
  schema/global APIs have no implementation/evidence (13 entries).
- `ActionPanelState`, `ActionPanelState.update`, `useActionPanel`, `render`,
  `randomId`, `useId`: unsupported legacy state/render/hooks/helpers (6 entries).
- `Color.Brown` and `adjustContrast`/`dark`/`light`: legacy color object has no
  implemented/tested replacement (4 entries).
- `Environment.commandMode`, `commandName`, `launchContext`, `theme` and
  `environment.commandMode`, `launchContext`, `theme`: no alias identity/type
  evidence for these legacy fields; commandName already exists on the runtime
  value, but its deprecated type path lacks coverage (7 entries).
- `Keyboard.Shortcut.windows` and `KeyboardShortcut.windows`, each with
  `key`/`modifiers`: lowercase Windows properties have no explicit coverage;
  their values can differ from `Windows`, so no identity is inferred (6 entries).
- `Action.Props.id`, `ActionPanel.Item.Props.id`, `ActionPanel.Submenu.Props.id`,
  `ActionPanelItem.Props.id`, `ActionPanelItemProps.id`,
  `ActionPanelSubmenu.Props.id`, `ActionPanelSubmenuProps.id`: deprecated action
  IDs have no modern tested semantics to inherit (7 entries).
- `Action.CopyToClipboard.Props.transient`,
  `ActionPanel.Item.CopyToClipboard.Props.transient`,
  `ActionPanelItem.CopyToClipboard.Props.transient`, `Clipboard.CopyOptions.transient`,
  `CopyToClipboardAction.Props.transient`, `CopyToClipboardActionProps.transient`:
  legacy transient clipboard behavior has no coverage (6 entries).
- `SubmitFormAction.displayName`: alias-only declaration member absent from
  `Action.SubmitForm`; deliberately excluded from the structural map (1 entry).
