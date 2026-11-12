---
id: "0149"
title: Fill the viewport, restore the root on return, and show launch progress
status: doing
milestone: M8
depends: []
---

## Goal

The demo page fills the screen on iPad and phones with no empty scroll
area, coming back from a command restores the root list exactly as it was,
and starting a command shows clear progress until its first scene.

## Context

User feedback on blast.yukai.dev:

1. "The height doesn't fill, so it leaves empty scroll at the bottom on
   iPad." Look at `demo.css` (`body`, `#app`, `.demo-bar`, the window and
   its phone/tablet breakpoints) and `template.ts`; prefer `100dvh` with a
   fallback, `viewport-fit=cover` safe-area insets, and no fixed heights
   that add up to more than the viewport. Test iPad portrait/landscape
   (820×1180, 1180×820) and phone (390×844) viewports.
2. "The selected item resets scroll position after entering a command and
   exiting." On return to the root (Esc, Back, command exit) restore the
   previous query, selected row and the list's scroll offset. The root is
   unmounted on launch (`client.ts` `rootRenderer?.unmount()`), so keep
   that state across the mount, and keep 0147's scroll rules.
3. "Show the loading indicator when starting a command because it takes
   time." `drawStarting` in `client.ts` already renders a `loading-stage`
   and the 1px loader line, but the user did not notice it. Make progress
   unmistakable from the keypress until the first scene: the loader line
   sweeping under the search field, the command's icon/title, and the
   current stage text (`status.ts` stages: fetching, installing, bundling,
   starting) with an elapsed-time hint after ~2 s. Show it immediately on
   ↵/click (no blank frame) and keep it on errors with the error text.
   Respect `prefers-reduced-motion`.

## Acceptance

- [ ] `site-e2e.ts`: at 820×1180 and 390×844, `document.scrollingElement.
      scrollHeight <= innerHeight` on the root and in a pushed list.
- [ ] `site-e2e.ts`: scroll the root list down, select a row far below the
      fold, open it, press Esc → the same row is selected and its
      `scrollTop` is within 4px of before; same with the Back button.
- [ ] `site-e2e.ts`: right after ↵ on a command, the loading stage with the
      command title and a stage text is visible within 100 ms, and the
      loader line has a running animation.
- [ ] Screenshots (iPad portrait, iPad landscape, phone; a launch in
      progress light and dark) in `.cache/browser-demo/shots/`, listed in
      Handoff.
- [ ] `bun run site:e2e` (Chromium) and the Firefox lane pass.
- [ ] `bun run verify` passes.

## Out of scope

- Making launches faster.
- The showcase section (0151) and Raytyping (0150).

## Handoff

Filled in by the worker when finishing:

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
