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

- [x] The reclone decision is a pure, tested function of the measured size and
      the budget, and `batch.ts` calls it.
- [x] A fresh `bun run corpus:sweep --limit 300 --seed 0091 --jobs 4` stays
      under the default budget, and runs faster than with 0098's per-batch
      reclone (record wall time and peak in Handoff). Don't commit its report.
- [x] A test proves a clone holding a stale git lock is replaced on start.
- [x] `.cache` is left under 150 MB. `bun run verify` passes.

## Out of scope

- The sandbox, broker, selection or bundle confinement; a full sweep run.

## Handoff

```
Branch/commit: t3/e82346d8 (round-2 worktree; t3/sweep-reclone-threshold fast-forwarded to it) @ 812d2db (code, tests and acceptance run); this Handoff text is the commit after it
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, workflow ok, test ok) in 64.9s
Done:
- `shouldReclone(bytes, maxMb)` (scripts/corpus/corpus.ts) is a pure function, true only past half the budget; the boundary (exactly 300 MB of 600) is tested. `fetchBatch` measures `.cache/raycast-extensions` before each source batch and deletes the clone only when it is over the threshold.
- `removeStaleClone(root)` in scripts/corpus/batch.ts deletes a clone whose `.git/index.lock` or `.git/info/sparse-checkout.lock` exists and whose owner no running git process is (cwd inside the clone, via `lsof`); it runs at the start of every fetch, so a `--resume` after a kill replaces the clone instead of failing. Deletion only via `fs.rm(join(root, CORPUS_DIR))`, with an empty-root guard.
- `fetchBatch` is now async (it removes files); smoke-run, smoke-deps-run, tui-smoke-run and sweep-run await it.
- Tests: scripts/corpus/batch.test.ts covers `.git/index.lock` with the default owner probe, `.git/info/sparse-checkout.lock`, no lock, a lock held by a live git process, and the empty-root refusal.
- Acceptance run from an empty `.cache`: `bun run corpus:sweep --limit 300 --seed 0091 --jobs 4`, 853 commands (772 rendered), wall 320.19 s and peak .cache 383.8 MB (0098's per-batch reclone: 410 s, 243.7 MB, 16 clone events). This run cloned 5 times: once at start and four reclones. Report restored with `git checkout -- compat/SWEEP.md compat/sweep.json`; `.cache` left at 196 KB (sweep log only).
Not done / risks:
- The threshold is checked on the clone before a batch, and one batch can add up to ~120 MB of blobs, so the peak sits near half the budget plus one batch rather than at half.
- The owner probe is best effort: if `lsof` is missing or fails, a lock with no observable owner counts as stale. Two runs sharing one `.cache` are still unsupported.
- The acceptance report was intentionally discarded; the orchestrator's full rerun produces the retained one.
```
