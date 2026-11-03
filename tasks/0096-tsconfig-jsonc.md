---
id: "0096"
title: Parse tsconfig as JSONC for path aliases
status: doing
milestone: M6
depends: []
---

## Goal

Extensions whose `tsconfig.json` has comments or trailing commas keep their
`paths` aliases, as `tsc` does.

## Context

0094 sweep: 14 commands fail with `missing dependencies: @/lib` or `@/hooks`.
`packages/host/src/tsconfig-paths.ts:82` uses strict `JSON.parse`, so valid
JSONC (Sonarr's tsconfig has trailing commas) disables aliasing, and
`bundle.ts` then reports the aliases as missing packages. Keep the 0091
confinement: never read a config outside the extension.

## Acceptance

- [ ] Tests: a tsconfig with line comments, block comments and trailing
      commas resolves its `paths`; a string containing `//` is not mangled.
- [ ] Invalid JSONC still degrades to "no aliasing" with a warning.
- [ ] No new dependency unless justified in Handoff (prefer a small parser).
- [ ] `bun run verify` passes.

## Out of scope

- Other tsconfig options; rerunning the sweep.

## Handoff

```
Branch/commit: t3/parse-tsconfig-jsonc @ b09ba54
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, workflow ok, test ok) in 51.1s
Done:
- Added a dependency-free JSONC parser for comments and trailing commas while preserving string contents.
- Added coverage for line/block comments, trailing commas, URL-like strings, alias resolution, and warning-free valid configs.
- Kept existing confinement and invalid-config degradation behavior unchanged.
Not done / risks: No new dependencies. The parser intentionally supports the JSONC syntax needed by tsconfig and leaves other tsconfig options out of scope.
```
