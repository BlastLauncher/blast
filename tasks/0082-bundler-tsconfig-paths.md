---
id: "0082"
title: Bundler honours the extension's tsconfig baseUrl/paths
status: doing
milestone: M5
depends: []
---

## Goal

Extensions that import their own modules through tsconfig `baseUrl` or
`paths` aliases bundle and run unmodified, the same way `ray build` does.
For example, `control-d` imports `common/...` from its root, and all 5 of its
commands fail today with "missing common" (`compat/SMOKE-DEPS.md`).

## Context

- Bundling: `packages/host/src/bundle.ts` (esbuild, with the dependency
  plugin that resolves installed deps → shared-deps → missing-dependency
  error). The dependency plugin probably sees `common/foo` as a bare package
  specifier and rejects it before esbuild's own tsconfig handling can apply.
- esbuild supports `tsconfig` / `tsconfigRaw` and resolves `paths`/`baseUrl`
  itself when given the extension's tsconfig. Make sure:
  - the extension's `tsconfig.json` (including `extends` chains inside the
    extension dir) is used for path resolution;
  - a specifier that resolves via `paths`/`baseUrl` to a file inside the
    extension is never treated as a package (no missing-dependency error, no
    install suggestion);
  - real packages with the same first segment as a baseUrl directory resolve
    by tsconfig precedence (baseUrl/paths first, as tsc does), with a test;
  - nothing outside the extension directory is read for aliasing, and
    `extends` pointing outside the extension (e.g. `@raycast/...` presets
    not installed) does not crash. Fall back gracefully with a log line.
- Fixture: `fixtures/extensions/tsconfig-paths/` with `baseUrl: "src"` and a
  `paths` alias (`@lib/*`), a command importing both, plus a tsconfig
  `extends` a local base file.
- Tests in `packages/host/src/*.test.ts`: bundle + run the fixture and
  assert the rendered titles come from both alias styles; a bare import that
  resolves neither way still produces the missing-dependency error naming
  `blast deps`.

## Acceptance

- [ ] Fixture tests pass; the existing bundle and dependency tests are
      unchanged.
- [ ] Optional, if network is available: re-run only `control-d` through
      `bun run corpus:smoke-deps` (or a one-off script). If you do, update
      `compat/SMOKE-DEPS.md`/json via the script, never by hand, and delete
      `.cache` corpus data afterwards. Otherwise say so in Handoff.
- [ ] `bun run verify` passes.

## Out of scope

- Install size (0083), other bundler features.

## Handoff

Filled in by the worker when finishing:

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
