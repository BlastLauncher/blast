---
id: "0146"
title: Bind every shortcut the browser demo shows
status: todo
milestone: M8
depends: ["0145"]
---

## Goal

Every keyboard shortcut the browser demo displays (root, ⌘K panels,
extension actions, footers, forms, grids, menu-bar views) actually fires in
the page, as close to Raycast's behaviour as a browser allows, and the few a
browser will not give up are labelled honestly.

## Context

- Key routing: `examples/browser-demo/client.ts` (the document `keydown`
  handler), `keyboard.ts` (`keyInputFromEvent`), client-core's
  `packages/client-core/src/shortcut.ts` (matching `Keyboard.Shortcut`s for
  extension actions), `root.ts` (`rootActionModel`, root action shortcuts),
  `root-launcher.tsx`, `examples/web-launcher/render.js`.
- Start with an audit: list every shortcut rendered anywhere in the demo and
  whether pressing it works today (Chromium and Firefox). Known suspects:
  shortcuts shown in the root ⌘K panel (only arrows/↵/Esc are handled
  there); extension action shortcuts while the action panel is open or the
  search input has focus; `⌘↵` secondary action; `Keyboard.Shortcut.Common`
  shortcuts; Nano Snake's `⌘R restart`; Ctrl+N/P and ⌘K inside pushed views.
- Platform: Raycast uses ⌘ on macOS. Off macOS (`navigator.platform` /
  `userAgentData`), map `cmd` to Ctrl both when matching and when displaying,
  and keep `Keyboard.Shortcut` `{ macOS, Windows }` pairs working.
- Browser limits: call `preventDefault` early (capture phase) so combos like
  ⌘R, ⌘D, ⌘P, ⌘S, ⌘F, ⌘[ go to the extension. Combos the browser never
  delivers (⌘T, ⌘W, ⌘N, ⌘Q, ⌘L, ⌘Tab, Ctrl+Tab) must not be silently dead:
  show them with a muted "browser reserved" hint (title/tooltip) and keep the
  action reachable through the action panel. Keep a single table of
  reserved combos in `keyboard.ts`.
- Never hijack keys while the user types in a text field, except the
  shortcuts Raycast also takes there (modifier combos, ↵, Esc, ↑/↓, ⌘K).
- Depends on 0145 (focus stays in the search input); build on it.

## Acceptance

- [ ] Handoff contains the audit table: shortcut, where shown, before, after.
- [ ] Unit tests in `keyboard.test.ts` (and client-core if touched) cover:
      platform mapping of `cmd`, reserved-combo detection, and matching an
      action's `{ macOS, Windows }` shortcut on both platforms.
- [ ] `site-e2e.ts` presses, in Chromium and Firefox: a root ⌘K panel
      shortcut, an extension action shortcut with the search input focused
      (hello-list or a fixture), `⌘↵`/secondary action, and Nano Snake's
      restart shortcut; each asserts the visible effect.
- [ ] A reserved combo is rendered with the "browser reserved" hint.
- [ ] `bun run site:e2e` (Chromium) and the Firefox lane pass.
- [ ] `bun run verify` passes.

## Out of scope

- Global hotkeys outside the page, or browser extensions to capture them.
- Changing which shortcuts extensions declare.

## Handoff

Filled in by the worker when finishing:

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
