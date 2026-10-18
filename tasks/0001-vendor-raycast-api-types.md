---
id: "0001"
title: Vendor the latest @raycast/api type declarations
status: doing
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

- [ ] `bun run compat:fetch` (no arg) vendors the current latest; `bun run
      compat:fetch 2.8.2` vendors that exact version. Re-running is idempotent
      (no diff).
- [ ] Integrity mismatch aborts with a clear error and writes nothing to
      `compat/`.
- [ ] Unit tests (no network) cover: version selection incl. unknown version
      error, SRI verification pass/fail, sha256 check pass/fail.
- [ ] `bun run verify` includes a `compat` step and passes; editing one byte of
      the vendored file makes it fail.
- [ ] `compat/raycast-api/` is committed for version 2.8.2 (or newer latest).

## Out of scope

- Parsing the declarations (task 0002).
- Any scheduled/CI automation for upgrades.
- Changes to `AGENTS.md` or `PLAN.md`.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
