---
id: "0194"
title: Embedder protocol 2 — view patches from blast serve
status: doing
milestone: M17
depends: []
---

## Goal

`blast serve` speaks embedder protocol 2 as specified in
`docs/decisions/0020-embedder-protocol-v2.md`: one full view, then small
`*.view.patch` events with strict revisions, resync on request, and scenes
only on request. `bun run bench` shows the bytes per update with patches.

Shares one PR with task 0196 (native examples adopt protocol 2): protocol 1
is removed, so CI's go/python/macos example jobs stay red until 0196 lands on
the same branch. That is expected; do not touch `examples/` here except for
TypeScript docs copy listed below.

## Context

- Read decision 0020 first; it is the spec. If it is wrong or ambiguous,
  stop and say so in Handoff rather than inventing semantics.
- Protocol: `packages/protocol/src/embedder.ts` (`EMBEDDER_PROTOCOL_VERSION`,
  message types, parser), `packages/protocol/src/embedder-schema.ts` and the
  generated `packages/protocol/schema/embedder-v1.schema.json`
  (`scripts/protocol/generate-schema.ts`, `scripts/protocol/schema.ts`; also
  referenced in `.github/workflows/prerelease.yml`). Rename to `embedder-v2`
  everywhere; regenerate, never hand-edit the JSON.
- Diff and apply live in `@blastlauncher/protocol` (new module, exported):
  `diffView(prev, next): ViewPatchOp[]` and `applyViewPatch(view, patch)`,
  pure, JSON-only, no client-core import (protocol must stay dependency-free).
- Serve: `packages/serve/src/serve.ts` emits `root.view` / `session.view`
  today on every update (lines around `root.subscribe`, `session.view`,
  `session.scenes`). Keep the last sent view per root/session, emit patches,
  handle `root.resync` / `session.resync`, and send `session.scene` only when
  the hello had `scenes: true`.
- Bench: `scripts/bench/` group 3 measures whole-view bytes; add the patch
  bytes for the same updates (use the real `diffView`), and update the
  baseline table in `docs/performance.md`.
- Docs: `docs/embedding.md` (protocol walkthrough, hello example with
  `"protocol":1`), the protocol snippet in `examples/browser-demo/landing.ts`
  (lines ~40–80), `docs/decisions/0019-…` line that says embedders get whole
  views (point it to 0020).

## Acceptance

- [x] `EMBEDDER_PROTOCOL_VERSION` is 2; a `hello` with protocol 1 gets the
      existing version-mismatch error (test).
- [x] Unit tests for `diffView`/`applyViewPatch`: for each bench case (1k/10k
      one-row edit, selection move, search filter) and for random-free
      hand-written cases covering `set`, `delete`, `splice`, nested objects,
      `null`↔object, and arrays of objects:
      `applyViewPatch(prev, {ops: diffView(prev, next)})` deep-equals `next`.
- [x] `applyViewPatch` throws on `baseRevision` mismatch and on a path that
      does not exist (tests).
- [x] Serve tests (in-process, existing `packages/serve` test style): first
      view is full with `revision: 1`; next update is a patch with
      `revision: 2, baseRevision: 1`; `session.resync` yields a full view with
      the next revision; no `session.scene` unless `hello.scenes` is true;
      an update that changes nothing sends nothing.
- [x] `schema/embedder-v2.schema.json` validates every new event and request
      (extend `embedder-schema.test.ts`); no `embedder-v1` references remain
      outside git history (`git grep embedder-v1` is empty).
- [x] `bun run bench --samples 3`: 10,000-item selection move and one-row
      edit patches are each < 2 KiB; numbers recorded in `docs/performance.md`.
- [x] `bun run verify` passes. (CI example jobs may fail until 0196; note it.)

## Out of scope

- Swift, Go and Python examples (task 0196).
- Runtime → host `scene.patch` changes (task 0197).
- Changing `ControllerView` itself, client-core, TUI or `@blastlauncher/web`.
- Editing `PLAN.md`, `AGENTS.md`, decision 0020 or other task files.

## Handoff

Filled in by the worker when finishing:

```
Branch/commit: t3/embedder-protocol-v2 @ e7965e5bd673736e59bd3b93d04f13eb5b80c20d
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 109.1s
Done:
- Bumped `EMBEDDER_PROTOCOL_VERSION` to 2 in `packages/protocol/src/embedder.ts`, added `hello.scenes`, `root.resync`, `session.resync`, and regenerated `packages/protocol/schema/embedder-v2.schema.json` (removing `embedder-v1.schema.json` and updating schema scripts and `.github/workflows/prerelease.yml`).
- Added pure, dependency-free `diffView` / `applyViewPatch` in `packages/protocol/src/view-patch.ts` (exported from `@blastlauncher/protocol`) with unit tests in `view-patch.test.ts` and schema validation tests in `embedder-schema.test.ts`.
- Updated `packages/serve/src/serve.ts` to track per-root/per-session view streams (initial full `*.view` at revision 1, incremental `*.view.patch` with strict `revision`/`baseRevision`, no-op suppression without consuming revisions, `root.resync`/`session.resync`, and opt-in `session.scene` only when `hello.scenes === true`), along with `packages/serve/src/main.test.ts`, `packages/cli/src/cli.test.ts`, `scripts/mac-fixtures.ts`, and `scripts/release/smoke-program.mjs`.
- Extended `scripts/bench/helpers.ts` group 3 to measure protocol 2 `session.view.patch` bytes with `diffView`/`applyViewPatch` (10k one-item edit: 364 B, 10k selection move: 723 B; both < 2 KiB) and recorded the numbers in `docs/performance.md`.
- Updated protocol 2 docs in `docs/embedding.md`, `docs/decisions/0019-scene-patches-and-runtime-pool.md`, `docs/quickstart.md`, `docs/root-view.md`, `docs/launch-prompts.md`, and `examples/browser-demo/landing.ts`.
Not done / risks:
- No new dependencies added.
- Native examples (`examples/go-embedder`, `examples/python-embedder`, `examples/macos-launcher`) are intentionally untouched per out-of-scope (task 0196 shares this PR); CI's go/python/macos example jobs will remain red until 0196 lands, and `examples/go-embedder/main.go:13` still has one comment mentioning `embedder-v1.schema.json` (the only remaining `git grep embedder-v1` hit outside this task file).
- `docs/architecture.md` was left untouched to avoid merge conflicts with parallel task 0197.
```
