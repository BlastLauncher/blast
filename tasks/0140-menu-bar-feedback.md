---
id: "0140"
title: Menu-bar commands show HUD, toast and alert feedback
status: doing
milestone: M8
depends: []
---

## Goal

`showHUD`, `Toast` and `Alert` issued from a `MenuBarExtra` action appear in the
browser demo (and in the scene the other clients read), while menu navigation
keeps working.

## Context

- `packages/runtime/src/core.ts` (`load`): a `menu-bar` command is rendered as
  `withSuspense(element)` and every other mode is wrapped in
  `NavigationProvider`. `FeedbackScene` is rendered by the provider
  (`packages/runtime/src/api/navigation.ts`, inside `Navigation`), so a menu
  command currently has nowhere to put feedback: a menu item with
  `onAction={() => showHUD("...")}` dispatches (task 0139) but nothing is drawn.
- `packages/runtime/src/api/feedback.ts` `showHUD` calls `changed()`, which
  notifies `FeedbackScene`'s store and `mountScene()`. `setFeedbackMount` is only
  set for `no-view`, so wrapping the menu root in the provider is the likely
  fix; confirm `closeMainWindow` and `popToRoot` keep working.
- The browser client already renders `view.feedback.hud/toast/alert` from the
  controller view (`examples/web-launcher/render.js`), so no browser renderer
  work should be needed.
- Fixture: `fixtures/extensions/browser-modes/src/menu.tsx` (task 0139) has a
  menu with a submenu and counter items; add a feedback item there rather than a
  new fixture.

## Acceptance

- [x] A menu-bar command's `showHUD`, a failure `Toast` and an `Alert` reach the
      scene/controller view: a unit test in `packages/runtime/src/api/menu-bar.test.ts`
      (or the nearest runtime test that mounts a scene) renders a `MenuBarExtra` with
      each feedback call and asserts the `HUD`/`Toast`/`Alert` node is present next
      to the menu, not instead of it.
- [x] `bun run site:e2e` asserts a menu item's `showHUD` text in the browser and
      still passes its existing menu navigation and no-view checks; three
      consecutive runs pass.
- [x] The TUI still renders menu-bar feedback (check `packages/tui/src/app.tsx`
      and `menu-bar.tsx`); add or adjust a test only if it is broken.
- [x] `bun run verify` passes.

## Out of scope

- Menu-bar background refresh (`interval`), `LaunchType.Background` and a
  persistent menu-bar strip.
- New feedback APIs or changing HUD/toast durations.
- The six blank catalog commands: task 0141.

## Handoff

Filled in by the worker when finishing:

```
Branch/commit: t3/menu-bar-feedback @ 19a36db
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 95.9s
Done:
- Menu-bar commands now render under `NavigationProvider` in `packages/runtime/src/core.ts`; the active `Navigation.Entry` still holds `MenuBarExtra`, so menu navigation is unchanged while `FeedbackScene` and the window-request store mount.
- Added a runtime unit test that dispatches HUD, failure Toast and Alert menu actions and asserts each feedback node is a sibling of the menu; extended the process-level menu fixture/test with `showHUD`.
- The `browser-modes` menu fixture exposes HUD, failure-toast and alert actions; `site:e2e` asserts each beside the open menu and passed three consecutive runs.
- Updated the CLI tree expectation and decision 0005, architecture and TUI docs for the Navigation root.
- Kept the corpus smoke's empty-menu probe working: a menu-bar scene whose active
  Navigation entry renders no menu is still reported as an empty menu bar, with tests.
Not done / risks:
- Menu-bar background refresh (`interval`), `LaunchType.Background`, a persistent menu-bar strip and the blank catalog commands (0141) stay out of scope.
- The TUI needed no code or test change: `app.tsx` already renders `view.feedback` in the footer (and alerts over the menu); `packages/tui/src/menu-bar.test.tsx` and `app.test.tsx` pass.
- `closeMainWindow`/`popToRoot` use the same Navigation scene node as view commands; no new menu-specific test covers them, existing window/navigation tests still pass.
```
