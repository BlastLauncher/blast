---
id: "0087"
title: Bundling has a time limit and reports its duration
status: doing
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

- [ ] Tests above pass deterministically, with no real 60 s waits.
- [ ] `bun run protocol:check` is clean.
- [ ] `bun run verify` passes.

## Out of scope

- Making bundling faster, caching bundles.

## Handoff

Filled in by the worker when finishing:

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
