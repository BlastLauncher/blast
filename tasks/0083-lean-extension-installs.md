---
id: "0083"
title: Lean per-extension dependency installs (no peer @raycast/api or React pulled in)
status: doing
milestone: M5
depends: []
---

## Goal

An extension whose only extra dependency is small installs only that package
and its real dependencies. Today `compat/SMOKE-DEPS.md` shows 40–70 MB
installs for single small packages (`xml2js` 51 MB, `marked` 43 MB,
`js-yaml` 41 MB). Find out exactly what is being installed, then stop
installing what the runtime already supplies.

## Context

- Install: `packages/host/src/install-dependencies.ts` (decision 0008). It
  strips `@raycast/api`, `react`, `react/*` and `@types/*` from the copied
  `package.json`, and from `lock.dependencies` (the lockfile v1 shape), then
  runs `npm install --omit=dev --ignore-scripts --no-audit --no-fund`.
- Likely causes, to verify rather than assume:
  - npm 7+ installs **peer dependencies** automatically. `@raycast/utils`
    peers on `@raycast/api` (about 30 MB plus esbuild/oclif) and React, so
    the stripped packages come back as peers;
  - lockfile v2/v3 `packages["node_modules/…"]` entries still pin
    `@raycast/api`, React or `@types/*`, and the v1-only stripping misses
    them.
- Investigate with an offline-capable reproduction where possible. A real
  one-off install of a small extension from the corpus into `.cache/` is
  allowed in an explicit script or manual run, never in `bun test`. List the
  top-level dirs of `node_modules` by size, and record the before/after in
  Handoff.
- Fix candidates (choose with evidence):
  - `--omit=peer` (npm 10+ in Node 24) or `--legacy-peer-deps`;
  - stripping supplied packages from lockfile v2/v3 `packages` entries
    (including nested `node_modules/*/node_modules/react`);
  - keeping version pins for everything else.
    Make sure `@raycast/utils` from the install still resolves `@raycast/api`
    and React to the runtime-supplied copies at bundle time. They are external
    per 0008, so verify that `useFetch`/`useCachedPromise` run with an
    installed utils.
- Tests use the injected `installer` and a fake npm to assert:
  - the exact npm args;
  - the rewritten lockfile contents for v1, v2 and v3 samples (fixtures);
  - that installs keyed by the same manifest stay cached.
    Keep the existing offline `file:` dependency test passing.
- If behaviour changes, update `docs/decisions/0008` point 4 with one line.

## Acceptance

- [ ] Handoff shows `du` of a representative real install before and after
      (e.g. `xml2js` or `marked`), with the top dirs.
- [ ] The installed `@raycast/utils` path still works (test or fixture).
- [ ] `bun run verify` passes.

## Out of scope

- tsconfig paths (0082), changing which packages are supplied.

## Handoff

Filled in by the worker when finishing:

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
