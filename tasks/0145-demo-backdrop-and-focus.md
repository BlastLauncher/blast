---
id: "0145"
title: Demo page backdrop, way back to the landing page, and launcher focus fixes
status: doing
milestone: M8
depends: []
---

## Goal

A visitor on `/demo/` can tell at a glance they are trying Blast in a demo
and can get back to the landing page; the launcher window sits on a
demonstration backdrop; and keyboard focus never strands outside the search
input.

## Context

- Pages: `examples/browser-demo/template.ts` (`demoPage`), `site.ts`
  (`landing`, links use `siteOrigin`), `demo.css`, `root-launcher.tsx`,
  `client.ts` (root mount/unmount, `draw`, keyboard handling), and
  `examples/web-launcher/render.js` (pushed views).
- Backdrop: a quiet, original "desktop" behind the 750px window (soft
  gradient or subtle pattern, light/dark), plus a slim top bar with the Blast
  mark linking to the landing page (`/`), a "Browser demo · alpha" label, a
  one-line explanation (Raycast-compatible extensions running in a sandboxed
  tab), and a GitHub link. Reuse the landing page's mark and accent
  (`#ff6338`). No Raycast or Apple logos, wallpapers, or menu-bar imitation.
- Focus bugs seen by the user:
  1. Clicking a command row puts a focus outline around the list container
     (`#root-options` / cmdk list), which is distracting.
  2. After a command is opened and the user goes back (Esc or the back
     button), focus is not in the root search input; they must click it
     before typing. Same after closing the ⌘K panel or an alert.
     Raycast keeps the caret in the search field: mouse-down on rows, list
     background and footer buttons must not steal focus, and every return to
     the root (and every pushed view render) focuses its search input.
- Nit from 0144 review: the pushed-view footer shows the raw navigation title
  (e.g. `hello-list`); show the command title ("Hello List") when the view
  has no explicit navigation title.
- Keep `site-e2e.ts` selectors working, or update them in the same commit.

## Acceptance

- [ ] `site-e2e.ts` covers: clicking a root row shows no outline on the list
      container (computed `outline-style` is `none`, `document.activeElement`
      is `#root-search`); open hello-list, press Esc, then type → the root
      query changes without a click; open hello-list, click the back button,
      then type → same; open/close ⌘K → typing goes to `#root-search`.
- [ ] Tab still reaches real controls with a visible `:focus-visible` ring.
- [ ] The demo page shows the top bar with a link to the landing page (and
      the landing page still links to the demo); the e2e asserts the link.
- [ ] Screenshots at 1280×800 light and dark plus 390×844 in
      `.cache/browser-demo/shots/` (not committed): root, hello-list,
      actions open. At 390px the bar stays one line and no horizontal scroll.
- [ ] `bun run site:e2e` (Chromium) and the Firefox lane pass.
- [ ] `bun run verify` passes.

## Out of scope

- Restyling the launcher window itself (done in 0144).
- Landing page redesign beyond keeping its demo link.

## Handoff

Filled in by the worker when finishing:

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
