---
id: "0001"
title: Vendor the latest @raycast/api type declarations
status: review
milestone: M0
depends: []
---

## Goal

`bun run compat:fetch [version]` downloads a published `@raycast/api` release
and vendors its `types/index.d.ts` into `compat/raycast-api/`, so every later
coverage step works offline and API upgrades show up as a reviewable diff.

## Context

- Registry metadata: `https://registry.npmjs.org/@raycast/api` (JSON;
  `dist-tags.latest`, `versions[v].dist.tarball`, `versions[v].dist.integrity`).
  At writing, latest is `2.8.2`; the tarball contains `package/types/index.d.ts`
  (~330 KB, one file) and `package.json` with `"license": "MIT"`.
- Download into `.cache/raycast-api/<version>/` (gitignored). Extracting with
  the system `tar` via `node:child_process` is fine; do not add an npm
  dependency just for tar.
- Verify the tarball against `dist.integrity` (SRI, `sha512-<base64>`) before
  extracting.
- Outputs, committed:
  - `compat/raycast-api/index.d.ts` — byte-for-byte copy.
  - `compat/raycast-api/source.json` — `{ "package", "version", "license",
    "tarball", "integrity", "sha256" }` where `sha256` is of `index.d.ts`.
- Put code in `scripts/compat/`. Keep network and filesystem side effects in a
  thin entry; keep integrity checking and metadata selection as pure,
  unit-tested functions.
- Add `scripts/compat/check-vendor.ts` (pure core + entry): fails if
  `index.d.ts` does not match `source.json.sha256`. Wire it into
  `scripts/verify.ts` as a `compat` step (offline).
- The vendored file must be excluded from oxfmt and oxlint (see
  `.oxfmtrc.json` `ignorePatterns` and the `lint` script); `tsc` already only
  includes `scripts` and `packages`.

## Acceptance

- [x] `bun run compat:fetch` (no arg) vendors the current latest; `bun run
      compat:fetch 2.8.2` vendors that exact version. Re-running is idempotent
      (no diff).
- [x] Integrity mismatch aborts with a clear error and writes nothing to
      `compat/`.
- [x] Unit tests (no network) cover: version selection incl. unknown version
      error, SRI verification pass/fail, sha256 check pass/fail.
- [x] `bun run verify` includes a `compat` step and passes; editing one byte of
      the vendored file makes it fail.
- [x] `compat/raycast-api/` is committed for version 2.8.2 (or newer latest).

## Out of scope

- Parsing the declarations (task 0002).
- Any scheduled/CI automation for upgrades.
- Changes to `AGENTS.md` or `PLAN.md`.

## Handoff

```
Branch/commit: t3/vendor-raycast-api-types @ ff58d5e (feat(0001), this task file
               updated in the commit that follows it)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok) in 0.3s
Done:
- `bun run compat:fetch [version]`: reads registry.npmjs.org/@raycast/api,
  selects dist-tags.latest or the pinned version, downloads the tarball into
  .cache/raycast-api/<version>/, checks it against dist.integrity (SRI) before
  extracting with system tar, then writes compat/raycast-api/index.d.ts
  (byte-for-byte, 328765 bytes) and source.json {package, version, license,
  tarball, integrity, sha256}. Vendored @raycast/api@2.8.2, sha256
  b600be1dd62b422745c1072baefa040167cc6aaa5c34ae6bcc4db9092e792bb6, MIT.
- Pure cores in scripts/compat/raycast-api.ts (selectRelease, parseIntegrity,
  verifyIntegrity, sha256Hex) and scripts/compat/check-vendor.ts
  (checkVendored); entries fetch-raycast-api.ts and check-vendor.ts hold the
  network/filesystem side effects.
- Verify: new offline `compat` step runs `bun run compat:check` after typecheck.
  Demonstrations: a bogus digest aborts with "integrity mismatch: ..." and
  leaves compat/raycast-api unwritten; a reverting re-run of compat:fetch
  restores it; flipping one byte of index.d.ts fails verify with
  "sha256 64503fec... does not match compat/raycast-api/source.json
  (b600be1d...)"; two consecutive fetches (with and without the version arg)
  produce byte-identical files.
- Vendored file and source.json excluded from oxfmt (.oxfmtrc.json
  ignorePatterns) and oxlint (lint script ignore-pattern); tsc already only
  includes scripts/ and packages/.
- Tests: scripts/compat/raycast-api.test.ts (version selection, unknown-version
  error, SRI pass/fail, multi-digest, sha256) and
  scripts/compat/check-vendor.test.ts (match, one-byte mismatch, missing files,
  malformed source.json). 26 tests pass repo-wide; no network in tests.
Not done / risks:
- Registry metadata and tarball URLs are hard-coded to registry.npmjs.org; a
  proxy or mirror would need an env override (out of scope).
- `tar` must be on PATH (system tar, GNU or bsdtar compatible flags); no npm
  tar dependency was added, per the task.
- Anything above the pinned 2.8.2 requires a re-run of compat:fetch and review
  of the diff, including compat/raycast-api.inventory.json once task 0002 lands.
- Acceptance check "editing one byte makes it fail" was demonstrated manually,
  not as an automated test, since it needs the real committed file.
```
