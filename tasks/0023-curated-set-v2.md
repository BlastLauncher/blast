---
id: "0023"
title: Curated set v2 — 40 commands chosen by script, incl. @raycast/utils
status: doing
milestone: M3
depends: []
---

## Goal

Grow the curated smoke set from 10 to about 40 extensions, chosen
reproducibly by a committed selection script, so the smoke report measures
real breadth (Form, Detail, `@raycast/utils` users) and gives the next M3
priorities.

## Context

- Selection script `scripts/corpus/select.ts`, static only, over the pinned
  corpus manifests plus `src/` of candidates (use `corpus:fetch` patterns;
  stay under the disk guard; never `git ls-tree -l`/`cat-file -s`).
  Criteria: dependencies ⊆ `@raycast/api`, `@raycast/utils`; at least one
  `view` command; no `child_process`/AppleScript/`fs` writes; prefer no
  network (`fetch(`). Then pick deterministically (sort by name hash) a
  stratified mix: ~10 more List-only, ~10 Form, ~10 Detail-heavy, ~10 using
  `@raycast/utils` hooks (`useCachedState`, `useLocalStorage`,
  `usePromise`…). Record the criteria and the chosen names in
  `compat/corpus.json` (`curated`, keep the original 10 first).
- Then run `bun run corpus:smoke` over the new set and commit the reports
  (after `bun run fmt`). Failures are expected; do not fix Blast code here.
- Summarise in Handoff: rendered count and the top 10 first-missing APIs by
  number of commands blocked.
- Another worker implements Form in parallel; the orchestrator re-runs smoke
  after merging both.

## Acceptance

- [ ] Selection is reproducible: running the script twice yields the same
      list (unit test on the pure selection logic with fixture manifests).
- [ ] `compat/corpus.json` and smoke reports committed; Handoff has the
      blocker ranking.
- [ ] `bun run verify` passes; `.cache/raycast-extensions` deleted.

## Out of scope

- Any runtime/API changes; extensions with other npm dependencies.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
