---
id: "0170"
title: Docs and landing install from npm @next (alpha.2)
status: doing
milestone: M10
depends: []
---

## Goal

Every install path in the docs and on the landing page uses the published
`3.0.0-alpha.2` packages from npm `next`, and works when copied into an
empty directory outside this repository.

## Context

- `3.0.0-alpha.2` is on npm `next` for all nine packages, including
  `@blastlauncher/web`. 0166 wrote "from source" (release tarballs) because
  `next` was alpha.1. Replace those with `npm install @blastlauncher/<pkg>@next`
  / `npx -p @blastlauncher/serve@next blast-serve` in `README.md`,
  `docs/quickstart.md`, `docs/embedding.md`, `docs/root-view.md`,
  `docs/launch-prompts.md`, `packages/web/README.md`, the examples' READMEs
  and the landing page install section (`examples/browser-demo/landing.ts`,
  update `site.test.ts`). Remove notes saying the APIs are newer than
  alpha.1. Keep a one-line pointer to `bun run release:build` for
  contributors.
- The quickstart must not depend on files in this repo: point the JS and
  serve paths at a real extension the reader downloads, or say clearly to
  clone a Raycast extension, e.g.
  `npx degit raycast/extensions/extensions/<name> my-extension` (pick one
  that renders offline without preferences; check `compat/SMOKE.md`).
- Line limits: `docs/quickstart.md` ≤ 120, `docs/embedding.md` ≤ 150.

## Acceptance

- [ ] In a temp dir under `.cache/` (no repo files on the path), follow each
      quickstart path exactly as written against npm `@next`: JS in-process
      prints the extension's root rows; `blast-serve` answers `root.open`
      with a `root.view`; the web page path renders a row (adapt
      `scripts/release/web-e2e.ts` to install from npm instead of tarballs,
      as an option, e.g. `--from-npm 3.0.0-alpha.2`). Outputs in Handoff.
- [ ] No doc says "from source" for an install path, or mentions alpha.1
      as current (`grep -rn`, result in Handoff).
- [ ] `bun run site:e2e` and `bun run verify` pass.

## Out of scope

- Publishing, code changes beyond the web e2e option and landing text.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
