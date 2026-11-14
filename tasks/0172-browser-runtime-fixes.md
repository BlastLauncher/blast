---
id: "0172"
title: "Browser runtime fixes: extension assets, forbidden fetch headers, triaged errors"
status: todo
milestone: M10
depends: ["0171"]
---

## Goal

Every remaining browser-sweep failure that is Blast's fault (per 0171's
report) is fixed or has a written reason in the report.

## Context

- Known so far (2026-11-09 sweep; recheck against 0171's fresh report):
  - `ENOENT … /blast/assets/<ext>/…` and `/blast/assets/package.json`
    (dot-new, sf-symbols-search, one more): files the extension reads from
    `environment.assetsPath` are missing or mapped to the wrong path in the
    sandbox VFS (`packages/web/src/session.ts`, `extension-files.ts`,
    `prebuilt.ts`; decision 0013 says commands get
    `/blast/assets/<extension>`). Prebuilt bundles may omit assets.
  - `Refused to set unsafe header "user-agent"` (2): the browser forbids
    some request headers; drop forbidden headers (Fetch spec list) in the
    sandbox's fetch/XHR path instead of throwing, as a browser would.
  - `Width/Height must be an integer`, `reading '$and'`,
    `Unexpected end of JSON input`, `The database does not exist`: find each
    root cause; fix what is Blast's, document what is not.
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
