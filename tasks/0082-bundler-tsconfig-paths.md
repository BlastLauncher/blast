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
Branch/commit: t3/bundler-tsconfig-paths @ 41dd35b (Handoff update on top)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, workflow ok, test ok) in 125.3s — 736 pass / 0 fail
Done:
- packages/host/src/tsconfig-paths.ts: reads the extension's tsconfig chain
  (extends followed only inside the extension dir; package presets skipped
  with a warning; cycles and unparseable files degrade to no aliasing) and
  resolves bare specifiers through `paths` then `baseUrl`, probing files only
  inside the extension directory (esbuild's order for extensions/dirs).
- packages/host/src/bundle.ts: the dependency plugin tries tsconfig aliases
  before installed/shared/missing, only for bare imports from extension files
  (never inside dependency graphs), so aliases win over same-named installed
  packages as tsc does and a never-resolving bare import still fails with
  MissingDependencyError naming `blast deps`.
- Fixture fixtures/extensions/tsconfig-paths/ (baseUrl "src" + `@lib/*` paths
  in an extended base file, one command importing both styles); 7 new tests in
  packages/host/src/tsconfig-paths.test.ts cover bundle+run of both alias
  styles, installed-package precedence, the missing-dependency fallback,
  external extends, paths-without-baseUrl, escape containment and broken JSON.
- docs/architecture.md: one sentence recording the resolution order.
- Optional control-d re-run done via a one-off script through the smoke-deps
  path (`runOne`, installed dependencies on): all 5 commands now render
  (change-filters, learn-my-ip, list-profiles, modify-profile, status).
Not done / risks:
- compat/SMOKE-DEPS.md/json left untouched: the script writes them only from
  a complete 25-extension run (its per-command data would be lost otherwise),
  and that run churns install metrics task 0083 is changing in parallel.
  `corpus:smoke-deps` should be re-run wholesale after 0083 lands; until then
  the report still shows the pre-fix "5 bundle-failed".
- Aliasing is lexical (no symlink realpathing), matching esbuild's own
  tsconfig handling; `paths` targets are honoured per esbuild fall-through
  semantics (missing target → next candidate/packages), which is more
  forgiving than tsc's hard error.
- .cache corpus data deleted after the re-run (34 MB checkout removed).
```
