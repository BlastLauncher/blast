---
id: "0051"
title: Corpus smoke within the default disk budget
status: review
milestone: M3
depends: []
---

## Goal

`bun run corpus:smoke` for the 80 curated extensions runs within the default
`BLAST_CORPUS_MAX_MB` (600) instead of needing 1200, so disk use stays
minimal as the curated set grows.

## Context

- Today the smoke run checks out every curated extension (with assets,
  ~700 MB) at once. Process extensions in batches: sparse-checkout a batch,
  bundle + run its commands, then drop it from the sparse set (and prune the
  working tree) before the next batch, keeping peak disk under the budget.
  Reuse the batching approach of `scripts/corpus/scan.ts` and the guard in
  `scripts/corpus/corpus.ts`. Never `git ls-tree -l`/`git cat-file -s`.
- Report peak `.cache` size in the smoke output and in Handoff.
- Results must be identical to the committed `compat/smoke.json` apart from
  ordering-independent fields; if anything changes, explain it.
- Parallel worker: task 0050 may re-run smoke too; avoid editing its files
  (`packages/host/src/*`).

## Acceptance

- [x] Pure batching logic unit-tested (batch sizing from a budget).
- [x] Real run under the default budget; peak size in Handoff; reports
      unchanged (or differences explained).
- [x] `bun run verify` passes.

## Out of scope

- Changing which extensions are curated.

## Handoff

```
Branch/commit: t3/smoke-disk-budget @ 2fe6253
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok) in 59.9s
Done:
- Added `batchSize(maxMb)` to `scripts/corpus/corpus.ts` (+ MIN/MAX/
  ASSUMED_MB_PER_EXTENSION constants), unit-tested in corpus.test.ts: pure,
  grows with the budget between a 5-extension floor and a 20-extension
  ceiling.
- `scripts/corpus/smoke-run.ts` now processes the curated set in
  `batchSize`-sized batches: each batch calls `corpus:fetch --extension ...`
  (narrowing sparse-checkout to exactly that batch, which drops the previous
  batch's files from the working tree), runs that batch's commands, then
  moves on; a `finally` narrows back to manifest-only when done. Tracks and
  logs peak `.cache` size across all batches.
- Real run (`bun run corpus:smoke`, default `BLAST_CORPUS_MAX_MB=600`):
  completed in 2m13s, peak `.cache` 437.8 MB (well under 600 MB; previously
  needed 1200 MB because the old code sparse-checked out all 80 curated
  extensions — with assets — simultaneously). Totals unchanged: rendered
  185, completed 2, capability-denied 7, bundle-failed 0, crashed 6, network
  0, timeout 0, unsupported-mode 0, unsupported-api 0 — matches PLAN.md's
  recorded smoke summary.
- Regenerated `compat/smoke.json`/`compat/SMOKE.md`. The only content diff
  vs. the committed version is the random tmp-build-dir suffix inside the
  two pre-existing `undici` crash messages (`bugmenot/find-login`,
  `valkey-commands-search/search-valkey-commands`) — `bundleCommand` mints a
  fresh tmp dir per run and that raw path (unlike the sanitized `logs`
  entry) isn't scrubbed before being stored in `error`. This is the same
  known undici crash task 0050 is already tracking, not something batching
  introduced; it would differ between any two runs regardless of batching.
  Deliberately did not touch `packages/host/src/*` to avoid colliding with
  0050's parallel work.
- Deleted `.cache/raycast-extensions` after the run per instructions.

Not done / risks:
- `batchSize`'s constants (15 MB/extension assumption, 5/20 batch bounds)
  are a conservative heuristic, not measured per-extension sizing; the real
  safety net is still the existing `checkDiskBudget` guard inside
  `corpus:fetch`, which aborts if a batch ever does overshoot.
- Did not re-run with `BLAST_CORPUS_MAX_MB=1200` to compare; the default-
  budget run already demonstrates the acceptance criterion.
```
