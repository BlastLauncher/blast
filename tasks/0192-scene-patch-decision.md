---
id: "0192"
title: Record scene patches and the runtime pool in a decision and the architecture doc
status: doing
milestone: M17
depends: []
---

## Goal

The docs describe the runtime ↔ host protocol as it now is: incremental
`scene.patch` updates negotiated at `init`, and a pre-warmed standby runtime
pool. A new decision record explains why, and nothing in `docs/` still says
patches do not exist.

## Context

- PR #109 (`04eb4793`, "perf: optimize startup, runtime pool, scene patches…")
  changed the wire protocol without a decision record. Read its diff first.
- Patches: `ScenePatchOp` / `ScenePatchMessage` and `createScenePatchApplier`
  in `packages/protocol/src/messages.ts`; opt-in flag `InitMessage.scenePatches`;
  the host opts in at `packages/host/src/session.ts` (`scenePatches: true`);
  the runtime switches with `root.setPatchMode` in `packages/runtime/src/core.ts`
  and builds ops in `packages/runtime/src/reconciler/index.ts`. Check whether
  `packages/web` (browser runtime) opts in, and say which hosts do.
- Pool: `packages/host/src/runtime-pool.ts` keeps one idle, pre-booted child
  per spawn spec and never reuses a child, so decision 0001's "fresh dedicated
  child per command" still holds. Confirm that from the code, including what
  happens when env or node path differ, and on exit/error.
- `docs/decisions/0001-process-and-scene-model.md` says "measure before
  introducing patches" (Consequences). Do not rewrite history: leave 0001's
  decision intact and add a one-line pointer to the new record where it is now
  inaccurate.
- New record: `docs/decisions/0019-scene-patches-and-runtime-pool.md`, ≤ 60
  lines, same shape as the other records (Context / Decision / Why /
  Consequences). Cover: patch op set and revision/baseRevision semantics,
  fallback to full scenes (when the runtime still sends `scene`), what a
  client must do on a revision mismatch, that `blast serve` embedders still
  receive whole views (the embedder protocol is unchanged), and the pool's
  lifetime and isolation rules.
- `docs/architecture.md` (≤ 200 lines; currently ~199) must mention both
  without growing past the limit: tighten other text if needed.
- The PLAN.md decision-log line is added by the orchestrator, not you.

## Acceptance

- [ ] `docs/decisions/0019-scene-patches-and-runtime-pool.md` exists, ≤ 60
      lines, and every claim in it matches the code (cite file paths, not code).
- [ ] `grep -n "patch" docs/architecture.md` shows the patch flow and
      `grep -n -i "pool" docs/architecture.md` shows the standby pool.
- [ ] `docs/decisions/0001-process-and-scene-model.md` points to 0019 where
      it mentions patches; its decision text is otherwise unchanged.
- [ ] If the docs reveal a code/doc mismatch you cannot document honestly
      (e.g. a missing revision check), write it under "Not done / risks"
      instead of changing code.
- [ ] `bun run verify` passes (includes `check:workflow` size limits).

## Out of scope

- Any code change in `packages/`.
- Embedder-protocol patches for `blast serve` (that is task 0194).
- Editing `PLAN.md`, `AGENTS.md` or other task files.

## Handoff

Filled in by the worker when finishing:

```
Branch/commit: t3/implement-scene-patch-decision @ 1bcfb9f5f0c67988e5d3dd6092c3c212e89d5316
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 101.4s
Done:
- Added `docs/decisions/0019-scene-patches-and-runtime-pool.md` (59 lines) documenting opt-in `scene.patch` negotiation, patch ops (`props`, `children`, `replace`, `root`), revision/fallback/mismatch rules, unchanged `blast serve` whole-view/scene embedder protocol, and the single-slot standby runtime pool's lifetime and isolation rules.
- Updated `docs/architecture.md` (189 lines) to describe `scenePatches: true` negotiation, host `scene.patch` reconstruction (`createScenePatchApplier`), and the engine-owned standby runtime pool (`runtime-pool.ts`).
- Added a one-line pointer to `0019-scene-patches-and-runtime-pool.md` in `docs/decisions/0001-process-and-scene-model.md` Consequences without changing 0001's decision text.
Not done / risks:
- `createScenePatchApplier().apply()` in `packages/protocol/src/messages.ts` checks `baseRevision === current.revision` (plus baseline existence, node IDs, and non-null root) but does not assert `revision > baseRevision`; the reconciler always increments by 1, and `0019` documents only the enforced checks.
- `ScenePatchOp` defines `{ op: "replace", id, node }` (validated and applied in `packages/protocol/src/messages.ts`), though `packages/runtime/src/reconciler/index.ts` does not emit `replace` ops yet; documented as such.
- `packages/host/src/runtime-pool.ts` holds at most one standby child total (not one per spawn spec simultaneously), replacing it on spec changes; documented accurately in `0019`.
- `PLAN.md` decision log left untouched per task instructions (orchestrator-owned).
```
