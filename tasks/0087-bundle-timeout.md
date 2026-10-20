---
id: "0087"
title: Bundling has a time limit and reports its duration
status: review
milestone: M5
depends: []
---

## Goal

A pathological extension can no longer hang the engine during bundling.
`bundleCommand` (and therefore `extension.launch`, `blast run`, `blast serve`
and the TUI) fails with a typed, clear error after a configurable limit, and
reports how long bundling took. The corpus smokes record bundle time and a
`bundle-timeout` outcome.

## Context

- `packages/host/src/bundle.ts` (`bundleCommand` → `bundleEntry`, esbuild
  `build` with plugins). `oci` and `monorepo-manager` take tens of seconds
  (`compat/SMOKE-DEPS.md`).
- Add `BundleOptions.timeoutMs` (default 60_000; `0` disables), with an
  `AbortSignal` option as well. esbuild's `build` cannot be aborted
  mid-flight, so use `esbuild.context()` + `rebuild()` + `dispose()`. That
  way a timeout disposes the context and actually stops the work. Check that
  `cancel()` on the context exists in the pinned esbuild (0.28.2) and use it
  if so. Throw `BundleTimeoutError` (exported, `code: "BUNDLE_TIMEOUT"`, with
  `extension`, `command` and `timeoutMs`).
- Return `bundleMs` on `BundledCommand`. Thread `timeoutMs` through
  `openExtension(...).launch` options and `createEngine` defaults. `blast run`
  gets `--bundle-timeout <ms>`, and `blast serve` a launch param
  `bundleTimeoutMs?`. Update the protocol validator and schema, regenerated
  via `bun run protocol:schema`.
- Corpus: `scripts/corpus/smoke-command.ts` records `bundleMs` per command
  and maps `BundleTimeoutError` to a `bundle-timeout` outcome (smoke.ts,
  smoke-deps.ts report tables). Task 0086 runs in parallel and edits the
  launch-value call site in `smoke-command.ts`; keep your edits there minimal
  and separate.
- Tests:
  - a fixture whose esbuild plugin (inject via an existing test hook, or a
    fixture with a huge generated import graph) exceeds a tiny `timeoutMs`
    gets `BundleTimeoutError`, and the process does not hang (assert it
    settles quickly);
  - `bundleMs` is present;
  - CLI flag parsing;
  - the serve launch param is validated.
- Docs: one line each in `docs/architecture.md` (Host sessions) and
  `docs/cli.md`.

## Acceptance

- [x] Tests above pass deterministically, with no real 60 s waits.
- [x] `bun run protocol:check` is clean.
- [x] `bun run verify` passes.

## Out of scope

- Making bundling faster, caching bundles.

## Handoff

Branch/commit: t3/bundle-timeout @ 9b17b41 (implementation; handoff commit follows)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, workflow ok, test ok) in 100.1s
Done:

- Added a 60,000 ms default bundling deadline (0 disables), AbortSignal support,
  typed BundleTimeoutError and bundleMs; esbuild contexts cancel and dispose.
- Threaded deadlines through engine/extension defaults and launch options,
  --bundle-timeout, and serve bundleTimeoutMs with typed wire errors.
- Regenerated the protocol schema; smoke JSON/markdown record bundle duration
  and distinguish bundle-timeout from scene timeouts, including gated deps runs.
- Added generated-graph cancellation, abort, timing, option inheritance, CLI,
  serve recovery, schema and report tests (761 tests pass); updated docs.
  Not done / risks:
- Full network corpus smokes were not rerun; existing committed reports remain
  historical snapshots. No new dependencies.
- Task 0086 launch-value call sites were left unchanged. Minimal session option
  typing and TUI outcome exhaustiveness updates were required by the new fields.
