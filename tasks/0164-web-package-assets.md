---
id: "0164"
title: "@blastlauncher/web ships its sandbox and runtime assets"
status: doing
milestone: M9
depends: ["0163"]
---

## Goal

A web developer embeds Blast with `npm install @blastlauncher/web@next`, copies
one directory of static files to their sandbox origin, and calls `mount()`; no
build step of their own.

## Context

- Decision 0015: the embedder hosts the sandbox. Today `mount()` needs
  `almostnode.mjs`, `almostnode-full.mjs`, `esbuild.mjs`, `esbuild.wasm` and
  `blast-sources.json`, which only the demo's `buildBrowserAssets`
  (`examples/browser-demo/build.ts`) produces, plus the sandbox page in
  `packages/web/sandbox/`.
- Make `release:build` put those built assets into the `@blastlauncher/web`
  tarball (e.g. `assets/` for the page origin, `sandbox/` for the sandbox
  origin) and document in `packages/web/README.md` which directory goes to
  which origin. `mount()` defaults its asset URLs so the page only passes
  `sandboxUrl` (and optionally `assetsUrl`).
- Keep the tarball reasonable: report its packed and unpacked size in Handoff;
  no duplicate copies of the same file.
- Playwright: export `PLAYWRIGHT_BROWSERS_PATH="$HOME/.cache/ms-playwright"`.

## Acceptance

- [x] `bun run release:build`, then in a temp dir under `.cache/`: install the
      web tarball, serve `node_modules/@blastlauncher/web/<assets>` and
      `<sandbox>` on two loopback origins with a ≤ 15-line page calling
      `mount()`; an e2e asserts a rendered `hello-list` row (script in repo).
- [x] `release:smoke` checks the asset files are in the tarball.
- [x] `packages/web/README.md` quickstart ≤ 30 lines; `docs/quickstart.md`
      gets a "Embed in a web page" section (keep ≤ 120 lines).
- [x] `bun run verify` passes.

## Out of scope

- CDN hosting, framework wrappers, demo changes.

## Handoff

```
Branch/commit: t3/19a3b7a4 @ a9ed272 (71079bc, 96fb8ec, a9ed272)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 122.7s
Done:
- packages/web/build/assets.ts (Bun repo automation, not shipped) owns the asset build moved out of examples/browser-demo/build.ts: buildWebAssets() and writeWebAssets(dir) -> assets/{blast-web.js, almostnode.mjs, esbuild.mjs, esbuild.wasm, blast-sources.json} (page origin) and sandbox/{index.html, almostnode-full.mjs} (sandbox origin). The demo's build.ts only adds client.js; site, demo main, web-embed e2e and release:build all call the package script.
- release:build writes both directories into the web package (files += assets, sandbox) and ships packages/web/README.md as its README. Web tarball: 4,529,587 bytes packed, 18,107,425 unpacked, 46 entries; no file duplicated (esbuild.wasm 14.0 MB, blast-sources.json 3.1 MB, almostnode-full.mjs 594 KB, esbuild.mjs 130 KB, blast-web.js 121 KB minified, almostnode.mjs 22 KB).
- mount()/prewarm default assetsUrl to the package's assets/: "../assets/" from dist/*.js, "./" inside the bundled assets/blast-web.js (build-time define). Covered by packages/web/src/sandbox.test.ts.
- `bun run release:web:e2e` (scripts/release/web-e2e.ts): npm-installs the web, client-core and protocol tarballs into .cache/release/web-e2e, serves the installed assets/ and sandbox/ unchanged on two loopback origins with an 11-line page that passes only sandboxUrl (plus fixtures), and asserts the hello-list `apple` row renders from the sandbox origin. Passed. release:smoke checks each asset file is installed and non-empty. Passed.
- Docs: web README quickstart (26 lines: which directory goes to which origin); docs/quickstart.md "Embed in a web page" (95 lines total); decision 0015 consequence updated. example:web-embed:e2e, example:browser-demo:e2e and site:e2e pass.
Not done / risks:
- With an app bundler, import.meta.url points at the app's bundle, so assetsUrl must be passed explicitly (README says so). Vite/webpack wrappers are out of scope.
- release:web:e2e is not run by CI or verify (it needs network and Playwright browsers, like release:smoke). The prerelease workflow could run it after release:smoke.
- release:build now runs the browser asset build (installs almostnode/esbuild-wasm/playwright npm packages into .cache/browser-demo/deps on first run; network).
- Quickstart examples use raycast/extensions/android-versions (a catalog extension) because hello-list is a repo fixture, not on GitHub; not run end to end against GitHub here.
```
