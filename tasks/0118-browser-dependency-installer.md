---
id: "0118"
title: Browser dependency installer (registry + tarballs, in memory, lean rules)
status: todo
milestone: M8
depends: []
---

## Goal

`@blastlauncher/host` exports `installForBrowser({ fetch, manifest, lockfile? })`.

- It resolves an extension's runtime dependencies against the npm registry and
  downloads their tarballs.
- It unpacks them in memory into the `packages` map that `bundleForBrowser`
  (0117) consumes.
- It never runs package code, and works in Node and in a browser.

## Context

- **Decision 0013, items 2 and 5, and 0008 (lean installs):**
  - only `dependencies`, never `devDependencies`;
  - never `@raycast/*`, and nothing Blast supplies (React and so on, as in
    `packages/host/src/install.ts`, or wherever the lean rules live);
  - no lifecycle scripts;
  - install `peerDependencies` that are needed, as 0085 did;
  - a lockfile, when present, pins versions.
- **Why not almostnode's installer:** spike 0115 found that almostnode's npm
  resolver rejects a satisfiable `@oclif/core@^4`. Use our own semver, from the
  `semver` already in `packages/shared-deps` or the same pinned version, to
  choose versions from registry packuments.
- **Downloads:**
  - Download tarballs via `dist.tarball` and check `dist.integrity` (SHA-512,
    with Web Crypto `crypto.subtle`, available in Node 24 and in browsers).
  - Gunzip with `DecompressionStream`, also in both.
  - Untar with a small pure parser written here, without a dependency unless
    one is clearly justified.
- **Limits:**
  - Configurable caps on total bytes and package count, giving a typed error
    when exceeded.
  - Native packages (`binding.gyp`, prebuilt `.node`) give a typed
    native-module error.

## Acceptance

- [ ] Tests use an injected `fetch` serving recorded packuments and tarballs
      from `fixtures/npm/`, small and created for the test. No network.
  - [ ] Caret, tilde and exact ranges resolve correctly, including a case like
        `^4` against a packument whose latest version is 5.x.
  - [ ] Nested dependencies are deduplicated.
  - [ ] A lockfile pins versions.
  - [ ] `@raycast/api`, `react` and `devDependencies` are skipped.
  - [ ] An integrity mismatch gives a typed error.
  - [ ] The size cap gives a typed error.
  - [ ] A native package gives a typed error.
  - [ ] The tar parser handles long names (ustar prefix or pax), directories
        and files.
- [ ] A test proves there are no `node:fs` or `node:child_process` imports in
      the browser code path.
- [ ] `bun run verify` passes.

## Out of scope

- Bundling (0117).
- The demo page and live registry runs (0119).
- Changing desktop installs.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
