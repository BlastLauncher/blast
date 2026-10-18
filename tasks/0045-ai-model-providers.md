---
id: "0045"
title: AI model providers, experimental_decide, refreshModels
status: todo
milestone: M3
depends: ["0043"]
---

## Goal

Extensions that declare an AI model provider entrypoint work: Blast can load
the provider's `getModels`/`streamCompletion` exports, `AI.ask` with
`{ id }` routes to the extension's own provider, `AI.refreshModels` and
`AI.experimental_decide` exist, and all remaining `AI.*` paths are covered.

## Context

- To be specified after 0043 merges: read `AI` in
  `compat/raycast-api/index.d.ts` (namespace at ~437, provider types ~859)
  and the manifest field `ai.modelProvider` in corpus manifests (use
  `compat/raycast-usage.json` and a sparse corpus fetch of 1–2 extensions
  that declare it) before writing the design. Likely needs a short decision
  record (new entrypoint kind in the process model).

## Acceptance

- [ ] To be refined by the orchestrator before `status: doing`.
- [ ] `bun run verify` passes.

## Out of scope

- Calling real hosted models.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
