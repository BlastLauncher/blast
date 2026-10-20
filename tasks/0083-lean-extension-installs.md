---
id: "0083"
title: Lean per-extension dependency installs (no peer @raycast/api or React pulled in)
status: review
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

- [x] Handoff shows `du` of a representative real install before and after
      (e.g. `xml2js` or `marked`), with the top dirs.
- [x] The installed `@raycast/utils` path still works (test or fixture).
- [x] `bun run verify` passes.

## Out of scope

- tsconfig paths (0082), changing which packages are supplied.

## Handoff

```text
Branch/commit: t3/lean-extension-installs @ 37ef83676ba99798f36c819c8eec1b3df5562d1c (implementation; handoff commit follows)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, workflow ok, test ok) in 126.9s
Done:
- Omit peer-only installs; strip supplied packages and their private graphs from lockfile v1/v2/v3, preserving all other pins.
- Invalidate older install keys once; unchanged inputs still reuse the lean install.
- Add offline lock fixtures/fake npm, cache migration and real installed-utils hook tests; existing offline file install passes (734 tests total).
- Verify npm-installed utils 2.3.1 runs useCachedPromise/useFetch with runtime API/React; update decision 0008. No dependencies added.
- Measure the pinned caschys-blog install before/after: 88 to 5 packages, 57,684 to 5,020 KiB (91.3% less); delete every reproduction install and corpus checkout.
Not done / risks: Peer-only packages are intentionally omitted; a needed non-runtime peer must be present as a production dependency. No full corpus rerun. Not pushed.
```

Reproduction: `bun run corpus:fetch --extension caschys-blog` at the existing
corpus pin, then `installExtensionDependencies` with that unmodified extension
and dataDir `.cache/lean-before` (baseline) / `.cache/lean-after` (implementation),
on Node 24.20.0 / npm 11.19.0. Baseline's rewritten lock confirms utils peers
reintroduce API 2.3.1; API brings React, types, esbuild and oclif. After installation
only utils 2.3.1, dequal 2.0.3, xml2js 0.6.2, xmlbuilder and sax remain.

`du -sk node_modules` and its largest immediate directories (KiB):

```text
                         Before    After
node_modules              57684     5020
@raycast                  33724     1200
  @raycast/api            32524   absent
  @raycast/utils           1196     1196
@esbuild                  10072   absent
xml2js                     3392     3392
@inquirer                  1400   absent
@oclif                     1380   absent
csstype                    1240   absent
xmlbuilder                          288
sax                                  72
dequal                               60
```

`du -sb node_modules`: 54,984,348 → 4,935,221 logical bytes. A temporary command
outside the corpus used the npm-installed utils with the hooks fixture and no
shared fallback; both hooks rendered their resolved values offline. All temporary
extension sources, builds, data directories and the sparse corpus were deleted.
