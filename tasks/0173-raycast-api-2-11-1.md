---
id: "0173"
title: Upgrade the coverage denominator to @raycast/api 2.11.1
status: todo
milestone: M10
depends: []
---

## Goal

`compat/` measures against the latest `@raycast/api` (2.11.1), as AGENTS.md
requires, and issue #89 can be closed.

## Context

- The weekly job vendored 2.11.1 on branch `origin/compat/raycast-api-2.11.1`
  (one commit, `f0f24d8`) and opened issue #89. `main` still reports 2.10.1.
- AGENTS.md "Raycast API coverage": upgrading = `compat:fetch` →
  `compat:inventory` → `compat:report` (`bun run compat:upgrade` wraps it),
  then review the inventory diff. Regenerate on top of current `main`
  rather than merging the old branch, if that is simpler; never hand-edit
  `compat/`.
- New or changed symbols: if any are now missing, add `// @covers` evidence
  where Blast already implements them, or the `compat:stubs` stub where it
  does not; list each one in Handoff. Do not implement new APIs here; a
  missing one becomes a follow-up line in Handoff.

## Acceptance

- [ ] `compat/COVERAGE.md` says `@raycast/api@2.11.1`; Handoff lists the
      inventory diff (added/removed/changed symbols) and the new coverage
      numbers.
- [ ] `bun run verify` passes.

## Out of scope

- Implementing new API surface; closing the GitHub issue (the orchestrator does).

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
