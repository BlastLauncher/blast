---
id: "0215"
title: Parody landing page at /slop/ with a navbar link
status: doing
milestone: M23
depends: []
---

## Goal

The site ships a parody of the landing page at `/slop/` (maximum AI-slop
energy: gradients, buzzwords, fake metrics, testimonials, emoji), and the
shared header nav links to it from every page.

## Context

- Pages are rendered by `examples/browser-demo/landing.ts` and
  `docs-site.ts`; the header lives in `site-chrome.ts` (`siteHeaderHtml`).
- `site.ts` `buildSite` writes every page into `.cache/site/www`.
- Zero external requests (same as the landing); dark mode and 360px width.

## Acceptance

- [ ] `buildSite` writes `www/slop/index.html`; a test asserts it.
- [ ] `siteHeaderHtml` renders a `Slop` link to `/slop/` on landing, docs and slop pages.
- [ ] The slop page has no external `src`/`href` requests except links.
- [ ] `bun run verify` passes.

## Out of scope

- Changing the real landing copy or design.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
