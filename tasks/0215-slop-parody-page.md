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

- [x] `buildSite` writes `www/slop/index.html`; a test asserts it.
- [x] `siteHeaderHtml` renders a `Slop` link to `/slop/` on landing, docs and slop pages.
- [x] The slop page has no external `src`/`href` requests except links.
- [x] `bun run verify` passes.

## Out of scope

- Changing the real landing copy or design.

## Handoff

```
Branch/commit: task/0215-slop-parody-page @ 4f753c5a
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 41.7s
Done:
- `examples/browser-demo/slop.ts`: self-contained parody page (gradients, fake stats, testimonials, pricing, FAQ), real header, links back to the real landing.
- `buildSite` writes `www/slop/index.html`.
- `siteHeaderHtml` adds a `Slop` nav link (visible on mobile too) on landing, docs, and slop.
- Tests: slop page content/no external loads, landing+docs nav link, build output.
- Review round 1 (Gemini 4 Neon): WCAG contrast stops, forced-colors fallback, marquee duplicate hidden from AT and wrapped under reduced motion, announcement landmark, clearly fictional company names, copy polish, real gradient border.
Not done / risks: no new dependencies. The site smoke/e2e do not visit /slop/.
```
