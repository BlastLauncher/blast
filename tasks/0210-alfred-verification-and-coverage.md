---
id: "0210"
title: Real-world Alfred workflow fixes, coverage analyzer, and docs
status: doing
milestone: M21
depends: ["0209"]
---

## Goal

Fix real-world edge cases discovered by running Alfred Gallery workflows live
on Blast (large list capping, debounce loading state, interpreter `PATH`
fallback, host appearance forwarding), add the reusable `alfred:analyze`
compatibility measurement script, and document Alfred support in
`docs/alfred.md`.

## Context

- Follows `docs/decisions/0021-alfred-workflows.md` (point 5: compatibility is
  measured against real workflows, never claimed) and builds on 0205–0209.
- Four concrete issues surfaced when running real Alfred Gallery `.alfredworkflow`
  archives through Blast:
  1. **Large List Filter / client-filtered Script Filter exceeds 8 MiB NDJSON
     line cap** (e.g. a real List Filter with ~30,000 items serialized ~18 MiB
     in one scene message and timed out):
     - In `packages/alfred/src/runtime.ts`, export `MAX_SCENE_ITEMS = 200`.
     - For `listFilterEntry` and `scriptFilterEntry` (when `clientFilter` is
       true) and `gridEntry`: when the item list has more than
       `MAX_SCENE_ITEMS` entries, filter items inside the runtime against
       `query` (case-insensitive multi-word substring match over `title`,
       `subtitle`, and `match`, preferring title prefix/substring matches unless
       `config.fixedorder === true`), slice to `MAX_SCENE_ITEMS`, and set
       `filtering: false` on the scene view so `client-core` forwards search
       updates and renders the capped slice well under the line cap. When the
       list has `<= MAX_SCENE_ITEMS`, keep existing `filtering: true` behavior.
  2. **Debounced Script Filters flash `"No Results"` before their first run**:
     - When `queuedelayimmediatelyinitially` is `false`, `schedule()` starts a
       debounce timer without setting `loading`, so the first scene has
       `isLoading: false` and `items: []`.
     - In `packages/alfred/src/runtime.ts`, treat a pending debounce timer as
       loading (`isLoading: loading || cancelDebounce !== undefined`) so
       clients show a loading state until the script completes.
  3. **Interpreter fallback for missing `/usr/bin/*` binaries & appearance**:
     - Modern macOS removed `/usr/bin/php` (and `/usr/bin/python`), while users
       install them via Homebrew (`/opt/homebrew/bin/php`, `/usr/local/bin/php`,
       or on `PATH`).
     - In `packages/alfred/src/scripts.ts`, when `resolveScriptCommand` picks a
       fixed absolute interpreter path (not external `scriptfile`) that does not
       exist on disk, look up `basename(command)` in `env.PATH` (plus
       `/opt/homebrew/bin` and `/usr/local/bin` on `darwin`) via an injectable
       lookup/existence check (so unit tests stay deterministic and
       OS-independent); fall back to the original path if not found so spawn
       errors still name it clearly.
     - In `packages/alfred/src/runtime.ts`, record `message.environment.appearance`
       from `init` and pass `theme: appearance` into `buildWorkflowEnv` so
       `alfred_theme_background` reflects light vs dark mode.
  4. **Measured compatibility tooling**:
     - Export `SUPPORTED_OBJECT_TYPES` (every `alfred.workflow.*` type
       implemented across `runtime.ts` and `graph.ts`) and
       `PASSIVE_TRIGGER_TYPES` (`hotkey`, `universalaction`, `action`,
       `fallback`, `snippet`, `remote`) from `packages/alfred/src/index.ts`.
     - Create `scripts/alfred/analyze.ts` (`analyzeWorkflowDirectory(dir)` +
       CLI entry supporting `--json`) that recursively scans a directory for
       `.alfredworkflow` files and unpacked workflow directories (`info.plist`),
       parses and validates each manifest through `parseManifest` from
       `@blastlauncher/host`, and reports: total workflows, parse/manifest pass
       count, runnable-entry workflow count, fully-supported workflow count,
       total/supported/passive/unsupported object counts, execution-node
       coverage %, and top unsupported object types.
     - Add `"alfred:analyze": "bun scripts/alfred/analyze.ts"` to root
       `package.json`.
     - Create `scripts/alfred/analyze.test.ts` testing `analyzeWorkflowDirectory`
       against synthetic temporary fixtures (unpacked dir + `.alfredworkflow`
       archive + unsupported node + corrupt archive). Never reference local home
       paths or commit third-party workflows.
- Documentation:
  - Create `docs/alfred.md` (≤ 120 lines): running workflows via `blast run`,
    `blast-tui`, `blast serve`, and `createEngine`; supported object types;
    `userconfigurationconfig` preference mapping; brokered capabilities;
    platform notes; and measuring a local corpus with
    `bun run alfred:analyze <dir>`.
  - Link `docs/alfred.md` from `docs/architecture.md` (keep `docs/architecture.md`
    ≤ 200 lines!).

## Acceptance

- [ ] `packages/alfred/src/runtime.test.ts` covers:
  - A List Filter with > `MAX_SCENE_ITEMS` (e.g. 500 items) caps rendered scene items to `MAX_SCENE_ITEMS` (`filtering: false`) and filters accurately when search text changes.
  - A Script Filter with `queuedelayimmediatelyinitially: false` publishes `isLoading: true` while the initial debounce timer is pending, never flashing `No Results` before running.
  - `init.environment.appearance: "light"` sets the light `alfred_theme_background` value in script env.
- [ ] `packages/alfred/src/scripts.test.ts` tests interpreter `PATH` fallback when `/usr/bin/php` is absent and an executable exists on `PATH`.
- [ ] `scripts/alfred/analyze.test.ts` passes and tests `analyzeWorkflowDirectory` on synthetic unpacked + archived workflows, unsupported nodes, and parse errors.
- [ ] `docs/alfred.md` exists (≤ 120 lines) and is linked from `docs/architecture.md`.
- [ ] `bun run verify` passes (including `check:workflow`).

## Out of scope

- Committing third-party `.alfredworkflow` binaries or plists into the repository.
- Implementing macOS-only Automation Tasks (`alfred.workflow.automation.task`) or File Filters (`alfred.workflow.input.filefilter`).

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
