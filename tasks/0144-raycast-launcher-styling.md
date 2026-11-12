---
id: "0144"
title: Style the browser demo after cmdk's Raycast example
status: doing
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
Branch/commit: t3/restyle-raycast-launcher @ c8557d4 (round 2, on top of round 1 bf1a5db)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 125.2s
Done:
- demo.css rewritten (not layered) on a Radix gray1–12 token scale adapted from cmdk's
  Raycast example: 750px/12px/gray6 window, dark gray2 surface with a masked one-shot
  border shine + top shine, borderless 15px input, 1px separator that becomes the loader
  sweep (main[data-loading=true]), 40px single-line rows (title + muted subtitle, right
  type label + "Needs …" badge), 12px muted headings, 40px footer, 320px bottom-right
  actions popover with input at the bottom; grid/form/detail/menu/prefs/toast/HUD/alert
  restyled on the same tokens. Phones (≤600px): full-bleed, 16px input, no subtitles.
- Markup: root footer = Blast mark + "Blast" left, "Open Command ↵ │ Actions ⌘K" right
  ("Clear Esc" only when status ≠ Ready); extension footer = grayscale extension icon +
  navigation title (aria-hidden, repeats h1); #status gains data-stage and is visually
  hidden only when Ready (text and data-error unchanged for e2e). Pushed views put a Back
  chip (data-footer="back") and the command chip left of #search; h1 is visually hidden,
  still a heading. Spinners removed: the loader line replaces them (root data-loading
  now follows the status stage; drawStarting uses the same frame/footer).
  Extension action search gets a "Search actions…" placeholder.
- Screenshots (1280×800 unless noted), all opened and reviewed, under
  .cache/browser-demo/shots/{name}-{light,dark}.png: root, query, actions,
  hello-list, hello-actions, loading (loader caught mid-sweep), snake (Nano Snake
  running), phone (390×844 root, scrollWidth 390), plus browser-grid,
  browser-fields, browser-preferences, menu.
- Contrast (WCAG relative luminance; computed colours confirmed in-page):
  light selected title #171717 on #ededed 15.31:1, selected accessory #646464 on
  #ededed 5.05:1 (Radix gray11 #6f6f6f would be 4.29:1, so it was darkened), badge on
  selected #646464/#e2e2e2 4.57:1; dark selected title #ededed on #282828 12.59:1,
  selected accessory #a0a0a0 on #282828 5.64:1, badge on selected #a0a0a0/#343434 4.76:1.
- Reduced motion (emulated, computed): shine/ring/loader animation-name none, item
  transition-duration 0s. Chromium site:e2e pass; Firefox lane pass in
  mcr.microsoft.com/playwright:v1.58.0-noble (image deleted afterwards).
Not done / risks:
- mac-fixtures: passes once `bun install --frozen-lockfile` has run; round 1's failure
  was only the missing install, no other error reproduced.
- Firefox in Docker: bind-mounting the worktree failed (Bun mkdir EEXIST on the
  .cache deps symlink; nested bind mounts rejected by OrbStack), and native esbuild
  is needed for prebuild. Recipe that works: mount worktree and deps read-only, tar the
  tree (no node_modules/.cache) into /tmp/w in the container, copy deps into
  /tmp/w/.cache/browser-demo/deps, `npm i -g bun@1.4.4`, `bun install --frozen-lockfile`,
  then `bun run site:e2e -- --browser firefox`.
- demo.css diff is large (~1290 lines after fmt) because the old file was replaced
  rather than patched; most of it is formatter-expanded declarations.
- Nano Snake draws its board in the search text; that is the extension's own design.
```
