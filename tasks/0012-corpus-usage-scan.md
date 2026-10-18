---
id: "0012"
title: Static Raycast API usage scan of the whole corpus
status: review
milestone: M2
depends: ["0011"]
---

## Goal

`bun run corpus:scan` statically measures, for every inventory path, how many
corpus extensions use it, and the coverage report ranks gaps by that weight.

## Context

- Static only: parse source with `oxc-parser` (already a devDependency);
  never execute extension code.
- Process the corpus in batches (e.g. 200 extensions): add sparse patterns for
  code files only (`/extensions/<name>/src/**/*.{ts,tsx,js,jsx}` — check the
  non-cone pattern syntax works), scan, then reset patterns back to manifests
  so the working tree shrinks. Keep `.cache/raycast-extensions` under the
  0011 disk guard. Report peak `.cache` size in Handoff.
- What counts as a use of a path (map to inventory paths in
  `compat/raycast-api.inventory.json`; drop anything not in the inventory):
  - named imports from `@raycast/api` (`List`, `showToast`, aliases via
    `as`), and namespace imports (`import * as Raycast`);
  - member chains on those (`List.Item`, `Action.CopyToClipboard`,
    `Toast.Style.Success`, `Clipboard.copy`);
  - JSX elements resolved the same way (`<List.Item>`) and the attribute
    names on them, mapped to `<Component>.Props.<attr>`.
  - Each extension counts at most once per path.
- Output `compat/raycast-usage.json`: `{ corpusCommit, extensions,
  paths: { "<path>": count } }`, sorted, byte-stable. Committed; regenerating
  requires the network, so verify does **not** rerun the scan — but the report
  generator (task 0003 code) must read the usage file when present: add
  `weight` per entry to `compat/raycast-api.json` and a "Top missing by usage"
  table (top 50) to `compat/COVERAGE.md`. Verify's staleness check still
  covers report regeneration.
- Parsing logic is a pure function with fixture tests (no network).

## Acceptance

- [x] Fixture tests cover named/aliased/namespace imports, member chains, JSX
      elements and props, and once-per-extension counting.
- [x] Real scan over all ~3,443 extensions committed; Handoff lists runtime,
      peak disk, top 20 paths with counts, and parse-failure count.
- [x] `compat/COVERAGE.md` shows weights; `bun run verify` passes.

Note: `corpus:fetch` replaces the sparse pattern set on each run (manifests are
always included); `scripts/corpus/corpus.ts` has the pin and pattern helpers.
Delete `.cache/raycast-extensions` when finished.

## Out of scope

- Usage of `@raycast/utils` (record its import count as one number only).
- Any runtime/shim changes.

## Handoff

Branch/commit: `t3/corpus-usage-scan` @ `74b5402` (implementation; this handoff is committed separately).
Verify: `verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok) in 10.4s` — 160 tests pass.
Done:

- Added static oxc-parser scanning, import aliases/namespaces, member/type chains,
  JSX elements/explicit props, and extension-level deduplication. Tests cover
  these rules, parse failures, deterministic aggregation, and real local Git
  sparse-pattern matching/resetting without network access.
- Scanned all 3,443 extensions at `3b812d1e153a1862df29bc8ec34e170c728512ea`
  in 105.2s, in 200-extension batches. Peak `.cache` apparent size was 90.2 MiB
  (the 0011 disk-guard measurement, below 600 MiB). 2,068 extensions import
  `@raycast/utils`; 2 files failed parsing. Removed `.cache/raycast-extensions`
  after the scan. No dependencies added; reused oxc-parser and corpus helpers.
- Committed all 2,473 inventory weights, joined them into the coverage JSON,
  and generated the top 50 missing paths by usage. Verify checks saved-weight
  regeneration without fetching the corpus. Tests cover ranking and staleness.
- Top 20 paths (extension counts): `ActionPanel=3023`, `Action=2985`,
  `List=2604`, `Icon=2587`, `List.Item=2565`, `List.Item.Props.title=2557`,
  `List.Item.Props.actions=2526`, `showToast=2471`, `Toast=2413`,
  `Toast.Style=2407`, `List.Props.isLoading=2311`, `Action.Props.onAction=2301`,
  `Action.Props.title=2301`, `Toast.Style.Failure=2149`,
  `getPreferenceValues=2119`, `List.Item.Props.icon=2078`, `Action.Props.icon=2011`,
  `List.Item.Props.accessories=1884`, `List.Props.searchBarPlaceholder=1876`,
  `List.Item.Props.subtitle=1874`.

Not done / risks: Syntax-invalid files were skipped:
`extensions/bitfinex/src/lib/bitfinex.d.ts` (optional parameter with initializer),
`extensions/material-icons/src/type.d.ts` (declare inside ambient context).
Resolution is syntactic by imported name, without data-flow or re-export
inference; dynamic property names and spread props are not inferred. Seven
legacy corpus directory names need a path-safe case/dot/underscore allowance
in the scanner; the fetch tool's publishing-name validation is unchanged.
