---
id: "0047"
title: Deprecated aliases — exports plus alias-aware coverage
status: doing
milestone: M3
depends: []
---

## Goal

Every deprecated `@raycast/api` alias (757 of 939 deprecated paths are
missing today) is either exported with the right identity or explained, and
the coverage report credits an alias's sub-paths from its target's evidence,
so deprecated coverage reflects reality without hundreds of hand tags.

## Context

- Deprecated aliases come in shapes such as `export declare const ListItem:
  typeof List.Item` (value alias), `export declare interface FormDropdownProps
  extends Form.Dropdown.Props` (type alias), and structural duplicates such as
  `ActionPanelItem` (`compat/raycast-api/index.d.ts:217`), `specialKeys`,
  `KeyboardShortcut`, `Preference`, `*Action` components (`CopyToClipboardAction`,
  `OpenAction`, …). List them from `compat/raycast-api.json` +
  `compat/raycast-api.inventory.json` (`deprecated: true`, not covered).
- Coverage tooling: `scripts/compat/inventory.ts`, `generate-inventory.ts`,
  `coverage.ts`, `generate-coverage.ts`. Extend the inventory to record an
  alias target when the declaration is `typeof X`, `type A = X`, or
  `interface A extends X {}` with no own members (structural duplicates do not
  get a target). Extend the report: a test tag `// @covers <Alias>` that
  proves identity (value: `api.ListItem === api.List.Item`; types: a typed
  assignment test) makes `<Alias>.<sub>` inherit the status of
  `<Target>.<sub>`. Inherited entries must say so in `raycast-api.json`
  (e.g. `via: "List.Item"`). Keep the headline split: non-deprecated vs all.
- Runtime: export every missing value alias from
  `packages/runtime/src/api/index.ts` with identity to its target (stubs from
  `unsupported.generated.ts` must not shadow them; regenerate stubs). For
  structural duplicates, implement as the modern equivalent when trivial
  (e.g. `ActionPanelItem` = `Action`), otherwise leave missing and list them.
- Unit tests for the inventory/report changes with small fixture
  declarations; identity tests for the runtime aliases.
- Do not touch `packages/runtime/src/api/form.ts` (task 0042 is editing it);
  Form value aliases can be exported from `index.ts` only.

## Acceptance

- [ ] Inventory records alias targets; report inherits with `via`; tests.
- [ ] Runtime exports every value alias with identity tests.
- [ ] `compat/COVERAGE.md` shows deprecated coverage; Handoff lists remaining
      deprecated gaps with reasons and the before/after all-paths coverage.
- [ ] `bun run verify` passes.

## Out of scope

- Changing behaviour of the modern APIs.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
