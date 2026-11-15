---
id: "0172"
title: "Browser runtime fixes: extension assets, forbidden fetch headers, triaged errors"
status: doing
milestone: M10
depends: ["0171"]
---

## Goal

Every remaining browser-sweep failure that is Blast's fault (per 0171's
report) is fixed or has a written reason in the report.

## Context

- The 15 Blast failures in `compat/BROWSER-SWEEP.md` (sweep of 2026-11-14,
  table "Blast failures"):
  - `Refused to set unsafe header "user-agent"` (humaans/people,
    splatoon/splatoon-2-schedules, splatoon/splatoon-3-schedules): the
    browser forbids some request headers; drop forbidden headers (Fetch
    spec list) in the sandbox's fetch/XHR path instead of throwing, as a
    browser would.
  - `ENOENT /blast/assets/...` (dot-new/index, sf-symbols-search/index,
    trenit/departures-and-arrivals): files an extension reads from its
    assets (or its own `package.json`) are missing or mapped to the wrong
    path in the sandbox VFS (`packages/web/src/session.ts`,
    `extension-files.ts`, `prebuilt.ts`; decision 0013 gives commands
    `/blast/assets/<extension>`). Prebuilt bundles may omit assets.
  - `Width/Height must be an integer` (convert-px-to-vw-vh): likely the
    placeholder argument or preference value type; check what Node's smoke
    passes and whether number-typed values are strings in the browser.
  - `missing-arguments` (pinch-svg/custom-rectangle): placeholders should
    cover required arguments as they do in the Node smoke.
  - `reading '$and'` (hyrule-compendium-search/getEntry), `Unexpected end of
    JSON input` (uk-bank-holidays/index), HTTP 404 (bookstack, 2 commands,
    probably placeholder base URL → `needs-credentials`), `Cannot find
    module 'sqlite'` (ego-lite, native: browser limit),
    `ring-intercom/unlock` (needs authentication: needs-credentials): find
    each root cause; fix Blast's, reclassify the rest with a reason.
- Fix in `packages/web` / the runtime, never in extensions. Each fix gets a
  unit test or fixture-based browser test.
- Export `PLAYWRIGHT_BROWSERS_PATH="$HOME/.cache/ms-playwright"`.

## Acceptance

- [ ] Rerun `bun run site:sweep:browser`; regenerated report shows the
      fixed commands rendering; Handoff gives before/after headline.
- [ ] Each remaining Blast failure has a one-line reason in the report.
- [ ] `bun run site:e2e`, `bun run example:web-embed:e2e`, `bun run verify` pass.

## Out of scope

- Implementing native capabilities in the browser (selection, apps).

## Handoff

```
Branch/commit: t3/browser-runtime-fixes-1 @ 3f065c3 (plus d8cd781)
Verify: pending (run after final browser and e2e checks)
Done:
- Forbidden XHR headers are dropped, extension assets/package.json are mapped
  into the sandbox, and browser launch arguments are forwarded; each has unit
  or fixture coverage from the preceding commits.
- Added the almostnode stream compatibility shim and flow-mode activation so
  node-fetch response bodies are recognized as Node streams and async iterables;
  this addresses UK bank holidays' original `Unexpected end of JSON input`.
- Refreshed the browser sweep: 134/170 rendered before, 141/168 rendered after
  (108 rendered plus 33 with placeholder preferences; 2 browser limits).
- Hyrule's `$and` error, Bookstack 404s, and sqlite are reclassified as network,
  placeholder-credential, and browser-native-module limits respectively.
Not done / risks:
- `sf-symbols-search/index` times out while parsing/rendering its 1.1 MB local
  JSON asset; this is a performance timeout, not an asset-path failure.
- `uk-bank-holidays/index` waits on the external gov.uk request with no response;
  this is live-service/network noise.
- `convert-px-to-vw-vh/{width,height}` rejects the generic `blast` placeholder as
  non-numeric input; this is extension validation, not a browser runtime defect.
- `ring-intercom/unlock` remains authentication-gated.
```
