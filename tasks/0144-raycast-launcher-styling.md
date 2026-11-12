---
id: "0144"
title: Style the browser demo after cmdk's Raycast example
status: todo
milestone: M8
depends: []
---

## Goal

The browser demo (root launcher, actions panel, and pushed extension views)
looks and moves like a Raycast window, using the visual language of cmdk's
own Raycast example as the reference, in both light and dark.

## Context

- Reference (MIT, Paco Coursey): `website/styles/cmdk/raycast.scss` and
  `website/components/cmdk/raycast.tsx` in `pacocoursey/cmdk`. Fetch only those
  into `.cache/cmdk-src` (gitignored), e.g.
  `git clone --depth 1 --filter=blob:none --sparse https://github.com/pacocoursey/cmdk.git .cache/cmdk-src`
  then `git -C .cache/cmdk-src sparse-checkout set website/styles/cmdk website/components/cmdk`.
  Adapt values (sizes, radii, spacing, Radix gray 1–12 scale, keyframes);
  do not copy the file wholesale. Credit it in one CSS comment.
- Code: `examples/browser-demo/root-launcher.tsx` (cmdk root + separate
  actions `<Command>`), `demo.css` (all demo styling, also list/grid/form/
  detail views rendered by `client.ts`), `index.html`.
- Traits to match: one framed window (~750px wide, 12px radius, 1px gray6
  border, layered shadow; dark: gray2 surface with the one-shot border
  shine); borderless 15px search input; 1px separator under the input that
  becomes the animated loader while loading (replaces the current spinner
  in the input row, `#status` keeps its text/`data-error` for e2e);
  40px items, 8px radius, 20px icons, muted subtitle, right-aligned muted
  accessory/type label, gray4 selection; 12px muted group headings; 40px
  footer: left grayscale extension icon + title, right "Open Command ↵ │
  Actions ⌘K" with 20px kbd chips; actions panel as a 320px popover anchored
  bottom-right above the footer with its search input at the bottom.
- Pushed views (hello-list, Nano Snake detail, forms, grids) live in the same
  window frame and footer, so they must look consistent, not like a second app.
- Keep every selector and `data-*` hook `site-e2e.ts` relies on, or update
  `site-e2e.ts` in the same commit.

## Acceptance

- [ ] Screenshots at 1280×800 in light and dark, saved under
      `.cache/browser-demo/shots/` (not committed): root launcher, root with
      a query, actions panel open, hello-list pushed, Nano Snake running,
      a launch in progress (loader visible). Plus root at 390×844.
      List their paths in Handoff.
- [ ] Selected item title and accessory text contrast ≥ 4.5:1 in both themes
      (state the measured ratios in Handoff).
- [ ] `prefers-reduced-motion: reduce` disables the shine, loader sweep and
      item transitions.
- [ ] No horizontal scroll at 390px wide; the window becomes full-bleed there.
- [ ] `bun run site:e2e` (Chromium) passes; the Firefox lane passes too
      (`bun run site:e2e -- --browser firefox`, in the Playwright Docker image
      `mcr.microsoft.com/playwright:v1.58.0-noble` if headless Firefox will
      not start on the host).
- [ ] No new dependencies.
- [ ] `bun run verify` passes.

## Out of scope

- Changing launcher behaviour, search ranking, or catalog data.
- Raycast brand assets, logos, or fonts that are not freely licensed.
- The TUI and the macOS menu-bar host.

## Handoff

Filled in by the worker when finishing:

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
