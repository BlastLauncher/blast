---
id: "0189"
title: Demo on the deployed proxy, policy notice, sweep and catalog refresh
status: review
milestone: M15
depends: ["0187", "0188"]
---

## Goal

blast.yukai.dev's demo sends sandbox network traffic through the deployed
proxy (`https://blast-proxy.yukai.dev/v1`), tells visitors plainly where that
traffic goes and what the policy is, and the browser sweep shows which
commands now render, with the catalog updated to match. Closes #102.

## Context

- Proxy: `packages/cors-proxy` (README, `docs/decisions/0017-sandbox-network-proxy.md`).
  It accepts only `Origin: https://blastlauncher.github.io` (the production
  sandbox). Option: `fetchProxy` in `@blastlauncher/web` (task 0188; see
  `packages/web/README.md`).
- Site build: `examples/browser-demo/site.ts` (`--site-origin`,
  `--sandbox-url`), page template `template.ts`, demo client `client.ts`
  (`sandboxOptions` is shared by every session and prewarm, so `fetchProxy`
  belongs there), landing `landing.ts` (embeds the demo; its line under the
  frame starts "Live: unmodified extensions…"). Production flags in
  `.github/workflows/site.yml`. Add `--fetch-proxy <url>` (default: none, so
  local builds and e2e behave as today) and pass the production URL in
  `site.yml`.
- **Notice (user's requirement):** visible without scrolling or clicking on the
  demo page and on the landing's demo frame, short and plain: requests made by
  extensions in this demo go through our proxy at Cloudflare; it does not log
  or store anything; do not enter secret keys, tokens or private data. Link to
  a policy section (a short "Network proxy" section in the demo/landing docs
  page under `/docs/`, or the proxy's own `GET /` page) and to the Worker
  source. Keep it one line plus a link; match the existing site styles.
  Only show it when the build has a `fetchProxy`.
- Sweep: `bun run site:sweep:browser` (`examples/browser-demo/browser-sweep.ts`)
  runs the sandbox on 127.0.0.1, which the production proxy refuses. Add a
  sweep option that starts a local `Bun.serve` running `handleRequest` from
  `@blastlauncher/cors-proxy` with real `fetch` upstream, a no-op rate
  limiter and `ALLOWED_ORIGINS` = the local sandbox origin, and mounts with it
  as `fetchProxy`. This script may use the network (it writes to `.cache/`
  and regenerates `compat/browser-sweep.json` / `BROWSER-SWEEP.md`).
  Never change the proxy's own rules to make the sweep pass.
- Catalog: `bun run example:browser-demo:catalog` (`scripts/browser-catalog.ts`)
  derives exclusions from the sweep. Commands previously dropped for CORS:
  `hyrule-compendium-search/getEntry`, `gradle-plugins/index`, `jisho/search`,
  `leetcode/daily-challenge`, `scrapbook/view-recent-posts`,
  `workflowy-inbox/view`. Report in Handoff which now render and which still
  fail and why. Regenerate generated files; never hand-edit `compat/`.
- UI task: before/after screenshots of the demo page and landing frame
  (Playwright, saved under `.cache/`, attach paths in Handoff; the
  orchestrator puts them in the PR).

## Acceptance

- [x] `site:build --fetch-proxy https://blast-proxy.yukai.dev/v1` writes a demo
      that mounts every session (and prewarm) with that `fetchProxy`; without
      the flag nothing changes. Unit test for both.
- [x] Notice visible on the demo page and the landing frame when the flag is
      set, absent otherwise (test), with links to the policy and source.
- [x] `site.yml` builds with the production proxy URL.
- [x] Sweep with the local proxy rerun; regenerated `compat/BROWSER-SWEEP.md`,
      `compat/browser-sweep.json` and catalog committed; Handoff lists the six
      commands' outcomes and the overall rendered count before/after.
- [x] `bun run site:e2e` and `bun run verify` pass.

## Out of scope

- Changes to `packages/cors-proxy` or `@blastlauncher/web` behaviour.
- Deploying anything or calling the production proxy (the orchestrator checks
  production after merge).

## Handoff

```
Branch/commit: t3/demo-proxy-notice @ 9272436fe3d625a4809c07ff1f24843a8e585f83 (implementation)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok)
Done:
- Added --fetch-proxy to site builds and the production workflow; mount and prewarm share it.
- Added conditional Cloudflare notice, policy/source links and responsive space for wrapped text.
- Added --local-proxy sweep and --retry-network catalog options; regenerated reports/catalog.
- Tested enabled/disabled builds, local adapter origin checks and production-host refusal;
  site:e2e and site:e2e --proxy-notice run with offline fixtures and a mocked clipboard.
- Screenshots: .cache/0189-before-demo.png, .cache/0189-after-demo.png,
  .cache/0189-before-landing.png, .cache/0189-after-landing.png,
  .cache/0189-before-landing-frame.png, .cache/0189-after-landing-frame.png.
Not done / risks:
- No deployment or production proxy requests; no new dependencies.
- Local proxy sweep: 174 commands in 108.6s; 130 rendered (110 + 20 placeholders),
  versus previous 141 (108 + 33 placeholders) of 170. Catalog: 174 commands,
  92 extensions, 63 exclusions. Measurements include live upstream variability.
- Now render: gradle-plugins/index, jisho/search, leetcode/daily-challenge.
- Still fail: hyrule-compendium-search/getEntry: upstream HTTP 404, followed by
  undefined.split (report labels placeholder launches needs-credentials);
  scrapbook/view-recent-posts: HTTP 403; workflowy-inbox/view: HTTP 401 with placeholders.
- Previously rendered CodePen, Parcel and v0 placeholders now receive HTTP 401;
  Keeper receives 403, Mealie placeholder destinations receive 502, and Hyrule
  broadSearch receives 404. Remaining failures include unsupported Brotli in
  the sandbox and the previously tracked number-argument/SF-symbol limits.
- Bun upstream fetch uses decompress:false so forwarded encoding headers match
  the raw bytes. Worker and web package behavior are unchanged.
```
