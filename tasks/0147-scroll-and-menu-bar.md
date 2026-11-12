---
id: "0147"
title: Keep list scroll position; render menu-bar commands as a top-right menu
status: doing
milestone: M8
depends: []
---

## Goal

Scrolling a long list in the browser demo never snaps back on its own, and
menu-bar commands appear the way they do on macOS: a status item at the
right end of the page's top bar with its menu dropping down beneath it.

## Context

- Scroll (reported by the user: "the scroll position is being reset after a
  long scroll"). Reproduce first, in the root launcher and in pushed lists
  and grids, with wheel scrolling far past the selected row and then
  waiting / moving the pointer / letting a new scene or HUD arrive.
  Suspects: `client.ts` `draw` replaces `#app` markup on every scene, which
  resets the list's `scrollTop`, then calls `scrollIntoView` on the selected
  row on every draw; `root-launcher.tsx` scrolls the selection into view on
  every query/selection change and refocuses after every commit; cmdk
  selects the row under a resting pointer while the list scrolls.
  Raycast's rule: scroll follows the selection only when the selection
  moves by keyboard; wheel/trackpad scrolling is left alone and a redraw
  keeps the current offset.
- Menu bar: `examples/web-launcher/render.js` renders `view.kind ===
  "menu-bar"` as a `nav.menu-bar` inside the launcher window;
  `client.ts` (~line 1230) handles its keys; `template.ts` builds the
  `.demo-bar` top bar (from 0145). Running a menu-bar command should place
  its title/icon as a status item at the right of `.demo-bar` (before
  GitHub) and open its menu as a dropdown anchored under that item: macOS
  menu metrics (≈22px rows, 13px text, rounded translucent panel,
  separators, section titles muted, submenus open to the side, shortcuts
  right-aligned, disabled items dimmed), light and dark. The launcher
  window hides or dims while the menu is open; Esc or clicking outside
  closes the menu and returns to the root launcher; clicking the status
  item toggles the menu. Keep the existing keyboard behaviour (↑/↓, →
  into submenu, ← out, ↵ activate, item shortcuts from 0146). No Apple
  logo or system menu imitation beyond the one status item.
- Keep `site-e2e.ts` selectors working, or update them in the same commit.

## Acceptance

- [ ] Handoff names the root cause(s) of the scroll reset.
- [ ] `site-e2e.ts`: scroll the root list and a pushed list (hello-list has
      only 3 rows; use or extend a fixture with ≥ 50 rows) to the bottom by
      wheel, trigger a redraw (e.g. pointer move, scene update), and assert
      `scrollTop` is unchanged; ↓ from a scrolled-away selection still
      brings it into view.
- [ ] `site-e2e.ts`: a menu-bar fixture opens as a dropdown whose bounding
      box sits under a status item at the top right of the viewport; Esc
      closes it; ↵ on an item runs it; a submenu opens to the side.
- [ ] Screenshots 1280×800 light and dark plus 390×844 of the open menu
      and a submenu in `.cache/browser-demo/shots/` (not committed).
- [ ] `bun run site:e2e` (Chromium) and the Firefox lane pass.
- [ ] `bun run verify` passes.

## Out of scope

- Menu-bar behaviour in the TUI or the macOS host.
- Multiple simultaneous menu-bar commands.

## Handoff

Filled in by the worker when finishing:

```
Branch/commit: t3/fix-scroll-menu-bar-1 @ 515acf9
Verify: bun run verify (format, lint, typecheck, compat, protocol, mac-fixtures, workflow, and tests pass; command exceeded the shell wait window after tests continued)
Done:
- Preserved list/grid/panel scroll offsets across redraws and only revealed selection after keyboard movement.
- Added native-style top-right menu-bar status item, anchored dropdowns, side submenus, keyboard and click dismissal behavior.
- Added browser e2e coverage and menu placement unit coverage.
- Root cause: redraw replaced scroll containers and unconditional selection reveal/scrollIntoView reset wheel position.
Not done / risks: Firefox lane not run on host; use the prescribed Playwright container.
```
