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
Branch/commit:
Verify:
Done:
Not done / risks:
```
