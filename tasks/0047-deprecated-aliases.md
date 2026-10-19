---
id: "0047"
title: Deprecated aliases — exports plus alias-aware coverage
status: review
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

- [x] Inventory records alias targets; report inherits with `via`; tests.
- [x] Runtime exports every value alias with identity tests.
- [x] `compat/COVERAGE.md` shows deprecated coverage; Handoff lists remaining
      deprecated gaps with reasons and the before/after all-paths coverage.
- [x] `bun run verify` passes.

## Out of scope

- Changing behaviour of the modern APIs.

## Handoff

Branch/commit: `t3/implement-deprecated-aliases` @ `f6eaab76873587107819e1e1098095a1cb22bb02` (implementation; subsequent task-only commit records this handoff).

Verify: `verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok) in 59.2s`

Done:

- Recorded scoped alias targets for typeof values, simple type references,
  empty inherited interfaces and nested typeof members; structural duplicates
  deliberately have no inferred target.
- Inherited descendant evidence only beneath explicitly tagged aliases, with
  `via`, combined identity/target tests, partial propagation, direct evidence
  precedence and cycle protection. Added inventory/report fixture tests.
- Exported public value aliases with identity tests, including nested
  ActionPanel/Form names, legacy action components and literal `specialKeys`.
  Added erased legacy type exports and bidirectional assignment tests.
  Public facades preserve underlying implementation objects; `form.ts` is untouched.
- Regenerated inventory, stubs and coverage. Updated the unsupported-render
  fixture to use `render` because `FormTextField` now works. No dependencies added.
- All-paths coverage: **1638/2473 (66.2%) → 2037/2473 (82.4%)**;
  partial **64 → 186**, missing **771 → 250**.
  Deprecated: **182/939 (19.4%) → 581/939 (61.9%)**, 127 partial,
  231 missing. Non-deprecated stays **1456/1534**, 59 partial, 19 missing.
  Final implementation gate: **463 pass, 0 fail**.

Not done / risks:

Remaining deprecated missing paths, grouped exhaustively (231 total):

| Group                                                                   | Missing | Reason                                                                                                                                                                                 |
| ----------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ActionPanelItem.*`                                                     | 104     | Structural duplicate of Action: implemented identity, but no inferred alias metadata by design.                                                                                        |
| Legacy `*Action.Props.*` and Props roots                                | 52      | Structural component declarations, so modern evidence cannot be inherited automatically. Includes CopyToClipboard, Open, OpenInBrowser, OpenWith, Paste, Push, ShowInFinder and Trash. |
| `Preference`, its members, `Preferences`                                | 12      | Legacy preference metadata schema differs from modern preference values.                                                                                                               |
| `ActionPanelState`, `.update`                                           | 2       | Obsolete imperative action-panel state has no modern equivalent.                                                                                                                       |
| `ArgumentsLaunchProps`, `FormLaunchProps`, their members                | 4       | Structural launch-prop duplicates, no alias metadata or new evidence.                                                                                                                  |
| `Form.DropdownItem.*`, `Form.DropdownSection.*`, `Form.TagPickerItem.*` | 12      | Nested identities work; declaration targets are internal names absent from the public coverage denominator.                                                                            |
| Existing deprecated modern-API gaps and their aliases                   | 40      | Details below; modern behavior is out of scope.                                                                                                                                        |
| `preferences`, `randomId`, `render`, `useActionPanel`, `useId`          | 5       | Remain structured unsupported values: legacy metadata/state/rendering contracts or untyped declarations, without a declared identity target.                                           |

The 40 existing gaps are: Action/ActionPanel legacy `id` and clipboard
`transient` paths plus their aliases (10); `Color.Brown` and three members (4);
`Environment`/`environment` legacy command/theme/context fields (7);
Form field `focus`/`reset` alias methods (12, task 0042 owns refs);
`Keyboard.Shortcut.windows` and `KeyboardShortcut.windows` plus members (6);
and `SubmitFormAction.displayName` (1).

The 127 partial entries preserve existing partial evidence or inherit it:
103 under `ActionPanel.Item` inherit its pre-existing partial identity claim;
other action roots, Form persistence/filtering/drafts, submenu filtering,
alert remembering, cache directory, list filtering and submit callbacks stay
partial. No coverage is fabricated for missing modern target evidence.
