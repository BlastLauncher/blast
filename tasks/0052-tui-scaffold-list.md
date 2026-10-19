---
id: "0052"
title: "TUI scaffold: bun run tui, List rendering, selection, filtering"
status: doing
milestone: M4
depends: []
---

## Goal

`bun run tui <extensionDir> <command>` opens an interactive terminal UI that
runs the command through the host API and renders its `List` scene: sections,
items, accessories, empty view, loading state; arrow keys move the selection,
typing filters, Enter runs the selected item's primary action, Esc/Ctrl-C quits.

## Context

- Read `docs/decisions/0007-terminal-client.md` first (Bun-only package,
  in-process host API, one renderer per node type, headless tests), then
  `docs/architecture.md` (scene conventions, `Slot` children, `Navigation`
  root) and `docs/capabilities.md`.
- New package `packages/tui` (`@blastlauncher/tui`, conventions in AGENTS.md)
  with `@opentui/core` and `@opentui/react` pinned via `npm view` (0.6.6 at
  planning time). `bunfig.toml` has `peer = false`: confirm OpenTUI does not
  need its optional peers (`web-tree-sitter`, `ws`, `react-devtools-core`)
  for this scope. Measure `du -sh node_modules` before/after; justify in
  Handoff. Root script `"tui": "bun packages/tui/src/main.tsx"`.
- Host API: `bundleCommand`, `startCommand`, `session.scenes`,
  `session.sendEvent`, `createBroker`, `createHeadlessHandlers`,
  `createStorageHandlers` (see `packages/host/src/cli.ts` for how `blast run`
  wires them; reuse, don't copy, by extracting a small shared helper into
  host if needed). The TUI never imports `packages/runtime`.
- Scene → view: keep a pure `sceneToView(scene, uiState)` (selection, search
  text) separate from OpenTUI components so most logic is unit-testable
  without a terminal. Unknown node types render a visible placeholder.
- Filtering: when the List has no `onSearchTextChange` handler and
  `filtering !== false`, filter client-side by title/subtitle/keywords
  (case-insensitive substring is fine; record the rule) keeping section order
  unless `filtering.keepSectionOrder` says otherwise; with a handler, send the
  search text as an event instead (throttle honoured if `throttle`).
  Selection follows `selectedItemId` when set; `onSelectionChange` fires.
- Primary action: the first `Action*` inside the item's `actions` Slot
  (or the List's own `actions`) — dispatch its `onAction`/`onSubmit` handler.
  Action panel UI is task 0053.
- Tests: OpenTUI's test renderer (`@opentui/react/test-utils`) driving the
  `fixtures/extensions/hello-list` and `list-extras` fixtures: frame contains
  items, typing filters, arrow+Enter dispatches the action (assert via the
  broker/capability record), Esc exits cleanly with the session shut down.
- Docs: a short "Terminal client" section in `docs/cli.md` (how to run, keys).

## Acceptance

- [ ] `bun run tui fixtures/extensions/hello-list index` renders and is usable
      (describe what you saw in Handoff).
- [ ] Unit tests for `sceneToView` filtering/selection; test-renderer tests as
      above; Bun-only code confined to `packages/tui`.
- [ ] `bun run verify` passes.

## Out of scope

- Action panel overlay, navigation push/pop, Detail, toasts/HUD/alerts (0053).
- Form and Grid (0054). Images (render a text glyph placeholder).

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
