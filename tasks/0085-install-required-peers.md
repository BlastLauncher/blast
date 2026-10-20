---
id: "0085"
title: Lean installs keep required non-runtime peers (regression from 0083)
status: doing
milestone: M5
depends: ["0083"]
---

## Goal

Per-extension installs omit only the peers the runtime supplies
(`@raycast/api`, `react`, `react/*`, `@types/*`). Any other peer that an
installed package needs is installed. `commandcode-ai` bundles again; today
`@ai-sdk/anthropic` cannot resolve `zod/v4` (`compat/SMOKE-DEPS.md`). The
lean size win from 0083 stays.

## Context

- `packages/host/src/install-dependencies.ts` runs
  `npm install --omit=dev --omit=peer --ignore-scripts …` after stripping
  supplied packages from the manifest and lockfile (v1–v3). Before 0083, npm
  auto-installed all peers, which reintroduced `@raycast/api` and its
  toolchain (about 50 MB).
- Root cause: `--omit=peer` also drops peers that are not runtime-supplied.
  `@ai-sdk/*` peers on `zod` (`^3.25 || ^4`); the extension does not list
  `zod` itself, and the shared-deps `zod` 3.x lacks `zod/v4`.
- Expected approach (pick with evidence, keep deterministic):
  - after the install, walk the installed `node_modules` package.json files.
    Collect each `peerDependencies` entry that is not supplied, not marked
    optional in `peerDependenciesMeta`, and not already installed at a
    satisfying version;
  - add those to the copied manifest's `dependencies`. Use the version pinned
    for that name in the extension's original lockfile when present,
    otherwise the peer range, intersected when several packages want it;
  - install again, with at most two passes. Report unresolvable conflicts as
    install warnings, not failures;
  - alternatively, `overrides` mapping supplied packages to a tiny local stub
    package plus normal peer installation. Only use this if it is simpler and
    passes the same tests.
    The install key must include the computed peer additions, so cached
    installs stay correct.
- Tests (injected installer / fake npm, offline):
  - a package with a non-supplied required peer gets it installed;
  - an optional peer is skipped;
  - supplied peers (`@raycast/api`, `react`) are never added;
  - a version comes from the lockfile when present;
  - re-running with an unchanged manifest reuses the install.
- Then re-run the real set: `bun run corpus:smoke-deps`. It is network-allowed
  and explicit. Afterwards delete `.cache/raycast-extensions` and the
  smoke-deps data. Commit the regenerated `compat/SMOKE-DEPS.md`/json, run
  `bun run fmt`, and report the size of the `caschys-blog` install (it should
  stay about 5 MB) and of `commandcode-ai`.

## Acceptance

- [ ] Unit tests above pass.
- [ ] `corpus:smoke-deps` rerun: `commandcode-ai` commands are no longer
      bundle-failed. Totals before → after are in Handoff.
- [ ] `bun run verify` passes; `.cache` is back under 20 MB after cleanup.

## Out of scope

- Fixture argument/preference values for the smoke (separate), bundler
  timeouts.

## Handoff

Filled in by the worker when finishing:

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
