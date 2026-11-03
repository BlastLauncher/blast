---
id: "0097"
title: Give sweep commands the default embedder storage and OAuth handlers
status: doing
milestone: M6
depends: []
---

## Goal

The corpus sweep measures extensions against what an embedder gets by default,
so `LocalStorage` and OAuth token reads stop showing up as denials.

## Context

0094 sweep: 291 commands are denied `storage.*` and 15 `oauth.tokens.get`.
Embedders compose `createStorageHandlers` and OAuth handlers
(`packages/host/src/client.ts:6-16`), but the sweep uses only
`createHeadlessHandlers()` (`scripts/corpus/smoke-command.ts:374`). Each
command must get isolated, in-memory or scratch-only state that is discarded
after the command. `open.url` (117) stays denied: that is expected headless.

## Acceptance

- [ ] Sweep commands get storage and OAuth handlers whose state lives only in
      per-command scratch or memory, inside the existing sandbox.
- [ ] A test proves two commands cannot see each other's storage, and nothing
      is written outside scratch.
- [ ] The sandbox profile, environment allowlist and bundle confinement are
      unchanged.
- [ ] `bun run verify` passes.

## Out of scope

- Granting `open.url`, clipboard or other side effects; rerunning the sweep.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
