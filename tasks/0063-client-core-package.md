---
id: "0063"
title: Extract framework-free client behaviour into packages/client-core
status: doing
milestone: M5
depends: []
---

## Goal

Raycast client semantics that every embedder needs live in a new
`@blastlauncher/client-core` package with no UI framework, no Node APIs and no
host dependency. `packages/tui` imports them from there.

## Context

- Decision `docs/decisions/0009` (point 4). Read it first.
- Move these pure modules from `packages/tui/src/` to `packages/client-core/src/`
  together with their tests:
  - `nodes.ts` (text, slot, handler refs, events, `matchesQuery`, pagination);
  - `view.ts` (`sceneToView`, `actionRows`, shortcut label and match,
    `detailText`);
  - `grid.ts`;
  - `dropdown.ts`;
  - `form-view.ts`.
    Keep their function names and behaviour.
- Also extract logic that is currently inline in `packages/tui/src/app.tsx`
  into pure, tested functions in client-core. Keep the timers in the TUI; the
  core decides _what_ and _when_, as data:
  - the pagination trigger (when to send `onLoadMore`, once per item-count
    change; see around `app.tsx` "onLoadMore");
  - the search throttle rule (200 ms when `throttle` is set);
  - the HUD display duration constant (2.5 s).
- `matchesShortcut` takes a terminal key shape today. Keep the same
  signature, but name the parameter type neutrally (`KeyInput`) and export it.
- Package rules (AGENTS.md "Code conventions"):
  - `packages/client-core/package.json` named `@blastlauncher/client-core`,
    private, ESM, `exports` mapping `"."` to `./src/index.ts`;
  - it depends only on `@blastlauncher/protocol` (`workspace:*`);
  - it must run on Node 24 and in a browser bundle: no `node:` imports, no
    React, no `@opentui/*`, no `@blastlauncher/host`.
- Update `docs/architecture.md` Packages table (one row) and the diagram line.
- Do NOT touch `packages/tui/src/picker.ts`, `picker.tsx` or `session.ts`.
  Task 0064 owns them and runs in parallel. Move `@covers` tags with the tests
  they belong to, then run `bun run compat:report` and commit `compat/`.

## Acceptance

- [ ] `packages/client-core/src/` holds the moved modules plus the new
      pagination/throttle/HUD helpers, each with `*.test.ts` next to it.
- [ ] `rg -n "from \"node:|@opentui|react|@blastlauncher/host" packages/client-core/src`
      prints nothing.
- [ ] `packages/tui/src/{nodes,view,grid,dropdown,form-view}.ts` no longer
      exist. The TUI imports from `@blastlauncher/client-core`, and all TUI
      tests still pass unchanged apart from import paths.
- [ ] `bun run compat:report` leaves no diff after commit; coverage numbers
      are unchanged or better.
- [ ] `bun run verify` passes.

## Out of scope

- Closing coverage partials (0065), engine API (0064), `blast serve` (0066).
- Any visual or behaviour change in the TUI.

## Handoff

Filled in by the worker when finishing:

```
Branch/commit: t3/client-core-package @ (this commit)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok) — 581 tests, 85 files
Done:
- New `@blastlauncher/client-core` (deps: only `@blastlauncher/protocol`; exports `.` → `./src/index.ts`): moved `nodes.ts`, `view.ts`, `grid.ts`, `dropdown.ts`, `form-view.ts` verbatim with their tests, plus new tested helpers — `loadMoreRequest` (pagination.ts), `searchDispatch` + `SEARCH_THROTTLE_MS` (search.ts), `HUD_DURATION_MS` (hud.ts) — and a pure `nodes.test.ts` / `dropdown.test.ts` that did not exist before.
- `matchesShortcut` keeps its signature; its key parameter type is now exported as `KeyInput`.
- TUI imports the moved modules from `@blastlauncher/client-core`; `packages/tui/src/{nodes,view,grid,dropdown,form-view}.ts` and their tests are gone; Timers stay in `app.tsx` (core returns event + delay as data). Only import paths changed in TUI tests; `picker.*`/`session.*` untouched.
- `docs/architecture.md`: client-core table row and diagram line; `bun.lock` regenerated for the new workspace dep.
Not done / risks:
- `@covers` tags did not move: the pagination tags belong to `pagination.test.tsx` (a TUI integration test that stays and still passes), and the moved test files carried none. Coverage unchanged at 2151/2473; `compat:report` clean. Re-pointing client-owned partial evidence to client-core is 0065.
- `matchesQuery` documents that the query arrives lowercased (pre-existing contract, now explicit for embedders); no behaviour change.
```
