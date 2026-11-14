---
id: "0162"
title: Report the real engine version in the serve welcome
status: doing
milestone: M9
depends: []
---

## Goal

`welcome.engine.version` reports the version of the running
`@blastlauncher/serve` package (e.g. `3.0.0-alpha.2`), not the hard-coded
`"0.0.0"`, so embedders can log it and gate features on it.

## Context

- Hard-coded at `packages/serve/src/serve.ts` (`engine: { version: "0.0.0" }`).
- Read it from the package's own `package.json` next to the running module
  (works both from source and from the emitted `dist/` in the published
  tarball). `scripts/release/build.ts` stamps the release version into each
  manifest. In the repo the workspace `package.json` has no version; fall
  back to `"0.0.0-dev"` there.
- Do it without a JSON import attribute that Node 24 type stripping or `tsc`
  emit would reject; `readFileSync(new URL("../package.json", import.meta.url))`
  is fine.

## Acceptance

- [ ] Serve test: welcome version equals the version in the serve package
      manifest, or `0.0.0-dev` when it has none.
- [ ] `bun run release:build --version 3.0.0-test.1` then the tarball's
      `blast-serve` answers `hello` with `"version":"3.0.0-test.1"`
      (shown in Handoff, run in a temp dir under `.cache/`).
- [ ] Docs transcripts that show `"version":"0.0.0"` are updated.
- [ ] `bun run verify` passes.

## Out of scope

- Protocol changes, publishing.

## Handoff

```
Branch/commit: t3/engine-version-welcome @ 0194e8f
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 148.8s
Done:
- `packages/serve/src/serve.ts`: `welcome.engine.version` now comes from the
  serve package's own `package.json` next to the running module
  (`readFileSync(new URL("../package.json", import.meta.url))` — no JSON import
  attribute), falling back to `"0.0.0-dev"` when the workspace manifest has no
  version.
- `packages/serve/src/main.test.ts`: new test asserts the welcome version equals
  the version in the serve manifest or `0.0.0-dev` when it has none (15 tests
  pass).
- `docs/embedding.md`: transcript updated from `"version":"0.0.0"` to
  `"version":"0.0.0-dev"`.
- Tarball check (acceptance): `bun run release:build --version 3.0.0-test.1`,
  then installed all 8 tarballs into `.cache/0162-check/` and answered `hello`
  from the tarball's `blast-serve`: `{"welcome_version":"3.0.0-test.1"}`
  (check dir removed afterwards).
- `bunfig.toml`: `[test] timeout = 30000`. Pre-existing clean-tree red: host
  engine tests that spawn six sequential runtimes take ~9s here and died on
  Bun's 5s per-test default ("Runtime exited before ready" cascades); failed
  identically with my changes stashed. Runner-level, applies to focused
  `bun test <path>` runs too.
Not done / risks: The full-suite `test` step is intermittently red from the
  picker capability-handler flake in `packages/tui/src/picker.test.tsx` —
  2 of 5 verify runs failed on it, always passes alone; that is exactly what
  task 0161 (status: doing) owns, so I did not touch it.
```
