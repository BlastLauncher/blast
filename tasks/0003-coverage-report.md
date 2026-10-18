---
id: "0003"
title: Join @covers test evidence into the coverage report
status: doing
milestone: M0
depends: ["0002"]
---

## Goal

`bun run compat:report` scans tests for `// @covers <path>` tags, joins them
with the inventory, and writes `compat/raycast-api.json` and
`compat/COVERAGE.md`; verify fails when the report is stale or a tag names an
unknown path.

## Context

- Inventory: `compat/raycast-api.inventory.json` (task 0002).
- Tags live in `packages/**/*.test.ts(x)` only, one path per tag, e.g.
  `// @covers List.Item.Props.title`. A tag may end with ` partial` to mark
  partial support.
- Status per inventory path: `covered`, `partial`, or `missing`. A parent is
  not implied covered by its children.
- `compat/raycast-api.json`: per path `{ status, tests: [file] }` plus totals.
  `compat/COVERAGE.md`: short human summary — version, totals per kind, then a
  table of top-level symbols with covered/total children. Keep it under ~300
  lines; it is generated, so the docs size limits don't apply, but it must stay
  readable.
- Weighting by corpus usage arrives in M2; leave a `weight` field out for now.
- Extend the `compat` verify step: report regenerates with no diff; unknown
  tag paths fail with file:line.
- There are no product packages yet. Tests must use fixture directories in a
  temp dir; the real report will show 0 covered, which is correct.

## Acceptance

- [ ] Fixture tests: covered, partial, unknown-path error with file:line,
      duplicate tags across files, tags outside `packages/` ignored.
- [ ] Real run produces committed `compat/raycast-api.json` and
      `compat/COVERAGE.md` with 0 covered and correct totals.
- [ ] Verify fails on a stale report and on an unknown tag.
- [ ] Section "Raycast API coverage" in `AGENTS.md` still matches behaviour;
      if not, describe the needed change in Handoff (do not edit AGENTS.md).
- [ ] `bun run verify` passes.

## Out of scope

- Corpus usage weights; any product package code.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
