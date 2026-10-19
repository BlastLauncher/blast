---
id: "0058"
title: Install an extension's own dependencies outside its directory
status: doing
milestone: M4
depends: []
---

## Goal

`blast deps <extensionDir>` installs the extension's production dependencies,
as `docs/decisions/0008-installed-extension-dependencies.md` specifies.
`bundleCommand` then resolves bare imports from that install before the
shared allowlist. An extension that imports a package outside the allowlist
bundles and runs after `blast deps`.

## Context

- Read decision 0008 first; it is the spec. It extends
  `docs/decisions/0002-extension-dependencies.md`.
- Bundling and resolution live in `packages/host/src/bundle.ts` (the esbuild
  `onResolve` plugin, `MissingDependencyError`) and
  `packages/host/src/dependencies.ts` (`PROVIDED_PACKAGES`).
- The CLI is `packages/host/src/cli.ts`; its docs are `docs/cli.md`, which has
  a 120-line limit, so keep the new section short. The data dir is
  `defaultDataDir()` in `packages/host/src/storage.ts`, and tests pass
  `dataDir`.
- Export a host API the TUI can call later (task 0060): one function that
  reports whether an install is needed and one that installs, with an
  injectable installer and a progress/log callback. The CLI wraps them.
- The install key must be deterministic, and the check must be cheap: no
  network and no npm when the key already matches.
- Tests must not use the registry. Inject a fake installer for the
  key/replace/strip logic. For one end-to-end test, run real `npm` offline
  against a fixture extension whose dependency is a `file:` package under
  `fixtures/`. Check that bundling resolves it and that the extension
  directory is unchanged afterwards.
- Product code stays Node 24-runnable: `node:child_process` with spawn, and
  no Bun APIs.

## Acceptance

- [ ] `blast deps <dir>` installs into `<dataDir>/deps/<name>/`. A second run
      with an unchanged lockfile does not invoke npm and prints that the
      install is up to date. Changing the lockfile replaces the install.
- [ ] The copied manifest omits `@raycast/api`, `react`, `react-dom`,
      `react/*` and `@types/*`. Show this with a test.
- [ ] npm is invoked with `--omit=dev --ignore-scripts --no-audit --no-fund`.
      Show this with a test using an injected installer.
- [ ] With a matching install, `bundleCommand` resolves a dependency from it.
      Test both cases: a package outside `PROVIDED_PACKAGES`, and an
      installed `@raycast/utils` taking precedence over the shared one.
      Without an install, behaviour is unchanged.
- [ ] A declared dependency that is not installed still fails with
      `MissingDependencyError`, and the CLI message suggests `blast deps`.
- [ ] Extension directory contents are byte-identical before and after
      `blast deps` (tested).
- [ ] `docs/cli.md` documents `blast deps`. `docs/architecture.md` mentions
      the install layer in one or two lines.
- [ ] `bun run verify` passes.

## Out of scope

- TUI integration (task 0060), corpus tooling changes, pruning commands.
- Lockfiles other than npm's `package-lock.json`. Without one, fall back to
  the declared ranges and warn.
- Running install scripts or building native addons.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
