---
id: "0098"
title: Sweep reporting fixes and bounded corpus fetch growth
status: todo
milestone: M6
depends: []
---

## Goal

Sweep reports classify native interop and action-level sandbox errors
correctly, label resumed-run metrics honestly, and a fresh full run stays
within a modest disk budget.

## Context

From the 0094 triage and its run:

1. `swift:` (82) and `rust:` (33) imports are Raycast native interop, not npm
   packages. Selection excludes only `swift:` (`scripts/corpus/selection.ts:55-58`),
   and `packages/host/src/bundle.ts:255-291` reports them as missing
   dependencies. Report a `native-module` outcome instead, and exclude both
   from the satisfied population consistently.
2. Primary-action errors with EPERM (sandbox) are classified as action
   crashes; classify them as sandbox-denied like render outcomes.
3. A resumed run reports wall time, throughput, peak and projected duration as
   if whole-run. `compat/SWEEP.md` carries a manual warning today; make
   `renderSweepMarkdown` emit it and omit those figures when the log was
   resumed.
4. The blobless partial clone keeps every fetched blob, so a fresh full run
   grows past the 600 MB default (the 0094 run needed 4 GB). Bound it, for
   example by repacking or recloning between batches; record the new peak.

## Acceptance

- [ ] Tests for each of items 1–3.
- [ ] A fresh `--limit 300` run stays under the default budget, with the peak
      in Handoff, and `.cache` left under 150 MB.
- [ ] The sandbox, broker and bundle confinement are unchanged.
- [ ] `bun run verify` passes.

## Out of scope

- Implementing Swift or Rust interop; a full rerun (the orchestrator does that).

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
