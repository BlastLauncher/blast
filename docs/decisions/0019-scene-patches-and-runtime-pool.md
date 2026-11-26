# 0019 — Incremental scene patches and standby runtime pool

Status: accepted 2026-11-26; amends 0001

## Context

Decision 0001 sent full scene snapshots on every commit and spawned a fresh Node
child at launch. PR #109 targeted two critical-path costs of that model:
re-serializing unchanged subtrees per commit, and paying Node, React and
`@raycast/api` startup after launch.

## Decision

1. **Always-on `scene.patch` on protocol v1** (`packages/protocol/src/messages.ts`).
   Runtimes send one full `scene` on the first commit and `scene.patch` updates
   afterwards (`packages/runtime/src/core.ts`). Both Node
   (`packages/host/src/session.ts`) and browser (`packages/web/src/session.ts`)
   hosts apply patches with `createScenePatchApplier`.
2. **Ops, revisions, and fallback.** `ScenePatchMessage` sends
   `{ revision, baseRevision, ops }` with ops `props`, `children` (existing IDs
   or inline new `SceneNode`s), `replace` (subtree replacement; valid in
   protocol/applier, not yet emitted by the reconciler), and `root`. The
   reconciler (`packages/runtime/src/reconciler/index.ts`) sends a full `scene`
   on the first commit or on a root kind (`null`/single/`#root`) or root-id
   change—except transitions to `null` after a prior commit, which emit
   `{ op: "root", root: null }`.
3. **Reconstruction and mismatch.** `createScenePatchApplier`
   (`packages/protocol/src/messages.ts`) resets on `scene`, keeps untouched
   `SceneNode` identities, and throws on missing baseline,
   `baseRevision !== current.revision`, `revision !== baseRevision + 1`,
   unknown ID, or non-root op on `null` root. With no resync message, both
   hosts treat apply errors as fatal `PROTOCOL_ERROR` and terminate the runtime.
4. **Embedder protocol separate.** `session.scenes()` yields full reconstructed
   `SceneMessage`s; incremental view patches and opt-in scenes for `blast serve`
   are specified separately in decision 0020 (`embedder-v2.schema.json`).
5. **Single-slot standby pool** (`packages/host/src/runtime-pool.ts`).
   `createEngine` (`packages/host/src/engine.ts`) owns one pool, warms it on
   `engine.root()`, shares it with engine-opened extensions
   (`packages/host/src/extension.ts`), and closes it in `engine.close()`
   (standalone `openExtension` uses none). It holds at most one idle `--prewarm`
   child (`@blastlauncher/runtime/api` preloaded in `packages/runtime/src/main.ts`)
   keyed by `(nodePath, sorted env)`. Claimed children are `ref()`'d and never
   reused (preserving 0001 isolation); idle standbys and replenish timers stay
   `unref()`'d. Different `nodePath`/`env` makes `prewarm` `SIGKILL`/replace and
   `acquire` spawn fresh; explicit `StartOptions.env` bypasses the pool; exit or
   error drops the slot.

## Why

Always-on patches avoid O(tree) wire work on Node and web with one scene path;
one clean standby hides startup without sharing state.

## Consequences

- Stable `SceneNode` identity aids caching; mismatches terminate the session.
- `engine.root()` keeps one idle child until `engine.close()`; custom `env` or
  differing `dataDir`/`inheritEnv` miss it. `blast serve` view patches are in 0020.
