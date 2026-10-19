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

- [ ] Map + structural compatibility check with unit tests (a mismatching
      fixture fails generation).
- [ ] Identity tests per mapped alias; regenerated compat.
- [ ] Handoff: deprecated before/after and the remaining gaps with reasons.
- [ ] `bun run verify` passes.

## Out of scope

- Implementing legacy imperative APIs (`render`, `useActionPanel`, …).

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
