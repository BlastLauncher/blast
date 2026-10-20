---
id: "0077"
title: Slim engine — move the shared-dependency allowlist into optional @blastlauncher/shared-deps
status: doing
milestone: M5
depends: ["0069"]
---

## Goal

Installing `@blastlauncher/engine` no longer pulls in the shared extension
libraries (about 75 MiB of the 131 MiB smoke install, measured in 0069). The
allowlist moves to an optional `@blastlauncher/shared-deps` package. When it
is installed, the engine uses it as the fallback (decisions 0002/0008).
Without it, extensions resolve only their own installed dependencies
(`blast deps` / `dependencies.install`), and the error points there.

## Context

- Today, `packages/host/package.json` depends on `@raycast/utils`, axios,
  cheerio, cross-fetch, date-fns, dayjs, fuse.js, lodash, moment, nanoid,
  node-fetch, node-html-markdown, uuid and zod. `packages/host/src/dependencies.ts`
  (`PROVIDED_PACKAGES`, `dependencyWarnings`, which reads the host
  package.json versions) and the bundle dependency plugin in `bundle.ts`
  resolve them from the host's own `node_modules`.
- New package `packages/shared-deps` (`@blastlauncher/shared-deps`):
  - it owns those dependencies at their current pinned versions;
  - it exports `PROVIDED_PACKAGES` and a `resolveShared(specifier)` that
    returns an absolute path resolved from its own location, so resolution
    works from the repo and from `node_modules`.
    Host keeps the _list_ knowledge out of its own deps. At bundle time it
    dynamically `import("@blastlauncher/shared-deps")`; when that is missing,
    the fallback is off, the error message names `blast deps` and the
    `@blastlauncher/shared-deps` package, and `checkExtensionDependencies`
    reports which declared deps would be unresolvable.
- Host keeps `@blastlauncher/runtime`, `@blastlauncher/protocol`, `esbuild`
  and `semver` (if it is used outside the shared list).
- Keep the existing externals (`@raycast/api`, `react`, `react/*`); the
  runtime supplies them, so they are not part of shared-deps.
- In the repo, `cli`, `tui`, `serve` and the corpus scripts depend on
  `@blastlauncher/shared-deps` so behaviour and reports stay identical:
  `bun run corpus:smoke` and `corpus:tui-smoke` results must not change. You
  need not rerun the network fetch; the unit tests that cover resolution
  must pass.
- Release (`scripts/release/build.ts` and `smoke.ts`):
  - add `shared-deps` as an 8th tarball;
  - the smoke installs the engine _without_ shared-deps first and asserts
    that a fixture using only `@raycast/api` runs;
  - it then installs shared-deps and runs a fixture importing `lodash` or
    `@raycast/utils`;
  - report both install sizes.
- Amend `docs/decisions/0008-installed-extension-dependencies.md` point 5 and
  `0002` consequences with one or two lines each. Update
  `docs/architecture.md` (Packages row) and `docs/embedding.md`
  ("Installing").

## Acceptance

- [ ] `packages/host/package.json` lists no shared-allowlist package.
      `rg -n "\"(axios|cheerio|lodash|moment|@raycast/utils)\"" packages/host/package.json`
      prints nothing.
- [ ] Host test: with shared-deps unavailable (inject a resolver that fails),
      bundling an extension that imports `lodash` without an install fails
      with a message naming `blast deps` and `@blastlauncher/shared-deps`.
      With it available, bundling succeeds as today.
- [ ] `bun run release:smoke` passes and reports the slim engine install
      size vs with shared-deps (paste in Handoff).
- [ ] `bun run verify` passes; corpus selection/smoke unit tests unchanged.

## Out of scope

- Changing which packages are shared, versions, or the 0008 install flow.

## Handoff

Filled in by the worker when finishing:

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
