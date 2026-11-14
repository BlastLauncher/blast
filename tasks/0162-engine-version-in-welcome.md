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
Branch/commit:
Verify:
Done:
Not done / risks:
```
