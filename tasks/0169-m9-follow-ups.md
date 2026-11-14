---
id: "0169"
title: M9 follow-ups (TUI scope, Python errors, web launcher, release web e2e)
status: todo
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

- [ ] Each item has a test or, for 4, a workflow step mirroring site.yml.
- [ ] `bun run example:python` and `bun test packages/tui examples/web-launcher` pass.
- [ ] `bun run verify` passes.

## Out of scope

- Engine or protocol changes; publishing.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
