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

- [ ] `bun run release:build`, then in a temp dir under `.cache/`: install the
      web tarball, serve `node_modules/@blastlauncher/web/<assets>` and
      `<sandbox>` on two loopback origins with a ≤ 15-line page calling
      `mount()`; an e2e asserts a rendered `hello-list` row (script in repo).
- [ ] `release:smoke` checks the asset files are in the tarball.
- [ ] `packages/web/README.md` quickstart ≤ 30 lines; `docs/quickstart.md`
      gets a "Embed in a web page" section (keep ≤ 120 lines).
- [ ] `bun run verify` passes.

## Out of scope

- CDN hosting, framework wrappers, demo changes.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
