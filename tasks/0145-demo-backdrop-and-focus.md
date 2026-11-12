---
id: "0145"
title: Demo page backdrop, way back to the landing page, and launcher focus fixes
status: review
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

```
Branch/commit: t3/fix-demo-backdrop-focus @ 7d626e5
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 121.5s
Done:
- Demo bar (Blast mark → landing page, "Browser demo · alpha", one-line
  explanation, GitHub) over a quiet warm/cool wash + fading dot grid, light
  and dark; one line at 390px (note hidden), no horizontal scroll.
- Bug 1 + bug 2 share one cause: cmdk refocuses its input with
  getElementById(<its useId>) when the highlighted row changes, falling back
  to its tabindex=-1 list. We overwrite the input id with #root-search, so
  the lookup always missed and the list took focus: keys stopped reaching
  the input (after returning to the root the old query is still there, so
  the first key changes the highlight) and :focus-visible ringed the list.
  A row mousedown also focused the list directly (tabindex=-1).
  Fix: cmdk lists hand focus back to their input (Tab still skips them);
  mousedown inside #app never takes focus except on text controls, labels
  and Detail text; the root restores the caret after every commit.
- Extension views left focus on <body> (open by click, row click, closed
  action panel or alert): draw() now focuses #search (#action-search when
  the panel is open) when a redraw dropped focus. The early-typed-keys flush
  writes the value directly because a redraw never overwrites a focused field.
- site-e2e: bar link, row press (no list outline, focus stays), Esc/back
  button/⌘K then typing, closing ext actions, Tab ring. Verified the
  Esc check fails without the cmdk fix. site.test asserts both links.
- Chromium site:e2e pass; Firefox lane (Docker playwright:v1.58.0-noble) pass.
  Shots: .cache/browser-demo/shots/ (1280×800 light/dark, 390×844 light/dark;
  root, hello-list, actions).
Not done / risks:
- Footer nit: hello-list sets navigationTitle="hello-list" explicitly, so
  the footer shows it, as intended; views without one already show the
  command title via fallbackTitle (covered in client-core tests). No change.
- Firefox lane depends on unauthenticated GitHub API (Nano Snake); one run
  hit the 60/h limit and passed after reset.
- Firefox: preventDefault on mousedown suppresses :active on pressed buttons.
```
