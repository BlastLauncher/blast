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

- [x] Sweep commands get storage and OAuth handlers whose state lives only in
      per-command scratch or memory, inside the existing sandbox.
- [x] A test proves two commands cannot see each other's storage, and nothing
      is written outside scratch.
- [x] The sandbox profile, environment allowlist and bundle confinement are
      unchanged.
- [x] `bun run verify` passes.

## Out of scope

- Granting `open.url`, clipboard or other side effects; rerunning the sweep.

## Handoff

```
Branch/commit: t3/sweep-broker-parity-1 @ 45fc5c8
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, workflow ok, test ok) in 53.6s
Done:
- Added `createSweepBroker`: `createSessionBroker` with the headless read-only handlers plus the storage and OAuth handlers an embedder gets by default (`packages/host/src/client.ts`).
- Its data directory is `<command scratch>/host-data`, which `launchOne` deletes after each command, so state is per-command and never reaches the real host data directory.
- `open.url`, `clipboard.copy/paste/clear` stay denied; headless reads, including `clipboard.read`, still answer.
- Tests: two commands of one extension cannot see each other's storage or OAuth tokens; handler writes stay under scratch (and the default data directory is untouched); an empty OAuth store reads as `undefined` through `OAuth.PKCEClient.getTokens`.
Not done / risks: `git merge --ff-only t3/sweep-broker-parity` was impossible (main had advanced past its base), so the round-1 wip was folded into 45fc5c8. `scripts/corpus/sandbox.ts`, the environment allowlist, bundle confinement and `packages/runtime/src/reconciler/` are untouched. The sweep itself was not rerun (out of scope), so the denied-capability counts in the next sweep report are still unmeasured.
```
