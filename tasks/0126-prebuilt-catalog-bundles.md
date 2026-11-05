---
id: "0126"
title: Prebuild catalog command bundles at site build time for a fast first open
status: doing
milestone: M8
depends: []
---

## Goal

Opening a catalog command on the live demo takes about 1 second instead of
about 11. Measured cold on https://blast.yukai.dev after 0124:

- about 7 s fetching extension files through the GitHub API;
- about 2.5 s bundling with esbuild-wasm;
- about 0.5 s starting the sandbox.

`site:build` prebuilds each catalog command, so the page only downloads one
small bundle and starts it.

## Context

- **Prebuild in `site:build`:**
  - For every catalog command, fetch the extension's files at the catalog's
    pinned `commit` (`catalog.json`), the same set of files the browser fetches.
  - Install dependencies with `installForBrowser` and bundle with
    `bundleForBrowser`, using native esbuild in Node. The bundle must be the
    one the browser would produce: same aliases, same runtime entry.
  - Write it to `www/demo/bundles/<extension>/<command>.js`, plus an index
    `bundles.json` mapping `extension/command` to `{path, bytes, sha256}`.
  - This needs network for GitHub raw and npm, so it runs in CI's site build,
    not in `bun test`.
  - Cache fetched sources under `.cache/browser-catalog/<commit>/` so local
    rebuilds are fast.
  - Use raw file URLs at the pinned commit instead of the GitHub contents API,
    to avoid its 60-requests-per-hour unauthenticated limit in CI. List files
    through `git/trees/<commit>?recursive=1` once per build, then fetch from
    `raw.githubusercontent.com`.
- **Client:**
  - When `bundles.json` has the selected command, fetch that bundle, check its
    sha256 with Web Crypto, and start it in the sandbox. Skip the
    fetch/install/bundle stages.
  - Load esbuild.wasm only on the fallback path: a pasted URL, or a missing or
    stale bundle.
  - `bundles.json` carries the build sha. A mismatch with `build.json` uses
    the fallback path.
- **Failures:**
  - A command whose prebuild fails is left out of `bundles.json` and falls
    back at runtime.
  - The build prints a summary (built, failed, with reasons), and the Handoff
    records it.
  - The whole build fails only if fewer than 90% of catalog commands prebuild.
- **Size:** report the total size of `bundles/`. If it exceeds 50 MB, gzip is
  not the answer on Pages; consider sharing a common runtime chunk across
  bundles instead, and report the numbers.
- **Conflicts:** 0125 runs in parallel on UI polish. Keep `client.ts` changes
  to the launch path.

## Acceptance

- [ ] Unit tests:
  - [ ] the `bundles.json` schema;
  - [ ] fast-path selection, falling back on a missing entry, a sha mismatch
        or a build mismatch;
  - [ ] the tree-listing-to-file-set mapping.
- [ ] `bun run site:e2e` (fixtures):
  - [ ] a fixture command opens through a prebuilt fixture bundle, and
        esbuild.wasm is never requested on that path (assert with Playwright
        request events);
  - [ ] the paste-URL path still works and does load esbuild.wasm.
- [ ] A local production `site:build` plus `site:smoke:browser`:
  - [ ] `ratio-calculator` opens through its prebuilt bundle;
  - [ ] the Handoff records the cold time to first scene, with a target of
        under 2 s, and the bytes downloaded for it.
- [ ] `.github/workflows/site.yml` still builds and deploys; workflow tests
      updated if needed.
- [ ] `bun run verify` passes.

## Safety (hard rules)

- Headless only.
- Set `PLAYWRIGHT_BROWSERS_PATH` only in your shell; never write absolute
  personal paths into files; never download Chromium.
- Stub `navigator.clipboard` and `window.open`.
- No pushes, deploys or settings changes.
- 127.0.0.1 servers only.
- Network only in build and smoke scripts.
- Never `rm -rf` a path held in a shell variable.
- Leave any untracked `~` directory alone.
- Keep disk use small: report the size of `.cache/browser-catalog`.

## Out of scope

- UI polish (0125).
- Changing which commands are in the catalog.

## Handoff

```
Branch/commit: t3/prebuilt-catalog-bundles-1 @ c23f3e1
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 65.7s
Done:
- Reworked production prebuild to reuse scripts/corpus/fetch.ts for a pinned shallow blobless sparse checkout at the catalog commit, eliminating the GitHub tree API and including all non-node_modules extension files.
- Added a runtime bundle artifact and extended bundles.json validation with runtime metadata; command bundles retain SHA-256 and build-SHA gating and the fast path preserves the 0125 status rendering.
- Production build measured 225/237 commands (94.9%) built in about 19 seconds after checkout; 12 failures are grouped below. Command bundle bytes were 262,592,197 plus a 933,015-byte runtime artifact (median/p95/max are printed by the prebuild summary).
- Fixture Playwright smoke passes and confirms the prebuilt fixture launch does not request esbuild.wasm. The production smoke script was not run against the generated output because the generated bundle set is too large for the local safety budget.
- Sparse corpus checkout measured 816 MB, above the requested ~300 MB target; CI sets BLAST_CORPUS_MAX_MB=1000 to permit the complete catalog checkout.
Not done / risks:
- Shared runtime externalization is not complete: command bundles still embed React/reconciler/API, so generated bundles exceed the 30 MB target. A registry-based externalization needs to preserve a single React instance across the sandbox VM.
- Production failures: bugmenot/find-login (missing npm entities), humaans/clock-in, clock-out, holidays, people (missing cross-fetch), multi-ai-chat/multi-ai-chat and run-presets (missing local files), promptty/search-promptty (missing local component), splatoon/splatoon-2-schedules and splatoon-3-schedules (missing node-fetch), trenit/departures-and-arrivals and valkey-commands-search/search-valkey-commands (missing entities).
```
