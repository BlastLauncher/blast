---
id: "0070"
title: "Real-world compat: dependency-heavy curated set, run with installed dependencies"
status: doing
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

Filled in by the worker when finishing:

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
