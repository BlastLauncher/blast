---
id: "0119"
title: Browser demo — run a Raycast extension from its URL, nothing installed
status: doing
milestone: M8
depends: ["0116", "0117", "0118"]
---

## Goal

`examples/browser-demo/` is a static page. You paste an extension URL, either
`https://github.com/raycast/extensions/tree/<ref>/extensions/<name>` or a
plain `<name>`, and the page then:

1. fetches the extension's files (jsDelivr's GitHub endpoints are CORS-enabled);
2. installs dependencies (0118);
3. bundles with esbuild-wasm (0117);
4. runs the bundle with the browser runtime (0116) inside almostnode's
   cross-origin sandbox, as in decision 0013;
5. draws it with `examples/web-launcher/render.js`, and accepts keyboard input.

## Context

- **Builds on:** the spike harness, `examples/browser-runtime/e2e.ts`. Two
  origins, the explicit almostnode patch, and Playwright with
  `PLAYWRIGHT_BROWSERS_PATH`.
- **Capabilities:**
  - The page answers `clipboard.copy` with `navigator.clipboard` and
    `open.url` with `window.open`. Everything else is denied with a typed,
    visible message.
  - The page shows a clear notice for CORS-blocked network calls and for
    native modules.
- **Commands:**
  - `bun run example:browser-demo` serves the two origins on 127.0.0.1 and
    prints the URL.
  - `bun run example:browser-demo:e2e` drives headless Chromium.
- **Network and caching:**
  - The default e2e serves extension files and npm packages from local
    fixtures through the same `fetch` interface, so it needs no network.
  - A `--live` flag runs one real walkthrough extension, `ratio-calculator`,
    from GitHub and npm.
  - Neither run is part of `bun run verify`.

## Safety (hard rules)

- Headless only.
- Never touch the real clipboard; fake the handler in the e2e.
- 127.0.0.1 servers, always closed.
- No hosting or deployment.

## Acceptance

- [ ] Default e2e: a fixture extension loaded "by URL" from local fixtures
      renders, search works, and `clipboard.copy` reaches the fake handler.
- [ ] `--live` e2e: `ratio-calculator` renders its first scene, or the
      Handoff records the exact failure.
- [ ] The README covers the trust model (decision 0013), the limits (CORS,
      `child_process`, native modules) and the run steps.
- [ ] `bun run verify` passes.

## Out of scope

- Publishing a hosted demo; a later task needs the user's go-ahead.
- Extension discovery or search.
- Persisting state across reloads.

## Handoff

```
Branch/commit: t3/fix-browser-demo-live-fetch @ cf719863963e5e2873ddb25489ae633a0721880c
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 63.5s
Done:
- Fixed the browser bundle test's global scope typing and lint-safe name while preserving the module-default assertion.
- Added pure GitHub URL parsing tests, CORS-enabled GitHub contents/raw fetching, GitHub rate-limit errors, recursive extension file loading with binary assets, local fixture manifests, and manifest-driven command selection.
- Default e2e passes search filtering and simulated clipboard handling: 1,172 ms cold start, 17,350,140 bytes.
- Live `ratio-calculator` e2e passes its first scene: 6,108 ms cold start, 17,348,198 bytes.
- Default cold-download breakdown (17,350,140 bytes): esbuild.wasm 13,979,150; Blast sources 3,346,163; almostnode 22,576; extension 2,251; npm packages 0. The largest item is esbuild.wasm; caching it between sessions or serving it precompressed would cut cold transfer.
Not done / risks:
- Cross-origin GitHub/npm entries may report zero in browser `transferSize` because the remote servers do not expose timing headers; the live total therefore represents measurable browser resources.
```
