---
id: "0181"
title: Landing page redesign — reference-book look, engine hero animation
status: doing
milestone: M12
depends: []
---

## Goal

The landing page (`examples/browser-demo/landing.ts`) looks like a beautifully
typeset reference library, and its hero is an animated diagram of the Blast
engine feeding the same view into many different host applications.

## Context

- Aesthetic (user's choice: "the coolest" library look): reference-book /
  library-catalogue styling. Think serif display type, paper and ink tones (plus
  a matching dark "night reading room" palette), fine rules, small caps,
  numbered sections ("§ 1", "Chapter I" or catalogue-card numbers), marginalia-style
  notes, index-card or catalogue-drawer motifs for the platform cards. It should
  look good, not like a costume. System font stacks only, e.g.
  `"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif` and a
  mono stack. No external requests (no web fonts, CDNs, images from elsewhere).
  Code blocks stay highly legible.
- Hero animation (replaces the static `wire-mock-card`): Blast's engine in the
  centre; animated messages travel out to several host shells, each drawing the
  same small command list. Hosts, with these labels only: **macOS app**
  (`examples/macos-launcher`, BlastKit), **Terminal / tmux** (`blast-tui`),
  **Web page** (`@blastlauncher/web` `mount()`), **Go / Python** (`blast serve`,
  NDJSON). Inline SVG and/or HTML with CSS animation only, no JavaScript.
  Under `prefers-reduced-motion: reduce` there is no animation and the diagram
  is still fully readable. Give the diagram an accessible name describing it.
- Navigation: the header and footer link to the docs on this site, which task 0180
  builds in parallel: `${origin}/docs/` ("Docs") and `${origin}/docs/quickstart/`
  (every former GitHub quickstart link). Keep Demo and GitHub links. The
  coverage and sweep receipts links stay on GitHub.
- Content is fixed. Do NOT invent APIs, features, claims or numbers. Keep
  verbatim: the `<title>` (site.yml greps it), the h1 "Raycast extensions,
  inside your app.", the hero paragraph, every code snippet string at the top of
  `landing()`, the six tabs (JavaScript, Web page, Go, Python, Swift, NDJSON),
  the install commands and version, the stats from `SiteStats`, and the tmux
  card text and link. You may rearrange, retitle sections in the library voice
  and shorten connective copy; `expectLandingSnippets` in `site.test.ts` lists
  strings that must survive.
- Keep the page pure HTML/CSS from one function, accessible (contrast ≥ 4.5:1 in
  both themes, visible focus, working tabs via keyboard), no horizontal
  overflow at 360px (`site-e2e.ts` checks this).
- Do not touch `site.ts` or any `docs-site*` file; 0180 owns them.

## Acceptance

- [x] `site.test.ts` passes, updated so it also checks the
      `/docs/` and `/docs/quickstart/` links and that no `blob/main/docs/quickstart.md` link remains.
- [x] Test: the hero has the four host labels above and a
      `@media (prefers-reduced-motion: reduce)` rule that disables its animation.
- [x] `bun run site:build && bun run site:e2e -- --screenshots .cache/landing-shots`
      passes. Put light and dark screenshots at 1280px and 360px in Handoff (paths), and look at them yourself.
- [x] No external URLs in `src=` / `@import` / `url(` in the generated page.
- [x] `bun run verify` passes.

## Out of scope

- The demo (`demo.css`, `client.ts`), the docs pages, `site.ts`.
- New copy or claims beyond the fixed content above; JavaScript on the landing page.

## Handoff

```
Branch/commit: t3/landing-library-redesign @ ce09d99 (implementation) + handoff commit
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 140.6s (1147 pass, 2 skip, 0 fail); site:build && site:e2e -- --screenshots .cache/landing-shots passed ({"pass":true,"browser":"chromium"})
Done:
- Redesigned `examples/browser-demo/landing.ts` with a reference-library / catalogue aesthetic (warm rag paper light mode, dark night reading room, system font stacks only, zero external assets, `/docs/` and `/docs/quickstart/` links, all verbatim copy/snippets/stats/tmux content preserved).
- Replaced `wire-mock-card` with accessible HTML/inline-SVG + CSS-animated `Plate I · Architecture` hero diagram (`Blast Engine` -> `macOS app`, `Terminal / tmux`, `Web page`, `Go / Python`), responsive `.mobile-rail` vertical trunk on <=700px viewports, and `@media (prefers-reduced-motion: reduce)` disabling all animations and hover motion.
- Updated `examples/browser-demo/site.test.ts` to assert `/docs/`, `/docs/quickstart/`, absence of `blob/main/docs/quickstart.md`, all 4 hero host labels/sublabels, reduced-motion CSS rule, and absence of external `src=` / `@import` / `url(`.
- Generated and verified landing screenshots at 1280px and 360px in both themes:
  - `.cache/landing-shots/desktop-light.png` (1280x3457)
  - `.cache/landing-shots/desktop-dark.png` (1280x3457)
  - `.cache/landing-shots/mobile-360-light.png` (360x6961)
  - `.cache/landing-shots/mobile-360-dark.png` (360x6961)
Not done / risks:
- Pixel-level human/image viewing of the PNG files could not be performed directly in this tool environment (`view_file` reads binary PNGs as text and `preview_status` reported `available: false`). Layout and visual properties were instead verified via `site:e2e` and a Playwright DOM/computed-style audit across `1280px` and `360px` light/dark and `prefers-reduced-motion: reduce`: 0 WCAG AA contrast violations (< 4.5:1), 0 horizontal overflow, 0 element overlaps/clipping inside `.plate`, <=1px SVG bus-to-card alignment, and disabled animations under reduced motion.
```
