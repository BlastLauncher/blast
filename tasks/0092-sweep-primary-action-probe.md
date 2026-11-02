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
Branch/commit: t3/sweep-primary-action-probe @ ea6934e
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, workflow ok, test ok) in 53.0s
Done:
- Added `--probe-actions`; primary dispatch uses `packages/client-core` inside the same Seatbelt child runtime.
- Added deterministic classifications and fixture coverage for all seven action outcomes, including broker-denied capability evidence.
- Committed the 100-extension pilot report with totals and ranked action crash causes.
- Pilot: render-only crash rate 0/247 (0.0%); after primary action 0/247 (0.0%); added runtime 2.7 ms/probed command.
- Pilot cleanup left `.cache` at 132 KiB.
Not done / risks: No action crashes, no-op outcomes, or action timeouts occurred in this pilot; those paths are covered by deterministic classifier tests and remain untriaged by design.
```
