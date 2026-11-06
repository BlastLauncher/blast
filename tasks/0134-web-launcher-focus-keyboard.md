---
id: "0134"
title: Web launcher focus, keyboard navigation and shortcuts
status: doing
milestone: M8
depends: ["0133"]
---

## Goal

The browser demo feels like a launcher. Typing never loses focus or the caret,
the keyboard works the same in every view, and action shortcuts shown in the UI
actually run.

## Context

What's broken, from orchestrator review of `examples/browser-demo/client.ts` and
`examples/web-launcher/render.js`:

1. **Focus is lost on every scene.** `draw()` replaces `app.innerHTML` on every
   controller update. The extension `#search` input is destroyed and never
   refocused (only `drawRoot()` calls `.focus()`), so after the first character
   the user types into nothing. The caret position and IME composition are lost
   as well, and the root list has the same problem with `#root-search`.
   `autofocus` does nothing for `innerHTML`.
2. **Shortcuts don't run.** Shortcuts show in the action panel
   (`row.shortcut`), but the keydown handler only knows the arrows, Enter,
   Escape and Cmd/Ctrl-K. client-core already matches shortcuts with
   `controller.input({ type: "key", key })` and returns `handled`. The TUI shows
   how to use it (`packages/tui/src/app.tsx`, `useKeyboard`). Map
   `KeyboardEvent` to `KeyInput`: `meta` is Cmd on macOS, `option` is Alt, and
   key names should match `packages/client-core/src/shortcut.ts`. Dispatch it
   before the built-in keys, and when `handled` is set, call `preventDefault`.
3. **Keys are hijacked inside form fields.** The global handler takes ArrowUp,
   ArrowDown and Enter even while a form text field is focused. In form views it
   should use the controller's form inputs instead, from
   `packages/client-core/src/form-view.ts`:
   - `focus`, `focusNext` and `focusPrev`, for Tab and Shift-Tab;
   - `setValue`;
   - `toggle`, for checkboxes;
   - `submit`, for Cmd/Ctrl-Enter.

   Keep `view.form.focusId` and the DOM focus in sync. The submit that
   Cmd/Ctrl-Enter sends goes through the controller's primary action path; check
   how the controller handles it in `form-view.ts` and `controller.ts`.

4. **Escape always leaves.** Raycast's Escape is layered:
   - close the action panel or dropdown;
   - clear a non-empty search;
   - pop the navigation stack (`view.navigation.canGoBack`);
   - only then leave the command.

   Today it always backs out of the extension. Confirm which layers the
   controller already handles on `back`, and don't duplicate them.

5. **Selection scrolling and pointer.** In extension lists, the selected row
   doesn't scroll into view; root does this with `scrollIntoView` in `drawRoot`.
   Hovering a row should not steal the keyboard selection, and clicking a row
   selects it, as it does today.
6. **Effects are dropped.** `sendInput` drops `schedule` effects, and the
   scene's effects are dropped except `quit`. Toasts and HUD therefore never
   time out, and anything else driven by `tick` never fires. Run each
   `schedule` effect with `setTimeout`, then call `controller.tick(token)` and
   post the events it returns. Clear all timers when the session stops.
7. **Grid navigation.** Left and right arrows should send `move` with
   left/right when the view is a grid.

Approach: render the frame once per view kind and patch it in place. The search
input, form inputs and action search stay the same DOM elements between draws,
with their value updated only when it differs and no focus change. Rebuilding
only the list, detail and footer is fine. Keep the renderer string-based or
move it to small DOM builders, whichever is less code, but keep `render.js`
usable by `examples/web-launcher`, its other consumer. Run that example's tests.

## Acceptance

- [ ] `bun run site:e2e` (or a new focused e2e in `examples/browser-demo/`)
      covers each of these with real key presses on the fixtures:
  - [ ] Typing "abc" into an extension search with `pressSequentially` leaves
        `#search` as `document.activeElement` holding "abc", and the list
        filters. Same for the root search.
  - [ ] A fixture action with a `shortcut` (for example Cmd-Shift-C) runs when
        pressed, and the key does not also reach the input as text.
  - [ ] In a fixture form: Tab and Shift-Tab move focus between fields,
        ArrowDown inside a text field does not change the field, Space toggles a
        checkbox, and Cmd/Ctrl-Enter submits.
  - [ ] Escape follows the order in Context 4: action panel, then search text,
        then a pushed view, then the root list.
  - [ ] Pressing ArrowDown 30 times in a long extension list keeps the selected
        row visible.
  - [ ] A toast hides after its duration. Use a fixture that shows a success
        toast, with no fake clock in the browser; the real duration is fine if it
        is short.
- [ ] Unit test: mapping `KeyboardEvent` to `KeyInput` covers Cmd, Ctrl, Alt,
      Shift, letters, digits, Enter, arrows, and the named keys `shortcut.ts`
      accepts.
- [ ] The phone (390×844) checks from 0125 and 0133 still pass, and nothing
      scrolls horizontally.
- [ ] `bun run verify` passes, and the `examples/web-launcher` tests still pass.

## Out of scope

- Rendering surfaces that aren't rendered yet (dropdown, alert, HUD, toast
  actions, rich rows, form field types) belongs to task 0135. Handle their
  keys only where the controller already exposes them.
- No changes to the client-core controller semantics. If one is needed, stop
  and write it in Handoff.
- No new dependencies.

## Handoff

Branch/commit: t3/web-launcher-focus-keyboard-1 @ 1381491
Verify: `bun run verify` not passing: existing Playwright e2e ambient typings are missing in the repository typecheck, and the new browser e2e still needs final stabilization.
Done:

- Added browser-keyboard and browser-form fixtures, wired through `site.ts --fixtures` and prebuild catalog generation.
- Added real-key browser coverage for search focus, list filtering, shortcut dispatch, pushed detail, form navigation, submission, and timed toast behavior.
- Restricted horizontal arrows to grids and vertical arrows out of forms; expanded keyboard mapping coverage.
- Sanitized the handoff so it contains no personal filesystem path.
  Not done / risks: `site:e2e` currently reaches the browser-form scene but its rendered controls need selector/runtime follow-up; no Chromium was downloaded.
