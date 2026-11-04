---
id: "0102"
title: Pre-release workflow for v3 (dry run by default)
status: doing
milestone: M6
depends: []
---

## Goal

A maintainer can cut a v3 pre-release (`3.0.0-alpha.N` and similar) from
GitHub Actions in one manual run: it verifies, builds and smoke-tests the
eight packages, and in dry-run mode stops there with the tarballs attached. A
real run publishes to npm under the `next` dist-tag, tags the commit and
creates a GitHub prerelease.

## Context

- `scripts/release/build.ts` (`bun run release:build --version <v>`) already
  writes eight tarballs to `.cache/release/tarballs/` (packages: protocol,
  runtime, host → `@blastlauncher/engine`, client-core, native, serve, cli,
  shared-deps), and `bun run release:smoke` installs and exercises them.
- `@blastlauncher/cli` and `@blastlauncher/runtime` already exist on npm at
  1.x from Blast v1; the other names are unclaimed. Pre-releases must never
  move the `latest` dist-tag, which must keep pointing at v1 until v3 is stable.
- Existing tags `v0.0.x` are v1 Electron app releases; v3 tags are
  `v<version>`, for example `v3.0.0-alpha.1`.
- There is no npm token secret in the repo. The owner will add `NPM_TOKEN`
  later. The workflow must run end to end in dry-run mode without it and
  refuse to publish with a clear message when it is missing.
- Put the decision logic in a tested script, as `compat-upgrade` does
  (`scripts/compat/upgrade-job.ts`), so the YAML only calls it.

## Acceptance

- [ ] `.github/workflows/prerelease.yml`: `workflow_dispatch` with inputs
      `version` (required) and `dry_run` (boolean, default true); actions
      pinned by full SHA as in `ci.yml`; least-privilege permissions
      (`contents: write` and `id-token: write` only where publishing needs
      them).
- [ ] A tested script validates the version (semver pre-release with major 3,
      for example `3.0.0-alpha.1`, `3.0.0-beta.2`, `3.0.0-rc.1`; rejects
      stable versions and other majors), refuses a tag that already exists,
      orders publishing by internal dependency, and skips a package version
      already on npm so a re-run resumes.
- [ ] Every run: `bun run verify`, `release:build --version`, `release:smoke`,
      then uploads the tarballs and the embedder JSON schema as an artifact.
- [ ] Real runs only (dry_run false): fail fast if `NPM_TOKEN` is absent;
      `npm publish --tag next --access public --provenance` per tarball in
      order; then create tag `v<version>` and a GitHub prerelease with the
      tarballs, the schema and generated notes.
- [ ] `docs/release.md` (short) explains how to cut a pre-release, the
      dist-tag policy, and the one-time owner setup (`NPM_TOKEN` secret, npm
      scope access). Link it from the README's development section.
- [ ] Tests cover the script without network; the YAML parses. Do not trigger
      the workflow on GitHub and do not publish anything.
- [ ] `bun run verify` passes.

## Out of scope

- Publishing, creating tags or releases, or changing repository settings.
- Stable (`latest`) releases, changelog generation beyond GitHub's notes.

## Handoff

```
Branch/commit: t3/2ab0d67c @ 5a514e2
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, workflow ok, test ok) in 54.1s
Done:
- Added a manually dispatched dry-run-first workflow with read-only build permissions and publish-only write/id-token permissions.
- Added tested v3 prerelease validation, remote tag checks, dependency ordering, npm version resume checks, and token enforcement.
- Added release instructions and linked them from the README development section.
- Locally ran the release build and smoke flow for 3.0.0-alpha.0; YAML parsed successfully.
Not done / risks: GitHub Actions, npm publishing, tag creation, and GitHub release creation were intentionally not triggered.
```
