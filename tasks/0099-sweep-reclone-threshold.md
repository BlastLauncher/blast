---
id: "0099"
title: Reclone the sweep corpus only when it nears the disk budget
status: doing
milestone: M6
depends: []
---

## Goal

A fresh full corpus sweep finishes in under an hour while still staying under
the default 600 MB corpus budget.

## Context

0098 bounded `.cache` growth by deleting and recloning the partial clone before
every source batch (`scripts/corpus/batch.ts`). That works for disk (a
300-extension run peaked at 244 MB), but a full run has roughly 100 batches,
and each reclone costs about a minute, so the first fresh full run hit a 2-hour
limit at 83%. Before 0098, the clone grew by about 40-120 MB per batch.

Second gap: when a run is killed mid-checkout, git leaves
`.cache/raycast-extensions/.git/index.lock` (or `sparse-checkout.lock`), and
the next `--resume` fails on it until the clone is deleted. On start, if the
clone holds a git lock and no git process owns it, delete the clone and reclone.

Reclone only when needed: after each batch, measure the clone's size and
reclone before the next batch only when it exceeds a threshold, for example
half of `BLAST_CORPUS_MAX_MB`. Keep the existing budget check and the 20 GB
free-space floor.

## Acceptance

- [ ] The reclone decision is a pure, tested function of the measured size and
      the budget, and `batch.ts` calls it.
- [ ] A fresh `bun run corpus:sweep --limit 300 --seed 0091 --jobs 4` stays
      under the default budget, and runs faster than with 0098's per-batch
      reclone (record wall time and peak in Handoff). Don't commit its report.
- [ ] A test proves a clone holding a stale git lock is replaced on start.
- [ ] `.cache` is left under 150 MB. `bun run verify` passes.

## Out of scope

- The sandbox, broker, selection or bundle confinement; a full sweep run.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
