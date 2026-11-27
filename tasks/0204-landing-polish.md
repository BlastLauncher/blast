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
- Polish issues seen in screenshots:
  4. 390 px: install commands are clipped at the right edge with no scroll or
     wrap; code tabs wrap onto two lines; the NDJSON block is clipped.
  5. 390 px: a pink band sits between the proxy notice and the demo search field.
  6. 1440 px: the demo iframe leaves ~70 px of empty gradient below the palette;
     size the frame to the palette (or vice versa) so it does not look unfinished.
  7. "How it works" leaves a wide empty right column next to its heading and
     paragraph at 1440 px.
- New since alpha.9 and worth one line on the page, not a section: embedder
  protocol 2 sends one full view and then small patches (`session.view.patch`,
  decision 0020). The NDJSON sample already shows it.
- Keep the design language from 0181/0182 (typography, colours, dot grid,
  hero player). This is a polish pass, not a redesign.

## Acceptance

- [ ] The release version appears in one constant used by the landing page;
      `site.test.ts` asserts the page shows `3.0.0-alpha.10` and no `@next`
      in install commands, and fails if README.md or docs/quickstart.md name a
      different `latest` version.
- [ ] Install commands use the plain package names (`latest`); the note says
      `@next` is the canary from `main`.
- [ ] Items 4-7 fixed. Before/after screenshots at 390 and 1440 px, light and
      dark, from `bun run site:e2e -- --screenshots <dir>` (or a scratch
      script outside the repo), listed in Handoff with their paths.
- [ ] No horizontal page scroll at 390 px (`document.documentElement.scrollWidth
      <= 390`), checked in `site-e2e.ts`.
- [ ] `bun run verify` passes.

## Out of scope

- The demo app (`root.ts`, `demo.css` beyond the iframe sizing), docs pages,
  the TUI recording, new sections or new dependencies.
- Deploying the site; it deploys from `main`.

## Handoff

Filled in by the worker when finishing:

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
