# 0019 — Incremental scene patches and standby runtime pool

Status: accepted 2026-11-26; amends 0001

## Context

Decision 0001 sent full scene snapshots on every commit and spawned a fresh Node
child at launch. Profiling large lists and cold launches showed two critical-path
costs: re-serializing unchanged subtrees per commit, and paying Node, React and
`@raycast/api` startup after launch.

## Decision

1. **Opt-in `scene.patch` on protocol v1** (`packages/protocol/src/messages.ts`).
   `InitMessage` adds optional `scenePatches?: boolean`. Runtimes default to
   full scenes and enable patches only when `init.scenePatches === true`
   (`packages/runtime/src/core.ts`). The Node host opts in
   (`packages/host/src/session.ts`); `packages/web/src/session.ts` does not and
   keeps receiving full `scene` messages.
2. **Ops, revisions, and fallback.** `ScenePatchMessage` sends
   `{ revision, baseRevision, ops }` with ops `props`, `children` (existing IDs
   or inline new `SceneNode`s), `replace` (subtree replacement; valid in
   protocol/applier, not yet emitted by the reconciler), and `root`. The
   reconciler (`packages/runtime/src/reconciler/index.ts`) sends a full `scene`
   when patches are off, on the first commit, or on a root kind
   (`null`/single/`#root`) or root-id change—except transitions to `null` after
   a prior commit, which emit `{ op: "root", root: null }`.
3. **Reconstruction and mismatch.** `createScenePatchApplier`
   (`packages/protocol/src/messages.ts`) resets on `scene`, keeps untouched
   `SceneNode` identities, and throws on missing baseline,
   `baseRevision !== current.revision`, unknown ID, or non-root op on `null`
   root. With no resync message, the host treats apply errors as fatal
   `PROTOCOL_ERROR` and kills the child (`SIGKILL`).
4. **Embedder protocol unchanged.** `session.scenes()` yields full reconstructed
   `SceneMessage`s, so `blast serve` (`packages/serve/src/serve.ts`) still emits
   whole `session.scene`, `session.view`, and `root.view` events under
   `embedder-v1` (`packages/protocol/schema/embedder-v1.schema.json`).
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

Negotiated patches avoid O(tree) wire work without bumping `PROTOCOL_VERSION` or
breaking full-scene hosts; one clean standby hides startup without sharing state.

## Consequences

- Stable `SceneNode` identity aids caching; mismatches terminate the session.
- `engine.root()` keeps one idle child until `engine.close()`; custom `env` or
  differing `dataDir`/`inheritEnv` miss it. `blast serve` stays whole-view.
