---
id: "0079"
title: The TUI runs on the client-core controller
status: doing
milestone: M5
depends: ["0078"]
---

## Goal

`packages/tui/src/app.tsx` holds no Raycast client state of its own. It feeds
scenes and key presses into `createController` from `@blastlauncher/client-core`,
renders `controller.view()`, sends the returned events to the session, and
runs the returned `schedule`/`quit` effects. The TUI becomes the conformance
demo of the controller (decision 0009, consequences).

## Context

- Controller: `packages/client-core/src/controller.ts` and its tests. Read
  its handoff notes in git log (`git log --grep 0078`) for known differences
  from the current TUI:
  - a pointer `select` input;
  - `clearSearch` is one-shot;
  - selection resets on a new list/view;
  - dropdown query forwarding.
- Today `app.tsx` (about 760 lines) keeps search, selection, action panel,
  dropdown, menu path, pagination, HUD timing and pop/clear requests in
  `useState`/`useRef`. Replace that with one controller per session:
  - map OpenTUI keys to `ControllerInput`:
    - ↑↓←→ to `move`;
    - Enter to `primary`;
    - Ctrl-K to `openActions`;
    - Esc to `back` / `closeActions`;
    - Ctrl-P to `openDropdown`;
    - typing to `search` / `actionsQuery` / `dropdownQuery`;
    - Ctrl-T/Ctrl-Y to `toastAction`;
    - other keys to `{ type: "key" }`, for shortcuts;
  - execute `schedule` effects with `setTimeout` (clear them on unmount) and
    call `tick`;
  - call `onQuit` for a `quit` effect.
    Keep the existing rendering components and the look from 0062. They should
    render from the view model instead of the scene where the view model has
    the data.
- Forms stay on `form.tsx` for field editing (the controller exposes form
  focus only). Do not move form editing into the controller in this task.
- Platform: pass `"Linux"` unless `process.platform` is darwin or win32 (map
  those to macOS/Windows). This is only for shortcut labels and matching.
- If the controller lacks something the TUI needs, add it to client-core with
  a test, and keep the controller JSON-serializable.
- All TUI tests must pass. Where expectations change because of the
  documented controller differences, update them and list each one in
  Handoff with the reason. Do not loosen assertions to make them pass.

## Acceptance

- [ ] `rg -n "useState|useRef" packages/tui/src/app.tsx` shows only
      renderer-related state (scroll refs, the controller instance, the view
      snapshot). Handoff lists what remains and why.
- [ ] TUI tests pass; changed expectations are listed and justified.
- [ ] `bun run corpus:tui-smoke` is not required (it needs network), but
      `bun test packages/tui` passes five times under `--randomize`.
- [ ] `bun run verify` passes.

## Out of scope

- Form editing in the controller, `blast serve` views (0080), visual changes.

## Handoff

```
Branch/commit: task-0079-tui-controller @ SHA
Verify: VERIFY
Done:
- app.tsx drives one `createController` per session: OpenTUI keys map to
  ControllerInput, events go to the session, `schedule` effects run on
  setTimeout (cleared on unmount/session change) and return via `tick`, `quit`
  calls onQuit. Grid, dropdown and menu-bar components render from the view
  model; the list/action rows render from view.rows / view.actions.
- client-core (small, tested): `ControllerResult.handled` (a `key` input matched
  a shortcut, so the TUI keeps preventDefault and the search input does not
  also eat the press); `dropdown.tooltip` in the view (panel title); an
  extension-controlled `selectedItemId` now reports the requested selection
  and waits for the echo (the old TUI did this; the controller would have
  silently ignored arrows). docs/architecture.md table wording updated.
- Remaining useState/useRef in app.tsx and why: `view` (controller snapshot),
  `scene` (only so form.tsx, which keeps field editing, gets its Form node),
  `failure` (runtime-exit error overlay, not client state); refs for the two
  scroll boxes, the schedule timer set, onQuit/onExit callbacks, and
  `quitRequested`/`settled` (quit-once and clean-exit lifecycle).
- No existing TUI expectation was changed; `bun test packages/tui` passes 5x
  with --randomize.
Not done / risks:
- Behaviour differences: a clean runtime exit now quits when the HUD hides
  (controller timing) instead of one extra HUD window after exit; HUD duration
  honours the scene's own durationMs unless hudDurationMs is passed; Ctrl-P
  without a dropdown is a no-op (it used to leave the search unfocused).
- No pointer `select` wiring (the TUI has no mouse handling).
```
