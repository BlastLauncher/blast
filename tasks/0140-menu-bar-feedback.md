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

- [ ] A menu-bar command's `showHUD`, a failure `Toast` and an `Alert` reach the
      scene/controller view: a unit test in `packages/runtime/src/api/menu-bar.test.ts`
      (or the nearest runtime test that mounts a scene) renders a `MenuBarExtra` with
      each feedback call and asserts the `HUD`/`Toast`/`Alert` node is present next
      to the menu, not instead of it.
- [ ] `bun run site:e2e` asserts a menu item's `showHUD` text in the browser and
      still passes its existing menu navigation and no-view checks; three
      consecutive runs pass.
- [ ] The TUI still renders menu-bar feedback (check `packages/tui/src/app.tsx`
      and `menu-bar.tsx`); add or adjust a test only if it is broken.
- [ ] `bun run verify` passes.

## Out of scope

- Menu-bar background refresh (`interval`), `LaunchType.Background` and a
  persistent menu-bar strip.
- New feedback APIs or changing HUD/toast durations.
- The six blank catalog commands: task 0141.

## Handoff

Filled in by the worker when finishing:

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
