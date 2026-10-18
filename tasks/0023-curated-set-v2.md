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
Branch/commit: t3/curated-set-v2 @ edc71d2
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok) in 17.0s
Done:
- scripts/corpus/selection.ts: pure, offline-tested rules (provided
  dependencies, at least one view command, static source exclusions, fixed
  kept set, name-hash ranking, strata quotas, offline-first capacity);
  selection.test.ts covers them with fixture manifests. scripts/corpus/select.ts
  (`bun run corpus:select`) fetches manifests, sparsely checks out candidates
  in hash order under the disk guard and rewrites compat/corpus.json with the
  criteria, strata and scanned/eligible counts next to `curated`.
- Curated set is the 10 kept extensions first (KEPT_CURATED, re-checked
  against the same rules) plus 10 Form (storybook-sandboxes, … laravel-shift),
  10 Detail-heavy (tategaki, … donut) and 10 @raycast/utils-hook extensions
  (url-designer, … windows-domain) = 40. The selector keeps reading until every
  quota can be met offline, so all 30 new picks use no network (768 candidates
  scanned, 458 eligible).
- Reproducible: re-running `corpus:select` twice on the pin produced
  byte-identical compat/corpus.json (diff clean).
- Smoke over the new set: 66 commands, rendered 35 (list-only 13/13,
  detail 9/12, utils 9/18, form 4/23).
- Reused 0012's source walker (exported `sources()` from scan.ts) instead of
  duplicating it; corpus pin test now pins the first ten and >= 40 curated.
Not done / risks:
- Blocker ranking (commands blocked), from compat/smoke.json: Cache 13,
  Form 6, getApplications 4, openExtensionPreferences 2, Clipboard.readText 1,
  Grid 1. Cache is the clear next M3 target: it is what blocks most utils hook
  users (useCachedState/useCachedPromise). Also unsupported-mode 2 (one
  menu-bar command, one no-view command that never publishes a scene) and
  crashed 2: ego-lite `__filename is not defined`, and google-maps-search
  `Capability denied: open.url` (the smoke run's deny-all broker, not an API
  gap). No runtime/API code was touched.
- Quota reading of the task: "about 40 extensions" and "~10 more List-only"
  cannot both hold, so quotas are list-only 10 (already met by the ten kept
  extensions, all List-centric), Form 10, Detail 10, utils 10; all four strata
  and the arithmetic are recorded in compat/corpus.json.
- Criteria widened beyond the task text, all static and recorded in
  `criteria`: exclusions also cover `swift:` native-module imports (dropped
  sidecar-connect, whose 4 commands could only fail), offline preference also
  counts axios/XMLHttpRequest/http(s)/useFetch/useStreamJSON and AppleScript
  strings ("tell application").
- Stratum rules are regexes over candidate sources, so they are best-effort:
  a Form/Detail label means one source file matched, not that every command
  does. A false positive mislabels an extension; it never hides a failure.
- `corpus:select` is slow-ish by design: it scans up to SCAN_CAP=768
  candidates (~166 MB checkout, well under BLAST_CORPUS_MAX_MB=600) so every
  quota can be filled without network users. `.cache/raycast-extensions` is
  deleted; `bun run corpus:smoke` output needs `bun run fmt` afterwards
  because oxfmt pads the markdown table.
```
