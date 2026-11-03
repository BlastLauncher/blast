---
id: "0098"
title: Sweep reporting fixes and bounded corpus fetch growth
status: doing
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

- [x] Tests for each of items 1–3.
- [x] A fresh `--limit 300` run stays under the default budget, with the peak
      in Handoff, and `.cache` left under 150 MB.
- [x] The sandbox, broker and bundle confinement are unchanged.
- [x] `bun run verify` passes.

## Out of scope

- Implementing Swift or Rust interop; a full rerun (the orchestrator does that).

## Handoff

```
Branch/commit: t3/sweep-reporting-fetch (worker 2d75bc4; finished by the orchestrator after a model capacity stop)
Verify: see the merge commit; verify passed on the branch before merge
Done:
- swift:/rust: imports raise NativeModuleError in packages/host/src/bundle.ts and get a `native-module` outcome; selection and the satisfied population exclude both consistently.
- A sandbox EPERM after the primary action is `sandbox-denied`, not a crash (test added by the orchestrator).
- Resumed runs: SWEEP.md warns and omits wall time, throughput, peak and projection.
- Fetch growth bounded by recloning the partial clone between source batches.
- Acceptance run: fresh `corpus:sweep --limit 300 --seed 0091 --jobs 4`, 853 commands (764 rendered, 7 native-module), peak .cache 243.7 MB against the 600 MB default; .cache left at 196 KB. The partial report was not committed.
Not done / risks:
- Recloning re-fetches manifests for every batch: bounded disk, more network per run.
```
