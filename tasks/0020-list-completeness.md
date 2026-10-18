---
id: "0020"
title: List completeness — accessories, search, dropdown, Action.Style
status: doing
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
Branch/commit:
Verify:
Done:
Not done / risks:
```
