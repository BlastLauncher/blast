---
id: "0088"
title: Make verify pass on a clean macOS checkout
status: doing
milestone: M6
depends: []
---

## Goal

`bun run verify` passes on a developer Mac using the `mise` Node shim, with no
stray files affecting the result. CI on Linux stays green.

## Context

`verify` passes in CI but fails locally on 904ad72. Diagnosed causes:

1. `packages/serve/src/main.test.ts:18` sets `XDG_DATA_HOME` to a temp dir and
   spawns `node`. `mise` also reads `XDG_DATA_HOME`, so the shim reinstalls Node
   on every spawn and the tests hit Bun's 5 s timeout. With the real Node binary
   on `PATH`, all 9 tests pass. Resolve the real binary once, before the env
   override (for example `node -p process.execPath`), and spawn that. Check for
   the same pattern elsewhere under `packages/` and `scripts/`.
2. `packages/native/src/desktop.test.ts:138` reads `/proc/<pid>/exe`, so it
   fails on macOS. Make it platform-independent by injecting the lookup if that
   is cheap, otherwise `test.skipIf(process.platform !== "linux")`.
3. `scripts/verify.ts:14` runs bare `bun test`, which also collected a stale
   ignored `packages/*/dist/__tests__/*.test.js`. Scope discovery so `dist/` and
   other ignored output are never collected.
4. `oxfmt` (`fmt`, `fmt:check` in `package.json`) only honours the repo's
   `.gitignore` and `.ignore`, so it failed on `.aider.chat.history.md`, which
   only a global git ignore covers. Format and check git-tracked and new
   non-ignored files only, using git's own ignore logic.

## Acceptance

- [ ] `bun run verify` passes when `node` on `PATH` is the `mise` shim.
- [ ] Temporary demonstration, not committed: an unformatted file excluded only
      through `.git/info/exclude` does not fail `fmt:check`.
- [ ] Temporary demonstration, not committed: a throwing
      `packages/host/dist/x.test.js` is not collected by verify's test step.
- [ ] `bun run fmt` still rewrites a badly formatted tracked file.
- [ ] Handoff records the number of tests before and after; no test was removed.

## Out of scope

- Adding a macOS CI job, changing product code, or changing Bun versions.
- Bumping `@raycast/api` or any dependency.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
