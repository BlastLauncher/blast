---
id: "0197"
title: Runtime scene patches always on, including the browser host
status: doing
milestone: M17
depends: []
---

## Goal

There is one runtime → host scene path: a full `scene` first, then
`scene.patch`. The `scenePatches` opt-in flag is gone, the browser host
(`@blastlauncher/web`) applies patches like the Node host, and the applier
rejects any revision that does not advance by exactly one.

## Context

- Decision `docs/decisions/0019-scene-patches-and-runtime-pool.md` describes
  today's opt-in. There are no external users, so the flag is removed, not
  deprecated. Update 0019's Decision points 1–3 in place (it is the current
  record of this choice) and keep it ≤ 60 lines.
- Flag sites: `InitMessage.scenePatches` and its parser in
  `packages/protocol/src/messages.ts`; `scenePatches: true` in
  `packages/host/src/session.ts` (init); `root.setPatchMode(...)` in
  `packages/runtime/src/core.ts`; the reconciler's patch-mode switch in
  `packages/runtime/src/reconciler/index.ts`. Tests in
  `packages/protocol/src/messages.test.ts` and the reconciler tests.
- Browser host: `packages/web/src/session.ts` handles `message.type ===
  "scene"` (~line 482) and sends `init` (~line 542). Use
  `createScenePatchApplier` from `@blastlauncher/protocol` the same way
  `packages/host/src/session.ts` does (~lines 243–250), including the fatal
  `PROTOCOL_ERROR` behaviour on apply errors.
- Revision rule: `createScenePatchApplier().apply()` checks
  `baseRevision === current.revision` but not `revision === baseRevision + 1`.
  Enforce it (the reconciler already increments by one; confirm in code).
- Keep the full-`scene` cases the reconciler has today (first commit, root
  kind or root id change); only the opt-out disappears.
- Browser e2e for `packages/web` runs in `bun run verify` only if it already
  does; do not add network or real-browser steps to `bun test`.

## Acceptance

- [ ] `git grep -n scenePatches` and `git grep -n setPatchMode` are empty.
- [ ] Tests: the runtime sends `scene.patch` after the first commit with no
      opt-in; the web session reconstructs the same scene as the Node host
      for a multi-commit fixture (deep-equal to the reconciler's full scene).
- [ ] Test: a patch with `revision !== baseRevision + 1` is rejected and the
      session ends with `PROTOCOL_ERROR` (Node host); same for the web host.
- [ ] Decision 0019 no longer mentions an opt-in; `docs/architecture.md`
      no longer mentions `scenePatches` and stays ≤ 200 lines.
- [ ] `bun run verify` passes.

## Out of scope

- The embedder protocol (`blast serve`, task 0194) and examples (0196).
- New patch op kinds (the unused `replace` op stays as is).
- Editing `PLAN.md`, `AGENTS.md` or other task files.

## Handoff

Filled in by the worker when finishing:

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
