---
id: "0204"
title: Landing page current for alpha.10, and polished on mobile
status: doing
milestone: M20
depends: []
---

## Goal

https://blast.yukai.dev/ states the current release and install commands, and
reads cleanly at 390 px and 1440 px in light and dark.

## Context

- Page: `examples/browser-demo/landing.ts` (HTML and CSS in one template),
  shared header in `site-chrome.ts`, build in `site.ts`, assertions in
  `site.test.ts`, browser checks in `site-e2e.ts` (`--screenshots <dir>`).
- npm now: `latest` = `3.0.0-alpha.10`; `next` = a canary from `main`.
  README.md:73 and docs/quickstart.md:24 already say so.
- Stale or wrong today (seen on the live site, 2026-11-27):
  1. Hero pill reads `3.0.0-alpha.9` (landing.ts:493).
  2. Install block uses `@next` (landing.ts:551-553), which now installs a
     canary; the note under it (landing.ts:555) says prereleases are under
     `next`, not `latest`. Plain `npm install @blastlauncher/engine` is right.
  3. The version is hardcoded in several places, so it goes stale each release.
- Polish issues seen in screenshots: 4. 390 px: install commands are clipped at the right edge with no scroll or
  wrap; code tabs wrap onto two lines; the NDJSON block is clipped. 5. 390 px: a pink band sits between the proxy notice and the demo search field. 6. 1440 px: the demo iframe leaves ~70 px of empty gradient below the palette;
  size the frame to the palette (or vice versa) so it does not look unfinished. 7. "How it works" leaves a wide empty right column next to its heading and
  paragraph at 1440 px.
- New since alpha.9 and worth one line on the page, not a section: embedder
  protocol 2 sends one full view and then small patches (`session.view.patch`,
  decision 0020). The NDJSON sample already shows it.
- Keep the design language from 0181/0182 (typography, colours, dot grid,
  hero player). This is a polish pass, not a redesign.

## Acceptance

- [x] The release version appears in one constant used by the landing page;
      `site.test.ts` asserts the page shows `3.0.0-alpha.10` and no `@next`
      in install commands, and fails if README.md or docs/quickstart.md name a
      different `latest` version.
- [x] Install commands use the plain package names (`latest`); the note says
      `@next` is the canary from `main`.
- [x] Items 4-7 fixed. Before/after screenshots at 390 and 1440 px, light and
      dark, from `bun run site:e2e -- --screenshots <dir>` (or a scratch
      script outside the repo), listed in Handoff with their paths.
- [x] No horizontal page scroll at 390 px (`document.documentElement.scrollWidth
      <= 390`), checked in `site-e2e.ts`.
- [x] `bun run verify` passes.

## Out of scope

- The demo app (`root.ts`, `demo.css` beyond the iframe sizing), docs pages,
  the TUI recording, new sections or new dependencies.
- Deploying the site; it deploys from `main`.

## Handoff

Filled in by the worker when finishing:

```
Branch/commit: t3/landing-polish @ 51563aad
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 33.9s (1300 pass, 1 skip, 0 fail across 178 files); plus `bun run site:e2e -- --proxy-notice --screenshots /private/tmp/blast-0204-after` (chromium, pass)
Done:
- Extracted `releaseVersion` (`3.0.0-alpha.10`) in `examples/browser-demo/landing.ts` for the hero pill and install note, updated install commands to plain package names (`latest`) with the `@next` canary note, and added one sentence for embedder protocol 2 (`session.view.patch`).
- Fixed 390 px mobile layout in `landing.ts`: stacked install command labels above commands, kept all 6 code tabs on one line, wrapped `<pre>` / NDJSON code blocks cleanly (`word-break: break-all` for NDJSON), and kept `.facts` values baseline-aligned.
- Fixed the invalid nested `:has()` rule in `examples/browser-demo/demo.css` (`:root:not(:has(.demo-bar))`) so `--bar-height: 0px` applies inside the 390 px embed iframe (eliminating the pink band above the search input), added symmetric embed `#app` padding (`24px`) at desktop, and sized `.browser iframe` to `524px` (plus a bottom border on `.proxy-notice`).
- Turned the "How it works" intro into a 2-column `.tech-intro` grid at desktop matching `.split` below it.
- Updated `examples/browser-demo/site.test.ts` (version, plain package install commands, `README.md` / `docs/quickstart.md` consistency check) and `examples/browser-demo/site-e2e.ts` (390 px horizontal overflow check and 390/1440 px light/dark screenshots).
- Screenshots (390 px & 1440 px, light & dark):
  - Before: `/private/tmp/blast-0204-before/landing-390-light.png`, `/private/tmp/blast-0204-before/landing-390-dark.png`, `/private/tmp/blast-0204-before/landing-1440-light.png`, `/private/tmp/blast-0204-before/landing-1440-dark.png`
  - After: `/private/tmp/blast-0204-after/landing-390-light.png`, `/private/tmp/blast-0204-after/landing-390-dark.png`, `/private/tmp/blast-0204-after/landing-1440-light.png`, `/private/tmp/blast-0204-after/landing-1440-dark.png`
Not done / risks: None. `bun run verify` and `site:e2e --proxy-notice` (Chromium) passed; Firefox lane and live deployment not run.
```
