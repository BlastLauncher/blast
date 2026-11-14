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
Branch/commit:
Verify:
Done:
Not done / risks:
```
