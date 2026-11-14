---
id: "0159"
title: "@blastlauncher/web: embed the browser runtime in any page"
status: doing
milestone: M9
depends: ["0156"]
---

## Goal

A web developer adds Raycast extensions to their own page with a few lines:
`mount(element, { extension: "raycast/extensions/<name>" })` (and a
`<blast-extension>` custom element wrapping it) loads the extension by URL,
runs it in the cross-origin sandbox, and draws the views with default,
themeable styles, or hands views to the page's own renderer.

## Context

- Decision 0013 (almostnode cross-origin sandbox) and 0014. The working code
  is the demo: `examples/browser-demo/` (`client.ts` host/controller wiring,
  `source.ts` GitHub fetch, `bundles.ts`, `capabilities.ts`, `keyboard.ts`,
  `runtime-port.ts`, `launch.ts`, `demo.css`). Extract the reusable host
  into `packages/web` (`@blastlauncher/web`, browser-only exception noted in
  its README; typecheck under `tsconfig.browser.json`) and make the demo a
  consumer of it. Keep the demo's look and e2e green.
- First write `docs/decisions/0015-web-embedding.md` (≤ 60 lines): who hosts
  the sandbox origin (the embedder self-hosts the sandbox files from the
  package, with blast.yukai.dev's sandbox allowed only for demos), what the
  embedding page can and cannot reach, which capabilities the package
  answers by default (storage, clipboard with permission, open.url) and how
  the page overrides them. Stop and report in Handoff if the extraction
  shows the decision does not hold.
- API: `mount(el, {extension | source, command?, sandboxUrl, root?: boolean,
  handlers?, render?: (view, input) => void, theme?})` returns
  `{close(), input()}`; `root: true` uses the engine root view (0156).
- Move, do not copy: shared code the demo also uses (bundler, installer,
  runtime port, capabilities) lives once in `packages/web` and the demo
  imports it from there.
- `release:build` publishes it with the other packages; add its files to
  the tarball smoke.

## Acceptance

- [ ] `docs/decisions/0015-web-embedding.md` exists and `check:workflow` passes.
- [ ] A new `examples/web-embed/index.html` (≤ 40 lines of page code) mounts
      one fixture extension; an e2e (headless Chromium, like
      `example:browser-demo:e2e`) loads it and asserts a rendered row and a
      primary action.
- [ ] `bun run example:browser-demo:e2e` and `bun run site:e2e` still pass
      (the demo moves onto the package in 0163; here it may keep its client).
- [ ] `bun run release:build` emits `@blastlauncher/web`.
- [ ] `bun run verify` passes.

## Out of scope

- A framework wrapper (React/Vue), CDN hosting changes, demo UI redesign.

## Handoff

```
Branch/commit: t3/extract-web-package @ 7d7865c
Verify: bun run verify — passed (format, lint, typecheck, compat, protocol, mac-fixtures, workflow, tests)
Done:
- Added decision 0015 defining the browser-only boundary, sandbox hosting, capability defaults, and overrides.
- Added @blastlauncher/web with browser installer/bundler extraction, mount(), default handlers, theme support, and <blast-extension>.
- Added examples/web-embed/index.html and included @blastlauncher/web in release builds and tarball smoke expectations.
Not done / risks:
- The existing browser demo was not migrated to consume the new package; its bespoke client remains in place.
- Browser e2e commands could not run because .cache/ms-playwright is absent in this worktree.
- mount currently establishes the sandbox iframe and root controller/default rendering, but extension bundle/port wiring remains to be connected for a full live extension session.
```
