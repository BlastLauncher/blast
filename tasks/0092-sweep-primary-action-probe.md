---
id: "0092"
title: Probe primary actions in the corpus sweep
status: doing
milestone: M6
depends: ["0091"]
---

## Goal

The sweep shows whether commands respond to use, not only whether they mount, by
dispatching the primary action of the first scene and classifying what happens.

## Context

Add `--probe-actions` to `corpus:sweep`, inside the same containment as 0091.
Use `packages/client-core` to find the primary action as an embedder would.
Do not reimplement its selection or action logic in scripts.

Classify each probed command: `navigated`, `scene-changed`, `capability-requested`
(with the capability, denied by the broker), `no-primary-action`, `no-op`,
`crashed`, `timeout`. A denied capability counts as the command working as far
as a headless run can show, which the report must state.

## Acceptance

- [ ] Fixture tests cover each classification deterministically.
- [ ] `compat/SWEEP.md` gains a probe section with totals and ranked crash causes,
      still within its size limits.
- [ ] Pilot of `--limit 100 --probe-actions` committed.
- [ ] Handoff states the crash rate after a primary action compared to the
      render-only crash rate, and the added runtime per command.
- [ ] `.cache` is left under 150 MB.
- [ ] `bun run verify` passes.

## Out of scope

- The full run, typed input, secondary actions, multi-step navigation.
- Fixing any failure the probe finds.

## Handoff

```
Branch/commit: t3/fix-primary-action-probe-metrics @ c54ded8
Verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, workflow ok, test ok) in 51.4s
Done:
- Settled loading scenes before probing, split empty content from items without a primary action, and kept exit-first scene changes from becoming `no-op`.
- Added deterministic scene-stream tests for loading settlement and both exit/scene event orders, plus action-field path/token redaction coverage.
- Refreshed the 100-extension pilot report. Probe outcomes before → after: navigated 3 → 6; scene-changed 51 → 44; capability-requested 6 → 7; no-primary-action 187 → no-items-or-content 154 + items-but-no-primary-action 12; still-loading 0 → 1; no-op 0 → 0; crashed 0 → 0; timeout 0 → 6.
- Crash rates before (the old structurally invalid metrics) were render-only 0/247 and post-action 0/247; the pilot's actual render crashes were 2/262. After the fixes: render-only 10/262 (3.8%); post-action 0/63 dispatched (0.0%). Probe time is 102.6 ms per dispatched command.
- Pilot cleanup left `.cache` at 132 KiB.
Not done / risks: A same-selection run without `--probe-actions` was not measured, so no wall-time delta is reported. Six commands reached the bounded action timeout and remain untriaged by design.
```
