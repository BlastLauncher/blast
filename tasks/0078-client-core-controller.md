---
id: "0078"
title: client-core controller — framework-free UI state machine (search, selection, action panel, dropdown, menu bar, feedback)
status: doing
milestone: M5
depends: []
---

## Goal

An embedder feeds scenes and semantic inputs into one object and gets back
the view model to draw plus the events to send to the session. All of the
Raycast client behaviour that the TUI keeps inside React state (`app.tsx`)
lives in `@blastlauncher/client-core` as a pure, tested state machine.
Embedders that are not React, and `blast serve` later (task 0080), only draw.

## Context

- Decision `docs/decisions/0009` (point 4). `packages/client-core` already has
  the pure pieces:
  - `sceneToView`, `actionRows`/`panelRows`, `rank`;
  - `gridLayout`/`gridMove`, dropdown helpers;
  - `loadMoreRequest`, `searchDispatch`, `feedbackState`;
  - `menuRows`/`menuBarView`/`menuBarStep`;
  - `matchesShortcut(platform)`.
- `packages/tui/src/app.tsx` holds the state that is missing, in
  `useState`/`useRef`: search text (and the throttle), selection, action panel
  open/stack/query/index, dropdown open/query/index, menu path, paginated-for
  count, the HUD-visible window, clear-search and pop requests, and the
  primary-action rules. Read it to learn the behaviour; do not change the
  TUI in this task (task 0079 migrates it).
- Add `packages/client-core/src/controller.ts` with
  `createController({ platform, now?, schedule? })`:
  - `scene(message)`: feed each new scene;
  - `input(action)`: semantic inputs as a discriminated union:
    - `{ type: "search", text }`;
    - `{ type: "move", direction: "up"|"down"|"left"|"right" }`;
    - `{ type: "primary" }`;
    - `{ type: "openActions" }` / `{ type: "closeActions" }`;
    - `{ type: "actionsQuery", text }`;
    - `{ type: "key", key: KeyInput }` (shortcut matching, platform-aware);
    - `{ type: "back" }`;
    - `{ type: "openDropdown" }` / `{ type: "dropdownQuery", text }` /
      `{ type: "chooseDropdown" }`;
    - `{ type: "toastAction", index }`;
    - `{ type: "alert", confirm: boolean, remember?: boolean }`;
  - `view()`: one JSON-serializable view model, with:
    - `kind` (list, grid, detail, form, menu-bar, empty);
    - title and loading;
    - search text and placeholder;
    - rows/grid with the selected id;
    - the detail;
    - the primary action title and shortcut label;
    - the action panel (open, query, rows, selected index, breadcrumb);
    - the dropdown (label, open, options, index);
    - feedback (toast, HUD visible, alert);
    - menu-bar view;
    - and requests: `quit`, `clearSearch`;
  - `subscribe(listener)` for view changes;
  - and every input or scene returns `{ events: OutboundEvent[], effects: Effect[] }`.
    Effects: `{ type: "quit" }` and `{ type: "schedule", ms, token }`. The
    controller never calls timers itself; the embedder calls
    `tick(token)` when a scheduled delay fires, which covers the throttle and
    the HUD expiry. That keeps it deterministic and testable.
  - Forms: expose `view().form` with `formFields` data and the focus id.
    Field editing stays out of scope; the next form task covers it.
- `view()` must be plain JSON (no `SceneNode` object references, only ids and
  strings), so 0080 can send it over the wire unchanged. Define its type in
  `client-core` and export it.
- Tests (`controller.test.ts`) drive realistic scenes, built with the
  existing fixture builders in client-core tests:
  - typing with and without throttle (schedule/tick);
  - ranking applied and selection kept or reset like the TUI;
  - the primary action and shortcuts per platform;
  - the action panel with a submenu breadcrumb and back;
  - dropdown choose → `onChange` event;
  - pagination once per count;
  - HUD expiry via tick;
  - alert confirm with remember;
  - toast actions;
  - menu-bar navigation;
  - clearSearch/pop requests from the scene.

## Acceptance

- [ ] `controller.ts` + `controller.test.ts` cover the list above, and
      `JSON.stringify(view())` round-trips in tests.
- [ ] `rg -n "from \"node:|react|@opentui|@blastlauncher/host" packages/client-core/src`
      prints nothing.
- [ ] TUI untouched (except none); existing tests pass.
- [ ] `bun run verify` passes.

## Out of scope

- Migrating the TUI (0079), serving views over `blast serve` (0080), form
  field editing in the controller.

## Handoff

```
Branch/commit: t3/d9043bd6 @ (this commit)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, workflow ok, test ok) in 92.6s
Done:
- packages/client-core/src/controller.ts: createController({ platform, hudDurationMs? }) with scene/input/tick/view/subscribe; ControllerView and input/effect types exported from client-core.
- controller.test.ts (17 tests): search with/without throttle, ranking + selection, shortcuts per platform, action panel submenu/breadcrumb/back, dropdown, pagination once per count, HUD tick, alert remember, toast actions, menu bar, clearSearch/pop/closeMainWindow, grid, form/detail, subscribe; view round-trips through JSON.
- TUI untouched.
Not done / risks:
- Options differ from the task text: no `now` (nothing needs a clock) and no `schedule` callback (delays come back only as effects); added optional `hudDurationMs`.
- Added input `{ type: "select", id }` for pointer embedders (not in the task list).
- view().requests.clearSearch is true only for the scene that triggered the clear; quit is sticky.
- Selection tracking resets on list change (TUI kept the previous id); Form focus is read from the scene (`focused`), no controller-side focus movement; dropdown query is also forwarded via searchDispatch (TUI filtered locally only).
- Under heavy machine load (parallel task 0077) packages/cli tests with 5s timeouts failed, also on a tree without this change; verify passes once load drops.
```
