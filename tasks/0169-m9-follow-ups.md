---
id: "0169"
title: M9 follow-ups (TUI scope, Python errors, web launcher, release web e2e)
status: doing
milestone: M9
depends: []
---

## Goal

Close the four small M9 follow-ups listed in PLAN.md "Later".

## Context

1. TUI `preferences.open` with `scope: "command"` opens the extension scope.
   `packages/tui/src/launcher.tsx` validates `params.scope`, then sends the
   root's Configure shortcut, which uses the root's `configureScope`
   ("extension"). Carry the requested scope through (e.g. call the launch hook
   with `configure: true, scope` for the current command) so `command` shows
   only command preferences. Test it in `launcher.test.tsx`.
2. `examples/python-embedder/embedder.py` only prints a protocol `error`.
   `docs/embedding.md` says clients fail every outstanding request on one
   (the Go example does). Make `Client` do that (pending requests raise),
   keep the file ≤ 200 lines, and test it in `test_embedder.py` (for example
   send a `session.input` search without `text`, which the server rejects
   with a protocol `error`). Update the docs line that names only Go.
3. `examples/web-launcher`: the `/launch` endpoint and the `command` option
   are ignored since 0165 (they reopen the root). Remove both, their tests
   and README mentions.
4. `.github/workflows/prerelease.yml`: run `bun run release:web:e2e` in the
   build job after `release:smoke`. It needs Playwright Chromium: install it
   in the job the same way `.github/workflows/site.yml` does (reuse its
   step and cache key). Do not run it in verify.

## Acceptance

- [x] Each item has a test or, for 4, a workflow step mirroring site.yml.
- [x] `bun run example:python` and `bun test packages/tui examples/web-launcher` pass.
- [x] `bun run verify` passes.

## Out of scope

- Engine or protocol changes; publishing.

## Handoff

```
Branch/commit: t3/3344697f @ 0a791c8 (code; this Handoff commit follows)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 124.9s
Done:
- TUI: preferences.open's scope reaches the root's Configure launch, so
  openCommandPreferences shows only command preferences (launcher.test.tsx
  covers both scopes; the older Ctrl-E test asserted the extension scope and
  now expects the command one).
- Python embedder: a protocol `error` fails every outstanding request
  (request raises); test_embedder.py sends a search without `text`;
  embedder.py stays 199 lines; docs/embedding.md names Go and Python.
- web-launcher: removed /launch, the `command` option/CLI arg, their tests
  and README mentions.
- prerelease.yml: Chromium install (site.yml's step and
  PLAYWRIGHT_BROWSERS_PATH) and `release:web:e2e` after `release:smoke`.
Not done / risks:
- `release:web:e2e` was not run locally (needs release:build plus a Chromium
  download). The build job moved to ubuntu-24.04 (timeout 20 -> 30 min),
  because site.yml notes Playwright 1.58 --with-deps fails on ubuntu-latest.
- web-launcher no longer reads the manifest at startup, so an extension with
  no commands now opens an empty root instead of throwing.
```
