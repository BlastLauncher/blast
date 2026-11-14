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
Branch/commit: t3/4f8f1903 @ d1583d9 (work); Handoff in the commit after it
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 170.0s
Done:
- quickstart: sparse-clone raycast/extensions android-versions (~25 MB),
  `npm install @blastlauncher/engine@next`, `npx -p @blastlauncher/serve@next blast-serve`,
  Python via curl'd embedder.py + npm serve, web via `npm install @blastlauncher/web@next`;
  112 lines. embedding.md (145 lines), README, packages/web/README.md, Go/Python/macOS
  example READMEs, docs/release.md install from npm next; alpha.1 notes removed.
- scripts/release/web-e2e.ts: `--from-npm <version>` installs @blastlauncher/web from
  the registry into .cache/release/web-e2e-npm and checks the installed version.
- Landing install section: three npm next boxes (engine, serve, web); site.test.ts
  asserts them and rejects alpha.1 / From Source / release:build.
Not done / risks:
- docs/root-view.md and docs/launch-prompts.md had no install paths or alpha notes;
  unchanged. examples/web-launcher and browser-demo run from the checkout by design.
- macOS README `servePath` npm line is untested here (Linux); same `node <path>` spawn
  the Python/Go runs below use.
- The web quickstart fetches the extension through the GitHub contents API (60/h unauth).
```

Evidence (fresh `.cache/qs-run`, code blocks extracted from docs/quickstart.md and run as is):

- JS: `Commands: Android Versions,Search Android Version` then
  `Search Android Version: Android 15,Android 14,…,Android 5.0`.
- serve: `welcome` engine `3.0.0-alpha.2`, `{"extension":"2"}`, `root.view` list
  "Commands", `{"root":"1"}`.
- Python block: `connected: engine 3.0.0-alpha.2, protocol v1, 38 capabilities`,
  `view "Commands"`, `> Search Android Version` (Go with the npm serve: same root).
- Web: `bun run release:web:e2e --from-npm 3.0.0-alpha.2` →
  `{"pass":true,"version":"3.0.0-alpha.2","source":"npm","row":"apple","pageLines":11}`;
  the quickstart page as written (android-versions from GitHub) against the npm
  install rendered `Android 15 / API 35`.
- `grep -rn -i "from source\|alpha\.1" README.md docs packages/*/README.md examples
  --include=*.md --include=landing.ts`: no matches (exit 1).
- `bun run site:e2e`: `{"pass":true,"browser":"chromium",…}`.
