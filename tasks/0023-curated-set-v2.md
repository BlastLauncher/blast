---
id: "0023"
title: Curated set v2 — 40 commands chosen by script, incl. @raycast/utils
status: review
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

- [x] Selection is reproducible: running the script twice yields the same
      list (unit test on the pure selection logic with fixture manifests).
- [x] `compat/corpus.json` and smoke reports committed; Handoff has the
      blocker ranking.
- [x] `bun run verify` passes; `.cache/raycast-extensions` deleted.

## Out of scope

- Any runtime/API changes; extensions with other npm dependencies.

## Handoff

```
Branch/commit: <branch> @ <sha>
Verify: <summary line>
Done:
- scripts/corpus/selection.ts (pure rules: dependency/view-command/static
  source verdicts, name-hash ranking, strata quotas) + selection.test.ts;
  scripts/corpus/select.ts + `bun run corpus:select` writes compat/corpus.json.
- Curated set is now the 10 kept extensions (fixed first, re-checked against
  the same rules) plus 10 Form, 10 Detail-heavy and 10 @raycast/utils-hook
  extensions = 40, all of the new picks offline.
- Smoke run: 66 commands over 40 extensions, 35 rendered.
- Kept 0012's `sources()` reuse by exporting it from scan.ts; updated the
  corpus pin test (first ten intact, >= 40 curated).
Not done / risks:
- Blocker ranking (commands blocked), from compat/smoke.json: Cache 13,
  Form 6, getApplications 4, openExtensionPreferences 2, Clipboard.readText 1,
  Grid 1. Also unsupported-mode 2 (one menu-bar command, one no-view command
  that never publishes a scene) and crashed 2 (ego-lite `__filename is not
  defined`; google-maps-search `Capability denied: open.url`, i.e. the
  deny-all broker of the smoke run, not an API gap).
- Quota reading: the task's "~40" total and "~10 more List-only" cannot both
  hold, so quotas are list-only 10 (already met by the ten kept extensions),
  Form 10, Detail 10, utils 10; all four are recorded in corpus.json.
- Stratum source rules are regexes (documented in `criteria`), so they are
  best-effort: they can mislabel a matched extension, never a missing rule.
- `corpus:select` scans up to SCAN_CAP=768 candidates (~166 MB checkout) so
  every quota can be filled offline; the task's disk guard applies throughout.
```
