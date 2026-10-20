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

- [x] Unit tests above pass.
- [x] `corpus:smoke-deps` rerun: `commandcode-ai` commands are no longer
      bundle-failed. Totals before → after are in Handoff.
- [x] `bun run verify` passes; `.cache` is back under 20 MB after cleanup.

## Out of scope

- Fixture argument/preference values for the smoke (separate), bundler
  timeouts.

## Handoff

```
Branch/commit: t3/install-required-peers @ 7fd42a5a00c426de7388ba38b639b1703b6cd1d5 (implementation; Handoff follows)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, workflow ok, test ok) in 118.8s
Done:
- Added two bounded required-peer repair passes, compatible v1-v3 lock pins, range intersections, optional/supplied-peer exclusion, conflict warnings and peer additions in cache keys.
- Added offline tests covering required, optional, supplied, satisfied/nested and conflicting peers, pins, cache reuse, failed repairs and the pass limit; 17 focused tests pass, 752 total tests pass.
- Regenerated smoke reports: 25/25 installs; rendered 33 -> 35, bundle-failed 2 -> 0; both commandcode-ai commands render. Other totals unchanged: completed/install-failed/crashed/network/timeout/unsupported-api/unsupported-mode 0, needs-arguments 6, needs-preferences 14, capability-denied 1.
- Install sizes: caschys-blog 4.7 MiB (4,934,385 bytes), commandcode-ai 22.2 MiB (23,265,885 bytes). Removed corpus checkout and smoke data/cache; .cache is empty (4 KiB directory allocation).
- Pinned semver 7.8.5 for correct npm range satisfaction/intersection and @types/semver 7.8.0 for typechecking; both latest versions checked with npm view. Updated install docs.
Not done / risks: No task acceptance skipped. Unresolvable peers warn and remain unavailable after two repair passes; declared direct dependencies are preserved. No push; independent review remains the orchestrator's step.
```
