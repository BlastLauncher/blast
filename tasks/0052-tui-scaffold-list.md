---
id: "0052"
title: "TUI scaffold: bun run tui, List rendering, selection, filtering"
status: review
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

- [x] `bun run tui fixtures/extensions/hello-list index` renders and is usable
      (describe what you saw in Handoff).
- [x] Unit tests for `sceneToView` filtering/selection; test-renderer tests as
      above; Bun-only code confined to `packages/tui`.
- [x] `bun run verify` passes.

## Out of scope

- Action panel overlay, navigation push/pop, Detail, toasts/HUD/alerts (0053).
- Form and Grid (0054). Images (render a text glyph placeholder).

## Handoff

```
Branch/commit: t3/tui-scaffold-list @ 143ef391f5d7365a96b267be77b5ad55248c944c (implementation; handoff follows)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok) in 62.6s
Done:
- Added Bun-only OpenTUI package, host-backed session lifecycle, and root tui script.
- Pure sceneToView resolves active Navigation entries, List sections/items/accessories/empty/loading states, action Slots and unsupported placeholders. Case-insensitive substring filtering covers title/subtitle/keywords and preserves order; extensions with handlers own filtering, with a 200 ms trailing throttle.
- Selection follows selectedItemId, notifies onSelectionChange, scrolls into view and drives the primary action. Esc/Ctrl-C shuts down the child and removes the bundle.
- Six new tests cover pure conversion plus real hello-list/list-extras test-renderer frames, typed search, arrow/Enter action dispatch (clipboard broker record), throttling, controlled selection and clean exit. Full gate: 492 pass, 0 fail. CLI/architecture docs updated; no runtime imports or API-surface changes.
- Real PTY: ran bun run tui fixtures/extensions/hello-list index; saw title, search, three fruits, apple highlighted and key footer. Down highlighted banana; typing cher left cherry highlighted; Esc restored the terminal and exited 0.
Not done / risks:
- Action panel, navigation controls, Detail, feedback, Form/Grid and images remain out of scope; privileged effects remain denied by default. Test renderer may emit React act warnings for asynchronous session snapshots; assertions pass.
- npm view confirmed @opentui/core and @opentui/react at 0.6.6, pinned exactly: native terminal rendering and React binding required by decision 0007. Reused existing React 19.3.1 and @types/react 19.3.0 (types latest confirmed via npm view); host/protocol are workspace dependencies. node_modules grew from 189M to 219M (du -sh). peer=false keeps web-tree-sitter, ws and react-devtools-core uninstalled; real PTY and headless rendering work without them (lockfile contains resolution metadata only).
- Not pushed; independent review remains with the orchestrator.
```
