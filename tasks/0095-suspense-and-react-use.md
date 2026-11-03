---
id: "0095"
title: Support Suspense and React use() in the runtime reconciler
status: doing
milestone: M6
depends: []
---

## Goal

Commands wrapped in `@raycast/utils` `withAccessToken` (and any component that
suspends on a promise) render instead of failing with "An unknown Component is
an async Client Component".

## Context

0094 sweep: 85 commands fail this way. `withAccessToken` calls
`React.use(authorize())` inside a component (@raycast/utils
`src/oauth/withAccessToken.tsx:125-135`). Blast's root mounts with
`updateContainerSync` and `flushSyncWork` and has no Suspense boundary
(`packages/runtime/src/reconciler/index.ts:199-220`). Raycast supports this
HOC. Example extension: `meeting-room-check` (`src/list-rooms.tsx:387-411`).

## Acceptance

- [ ] A fixture command whose component calls `use(promise)` renders after the
      promise resolves, and shows the Raycast loading state meanwhile.
- [ ] A fixture using the shared `@raycast/utils` `withAccessToken` with a
      stubbed OAuth handler renders.
- [ ] A rejected promise surfaces as the command's error, not a crash of the
      host.
- [ ] `@covers` tags where an API path is exercised; `bun run verify` passes.

## Out of scope

- Rerunning the corpus sweep (the orchestrator does that).

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
