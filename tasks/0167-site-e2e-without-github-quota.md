---
id: "0167"
title: Site e2e does not depend on GitHub's anonymous API quota
status: doing
milestone: M9
depends: []
---

## Goal

The Site workflow's browser e2e (Chromium and Firefox) no longer fails when
the shared runner exhausts GitHub's anonymous API rate limit.

## Context

- Site run 43585388419 failed in `firefox-e2e`: `site-e2e.ts` launches
  "Play Nano Snake" (`nano-games`), which is not prebuilt, so the page lists
  files through `api.github.com` (`packages/web/src/extension-files.ts`) and
  got a 403 rate limit. A rerun passed.
- Options, pick the least invasive: make that step use a command that is in
  the prebuilt index (prebuilt hits skip GitHub since 0163), or let the e2e
  serve a local copy through the existing fixture path. Do not add a token to
  the published page.

## Acceptance

- [ ] `site-e2e.ts` makes no request to `api.github.com` in the default
      (non-`--live`) run: assert it with a request listener.
- [ ] `bun run site:e2e` passes (export
      `PLAYWRIGHT_BROWSERS_PATH="$HOME/.cache/ms-playwright"`).
- [ ] `bun run verify` passes.

## Out of scope

- Changing what the live demo fetches.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
