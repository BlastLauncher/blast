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
Branch/commit: t3/fix-web-package-mount @ 9dc18fb (round 2; round 1 was t3/extract-web-package)
Verify: bun run verify — PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 121.5s
Done:
- mount() runs an extension end to end (session.ts): fetch (extension-files.ts), install, esbuild-wasm bundle, almostnode sandbox at sandboxUrl, runtime port handshake, client-core controller, scenes drawn by the built-in renderer (default-renderer.ts over the shared render.js, themeable --blast-* CSS) or options.render, input back through the port, capabilities via default or page handlers (handlers.storage/clipboard/openUrl/capability); root:true shows the engine root view over the manifest's commands and returns to it when a command closes.
- Moved, not copied: browser-bundle/install, preference-fields, dependency-policy (host now imports the last two from @blastlauncher/web subpaths), runtime-port, launch, source, bundles, capabilities, bundle-config, extension fetch (new extension-files.ts, which the demo's fetchFiles now calls), render.js (web-launcher and the demo import it from packages/web), the sandbox page, and the sandbox shims (packages/web/sandbox/). The demo's client.ts wiring is otherwise unchanged (import paths plus the fetch call).
- Decision 0015 rewritten in the standard shape (Status/Decision/Why/Consequences).
- examples/web-embed e2e (bun run example:web-embed:e2e): headless Chromium, loopback only, mounts hello-list in a cross-origin sandbox, asserts 3 rows, filters to banana, runs the primary action (clipboard gets "banana"), then repeats with root:true.
- Fixed a stale step in the demo e2e (first Esc clears the search; a second one leaves the command): it failed identically on main b8df4a1. Fixed release:smoke, which also failed on main (client-core missing from the slim install); it now installs client-core and web and imports web in Node.
E2E outputs (PLAYWRIGHT_BROWSERS_PATH=$HOME/.cache/ms-playwright):
- example:web-embed:e2e -> {"pass":true,"rows":3,"copied":"banana","root":true}
- example:browser-demo:e2e -> {"pass": true, "live": false, "coldStartMs": 4312, ...}
- site:e2e -> {"pass":true,"browser":"chromium","site":"http://127.0.0.1:4175/","sandbox":"http://127.0.0.1:4176/blast-sandbox/"}
- release:build emits blastlauncher-web-0.0.0-dev.tgz; release:smoke passes.
Not done / risks:
- Embedders must build and serve the assets (almostnode.mjs, almostnode-full.mjs, esbuild.mjs, esbuild.wasm, blast-sources.json); the e2e builds them with the demo's buildBrowserAssets. Packaging them from the package is 0163.
- No prebuilt-bundle path (bundles.json) and no preference form in mount(): missing required preferences fail with a message; the demo keeps both until 0163. Backgrounded command.launch is accepted but not run, as in the demo.
- One full-suite run printed a single test failure that I could not reproduce (two later full runs, including verify, were green).
```
