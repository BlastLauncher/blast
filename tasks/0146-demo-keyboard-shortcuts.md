---
id: "0146"
title: Bind every shortcut the browser demo shows
status: review
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

```
Branch/commit: t3/6bbe253b @ 8c03cb0
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 114.3s
Done:
- Platform from navigator (userAgentData/platform): `cmd` is ⌘ on macOS and
  Ctrl elsewhere for matching and every label (controller, root actions, ⌘K
  and ↵ footers). Was hard-coded to macOS.
- Capture-phase keydown routes modifier combos to the root/extension first and
  calls preventDefault only when one matches (⌘R, ⌘D, ⌘P… reach extensions;
  unbound combos keep their browser meaning). Text fields keep plain typing.
- client-core: action shortcuts run with the action panel open (and close it);
  MenuBarExtra.Item shortcuts fire from any open level; an empty list's
  EmptyView actions are its panel and primary (Nano Snake's ⌘R lives there).
- Root actions get ⌘O (Open on GitHub) and ⇧⌘C (Copy URL), in the list and ⌘K
  panel; Ctrl+N/P now move in pushed views too.
- `BROWSER_RESERVED` in keyboard.ts (⌘T/W/N/Q/L, ⇧⌘T/N/W, ⌘Tab, ⌃Tab, ⌃⇧Tab;
  cmd→Ctrl off macOS) renders muted with a "Browser reserved" tooltip; the
  browser-keyboard fixture gained an ⌘T action reached via the panel in e2e.
Not done / risks:
- Firefox lane run in Docker (playwright:v1.58.0-noble, Linux → Ctrl); no
  token was needed. Image deleted afterwards.
- Playwright synthesizes keys into the page, so e2e cannot prove a real
  browser delivers ⌘R; reserved-table entries are from browser docs, not e2e.
- In a Form, ⌘↵ still runs a declared second action when there is one (its
  label says ⌘↵); submit-on-⌘↵ applies only without one.
```

Audit (C = Chromium, F = Firefox; "after" is covered by e2e where marked *):

| Shortcut                                    | Where shown                   | Before                           | After                                                     |
| ------------------------------------------- | ----------------------------- | -------------------------------- | --------------------------------------------------------- |
| ↵ / ↑↓ / Esc                                | root list, ⌘K panels, footers | works                            | works                                                     |
| ⌘K                                          | root + extension footers      | works (⌘ or Ctrl on any OS)      | works, platform key and label (Ctrl+K off macOS)*         |
| ⌘O, ⇧⌘C                                     | root ⌘K panel                 | not shown, not bound             | bound in list and panel* (⌘O)                             |
| Ctrl+N / Ctrl+P                             | (Raycast convention)          | root only                        | root and pushed views*                                    |
| Extension action shortcut, search focused   | action panel rows             | works on macOS only              | works C/F*                                                |
| Extension shortcut, panel open              | action panel rows             | dead                             | runs, closes panel*                                       |
| ⌘↵ secondary action                         | action panel rows             | works on macOS only              | works C/F*                                                |
| Keyboard.Shortcut.Common / {macOS, Windows} | action panel rows             | macOS variant only               | per-platform variant (unit)                               |
| Nano Snake ⌘R restart                       | placeholder + panel           | dead (EmptyView actions ignored) | restarts, no reload C/F*                                  |
| ⌘C (CopyToClipboard default)                | action panel rows             | works on macOS only              | per platform                                              |
| Toast action shortcuts                      | toast                         | works on macOS only              | per platform                                              |
| MenuBarExtra.Item shortcuts                 | menu rows                     | dead                             | fire from any level (unit)                                |
| ⌘↵ submit                                   | form footer/panel             | ⌘ or Ctrl                        | platform key*                                             |
| ⌘T, ⌘W, ⌘N, ⌘Q, ⌘L, ⇧⌘T/N/W, ⌘Tab, ⌃Tab     | any shortcut label            | looked live, never delivered     | muted + "Browser reserved" tooltip*, reachable via panel* |
