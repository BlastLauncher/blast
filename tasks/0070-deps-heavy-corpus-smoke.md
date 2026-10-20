---
id: "0070"
title: "Real-world compat: dependency-heavy curated set, run with installed dependencies"
status: review
milestone: M5
depends: []
---

## Goal

We know how Blast does on real extensions that need packages beyond the shared
allowlist. A new curated set of extensions with their own dependencies is
installed via the engine's dependency install (decision 0008), launched
headlessly, and reported in `compat/SMOKE-DEPS.md` + `compat/smoke-deps.json`
with failure categories. That shows what to fix next.

## Context

- Existing tooling:
  - `scripts/corpus/` (`select.ts`/`selection.ts`, `fetch.ts`/`batch.ts`,
    `smoke-run.ts`/`smoke.ts`);
  - reports in `compat/SMOKE.md`;
  - dependency analysis in `compat/dependencies.json` /
    `compat/DEPENDENCIES.md` (which extensions need unprovided packages).
    The current smoke uses `installedDependencies: false`.
- Selection: add a `deps` stratum or a separate selector. Pick about 25
  extensions that:
  - declare at least one dependency outside the shared allowlist;
  - have a `package-lock.json`;
  - have no native addons or install scripts that matter (npm runs with
    `--ignore-scripts`);
  - spread across the most-imported unprovided packages in
    `dependencies.json`;
  - prefer view commands that render offline.
    Write the selection to `compat/corpus.json` (or a sibling `corpus-deps.json`)
    deterministically, same style as the existing selection.
- Runner: `bun run corpus:smoke-deps`, a new script reusing `smoke.ts`
  helpers. Per extension:
  1. fetch it (sparse, shallow, into `.cache/`, as now);
  2. `openExtension({ extensionDir, dataDir: <.cache/smoke-deps-data> })`
     → `dependencies.install()` with a timeout, recording install time, size
     and errors;
  3. bundle and launch each command as the existing smoke does, with
     `installedDependencies` on (the default), the CLI headless handlers and
     the shared-deps fallback present;
  4. **delete that extension's install directory afterwards**, and keep a
     running disk check with the existing budget guard (`maxMbFromEnv`), so
     peak disk stays bounded.
     Network is allowed only in this explicit script, never in `bun test`.
- Report categories: install-failed (and why: lockfile, engine, peer,
  network), bundle-failed (missing dep / esbuild error), rendered, completed,
  crashed (error excerpt), needs-arguments, needs-preferences,
  capability-denied, timeout. Add a short "Top failures" section naming the
  likely Blast-side fixes.
- Unit tests for any new selection and report logic, offline with fixture
  data, as the existing corpus tests do.
- Do not fix Blast product bugs in this task. Record them in the report
  and in Handoff as candidate follow-up tasks.

## Acceptance

- [ ] `bun run corpus:select` (or the new selector) produces the deps set
      deterministically; unit tests cover the selection rules.
- [ ] `bun run corpus:smoke-deps` ran once; `compat/SMOKE-DEPS.md` and
      `compat/smoke-deps.json` are committed. Handoff lists totals per
      category, peak disk and wall time.
- [ ] `.cache/` stays under the budget afterwards; Handoff includes
      `du -sh .cache` before/after.
- [ ] `bun run verify` passes (the reports must not break `compat:check`; if
      compat:check validates report files, extend it accordingly).

## Out of scope

- Fixing failures found (separate tasks), changing install semantics.

## Handoff

```
Branch/commit: t3/deps-heavy-corpus-smoke @ 54d340d (code; the Handoff text is the commit after it)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, workflow ok, test ok) in 93.9s
Done:
- `bun run corpus:select-deps` (`select-deps.ts`, pure rules in `deps-selection.ts` + tests) writes
  `compat/corpus-deps.json`: 25 extensions, deterministic (two runs, same md5). Rules: >=1 registry dep
  outside the shared allowlist (<=6), lockfile, view command, no native packages, no child_process /
  AppleScript / fs-write sources, lockfile <= 300 KB; filed under the most-imported unprovided package
  (from `compat/dependencies.json`), round-robin over packages, offline before network.
- `bun run corpus:smoke-deps` (`smoke-deps-run.ts`, pure logic in `smoke-deps.ts` + tests): per extension
  fetch -> `openExtension().dependencies.install()` under a 180 s timeout (npm cache kept under `.cache`,
  disk watchdog on `maxMbFromEnv`) -> bundle with installed deps -> launch -> delete install. Reports
  `compat/smoke-deps.json` + `compat/SMOKE-DEPS.md` (installs, top failures, per-command table).
- The shared per-command step moved from `smoke-run.ts` to `smoke-command.ts` (behaviour unchanged;
  `corpus:smoke` still allowlist-only). Decision 0008 item 6 notes the one exception.
- Run results (one run): 25/25 installs ok. 56 commands: rendered 35, bundle-failed 5, needs-arguments 6,
  needs-preferences 9, capability-denied 1; install-failed/crashed/timeout/network/unsupported-api 0.
  Peak `.cache` 466.4 MB (oci-sdk install 254 MB; budget 600), wall time 150 s (installs 0.6-22.8 s).
- `du -sh .cache`: before 0 (absent), after 159M (manifest-only checkout; `.git` keeps fetched blobs,
  same as `corpus:smoke`). Per-extension installs, the data dir and the npm cache were deleted each time.
Not done / risks:
- Candidate follow-ups (not fixed here): (1) bundler ignores tsconfig `baseUrl`/`paths`: `control-d`
  imports `common/...` from its own root (5 commands, bundle-failed "missing common"); (2) `open.url`
  has no headless default (`caschys-blog/open-website`, capability-denied); (3) 15 of 56 commands are not
  run (6 required arguments, 9 required preferences without defaults, 4 of them `youtube` / 4 `featurebase`):
  a fixture-values option for the smoke would turn them into signal.
- Positive result worth knowing: `oci` (254 MB) and `monorepo-manager` (`@yarnpkg/core`) bundle and render,
  but bundling takes tens of seconds each; no timeout covers bundling.
- `execa`, `open` and `got` packages pass the source exclusions (they hide `child_process`), so those
  extensions run but cannot exercise process spawning offline.
- The committed `.md` is formatter-padded (`bun run fmt` after regenerating), like `SMOKE.md`.
- No new dependencies. Network was used only by the explicit scripts, never `bun test`.
```
