---
id: "0149"
title: Fill the viewport, restore the root on return, and show launch progress
status: review
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

- [x] `site-e2e.ts`: at 820×1180 and 390×844, `document.scrollingElement.
      scrollHeight <= innerHeight` on the root and in a pushed list.
- [x] `site-e2e.ts`: scroll the root list down, select a row far below the
      fold, open it, press Esc → the same row is selected and its
      `scrollTop` is within 4px of before; same with the Back button.
- [x] `site-e2e.ts`: right after ↵ on a command, the loading stage with the
      command title and a stage text is visible within 100 ms, and the
      loader line has a running animation.
- [x] Screenshots (iPad portrait, iPad landscape, phone; a launch in
      progress light and dark) in `.cache/browser-demo/shots/`, listed in
      Handoff.
- [x] `bun run site:e2e` (Chromium) and the Firefox lane pass.
- [x] `bun run verify` passes.

## Out of scope

- Making launches faster.
- The showcase section (0151) and Raytyping (0150).

## Handoff

```
Branch/commit: t3/3fa5bdee @ e77b41f (code); this Handoff commit follows it
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok)
Done:
- Height: body uses 100dvh (iOS vh is the toolbar-hidden viewport, the empty
  scroll); the window clamps to the viewport so short windows never scroll;
  touch tablets get a full-height window; the bar honours safe-area insets.
- Return: the root list's scrollTop is kept across unmount and restored in a
  layout effect; recents re-sort only on the next query change, so the opened
  row does not jump to Recent under the visitor.
- Launch: the stage draws in the same task as ↵/click (it used to wait for the
  bundle fetch), with an accent 2px sweep continued across redraws, a pulsing
  icon, stage text and an elapsed hint after 2 s; reduced motion shows a still
  line. A failed launch keeps the stage with the error and a Back/Esc key.
- site-e2e: viewport checks (820x1180, 1180x820, 390x844, 1180x560) on the
  root and a pushed list; Esc and Back restore selection, scrollTop and the
  row's position; stage visible on the first frame after ↵ (<100 ms) with
  title, stage text and a running sweep. Each check failed with its fix
  reverted. Chromium and Firefox (Docker, playwright v1.58.0-noble) pass.
- Shots in .cache/browser-demo/shots/ of the main checkout:
  0149-ipad-portrait.png, 0149-ipad-landscape.png, 0149-phone.png,
  0149-launch-light.png, 0149-launch-dark.png, 0149-launch-error.png
Not done / risks:
- Headless Chromium cannot reproduce iOS vh; the 1180x560 check is the one
  that fails without the CSS fix. Not checked on a real iPad.
- Pre-existing flake (also 1 in 3 on HEAD before this change): 0147's
  expectScrollKept on the root fails when ↓ reveals a row 5px under the list
  top (tolerance 4px). Left alone; worth its own task.
- site:e2e fixes ports 4175/4176, so parallel worktrees collide; Nano Snake
  hits the unauthenticated GitHub API and fails while rate-limited.
- The stage now shows "Starting…" where it said "Starting prebuilt bundle…".
```
