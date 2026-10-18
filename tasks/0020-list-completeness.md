---
id: "0020"
title: List completeness — accessories, search, dropdown, Action.Style
status: review
milestone: M3
depends: []
---

## Goal

The most-used remaining List APIs work: `List.Item.Props.accessories`
(1,884 extensions), `List.Props.onSearchTextChange` (1,174),
`List.Dropdown` + `List.Dropdown.Item` (~920), and `Action.Style` /
`Action.Props.style` (~880).

## Context

- Check every prop and enum value in `compat/raycast-api/index.d.ts`.
- `accessories` is an array of objects (`text`, `tag`, `date`, `icon`,
  `tooltip`, with `{ value, color }` forms) — serialize faithfully; `Date`
  values must become ISO strings (today the serializer drops `Date`; extend
  it deliberately and test it).
- `onSearchTextChange` already passes through as a handler but is undeclared
  and untested; declare it, `throttle`, `filtering`, `searchText`.
- `List.Dropdown` is the `searchBarAccessory`; it renders into the existing
  `Slot`. Include `List.Dropdown.Section`, `onChange`, `value`/`defaultValue`,
  `storeValue` (record as unsupported-partial if persistence is needed).
- `Action.Style` values from the declarations (`Regular`, `Destructive`).
- CLI: add a script command to select a dropdown value (e.g. `dropdown
  <title>`), documented in `--help`.
- `@covers`, `bun run compat:report`, `bun run corpus:smoke` (stay 13/13),
  commit reports after `bun run fmt`. Other workers change toast/alert (0019)
  and storage/open (0021) in parallel; avoid their files.

## Acceptance

- [ ] Tests for each accessory form (incl. Date), search handler, dropdown
      selection through dispatch, Action.Style; CLI e2e for `dropdown`.
- [ ] `bun run verify` passes.

## Out of scope

- Client-side filtering behaviour (a client concern; note it in Handoff).

## Handoff

```
Branch/commit: t3/list-completeness @ <this commit>
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok) in 16.5s (216 tests, 1937 expect calls)
Done:
- Serializer serializes `Date` as an ISO string (nested too); updated the
  reconciler test that previously asserted Dates are dropped.
- `List.Item.Props.accessories` (text/date/tag with `{ value, color }` forms,
  icon, tooltip) declared in `ListAccessory` and passed through; `List.Props.
  onSearchTextChange`/`throttle`/`filtering` declared (`filtering` keeps the
  `{ keepSectionOrder }` form).
- `List.Dropdown` + `.Item` + `.Section` implemented, rendering into the
  existing `searchBarAccessory` Slot; all Dropdown props declared.
- `Action.Style` ({ Regular, Destructive }) attached to `Action`;
  `Action.Props.style` declared and serializes.
- CLI script command `dropdown <value>` dispatches the `List.Dropdown`
  `onChange` handler; documented in `--help` and docs/architecture.md.
- New fixture `fixtures/extensions/list-extras` with e2e CLI tests; new
  `packages/runtime/src/api/list-extras.test.ts`; compat report regenerated
  (non-deprecated coverage 41.3% → 42.3%); corpus smoke stays 13/13; corpus
  cache deleted after the run.
Not done / risks:
- `storeValue` persistence is not implemented (needs LocalStorage, task 0021);
  covered as `partial`.
- Client-side filtering (`filtering` behaviour) is a client concern — out of
  scope per this task; the prop is declared and serialized so clients can act
  on it.
- `List.Dropdown.Props.onSearchTextChange` is dispatched but no client throttles
  it (`throttle` is declared, not acted on) — covered as `partial`.
- `ActionStyle` is mirrored by hand in `action.ts` (comment explains why): the
  inventory only tracks `Action.Style`, so the enum generator cannot name its
  members and its generated test would emit unknown `@covers` paths.
- Two `@covers Action.Style`/`accessories` claims are `partial`: scene exposes
  the data, but no client renders accessory colours or action styles yet.
```
