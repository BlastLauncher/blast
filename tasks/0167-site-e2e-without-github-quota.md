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

- [x] `site-e2e.ts` makes no request to `api.github.com` in the default
      (non-`--live`) run: assert it with a request listener.
- [x] `bun run site:e2e` passes (export
      `PLAYWRIGHT_BROWSERS_PATH="$HOME/.cache/ms-playwright"`).
- [x] `bun run verify` passes.

## Out of scope

- Changing what the live demo fetches.

## Handoff

```
Branch/commit: t3/site-e2e-no-github-quota @ 9fa0ae9
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok)
Done:
- The ⌘R step now launches the prebuilt `browser-keyboard` fixture instead of
  the non-prebuilt `Play Nano Snake`. The fixture gained a Cmd+R "Restart"
  action, so the check still proves ⌘R reaches the command and does not reload
  the page, with no GitHub fetch. A fixtures build prebuilds 19/256 commands
  (fixtures + showcase), so no catalog command is a valid launch target there.
- `site-e2e.ts` records every request and fails at the end if any went to
  `https://api.github.com/`. Demonstrated against the old step: restoring the
  snake launch fails with the five `api.github.com/repos/raycast/extensions/
  contents/extensions/nano-games` URLs.
- `examples/browser-demo/ambient.d.ts` declares Playwright's `Request` and the
  page `request` event, so the listener typechecks.
- `bun run site:e2e` passed: `{"pass":true,"browser":"chromium",...}`.
Not done / risks:
- The firefox lane could not be exercised here (no Firefox browser in this
  environment); it runs the same fixture step, and the previous snake step used
  the same `ControlOrMeta+R`, so CI's `firefox-e2e` is the remaining check.
- The root ⌘O action still names `Play Nano Snake`; it only opens the catalog
  URL (github.com, stubbed) and never launches the extension.
```
