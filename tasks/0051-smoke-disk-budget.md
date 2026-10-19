---
id: "0051"
title: Corpus smoke within the default disk budget
status: doing
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

- [ ] Pure batching logic unit-tested (batch sizing from a budget).
- [ ] Real run under the default budget; peak size in Handoff; reports
      unchanged (or differences explained).
- [ ] `bun run verify` passes.

## Out of scope

- Changing which extensions are curated.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
