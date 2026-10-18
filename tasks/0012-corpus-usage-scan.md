---
id: "0012"
title: Static Raycast API usage scan of the whole corpus
status: todo
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

- [ ] Fixture tests cover named/aliased/namespace imports, member chains, JSX
      elements and props, and once-per-extension counting.
- [ ] Real scan over all ~3,443 extensions committed; Handoff lists runtime,
      peak disk, top 20 paths with counts, and parse-failure count.
- [ ] `compat/COVERAGE.md` shows weights; `bun run verify` passes.

## Out of scope

- Usage of `@raycast/utils` (record its import count as one number only).
- Any runtime/shim changes.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
