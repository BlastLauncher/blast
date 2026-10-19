---
id: "0056"
title: "TUI menu-bar commands, no-view commands, pagination"
status: doing
milestone: M4
depends: ["0055"]
---

## Goal

`bun run tui` handles the remaining command shapes: `menu-bar` commands render
their `MenuBarExtra` as a navigable menu, `no-view` commands show their
feedback (toast/HUD/alert) and exit when the runtime finishes, and List/Grid
pagination loads more items when the selection reaches the end.

## Context

- Read `docs/tui.md` and `packages/tui/src/{app.tsx,view.ts,grid.ts}`.
  Fixtures: `fixtures/extensions/menu-bar` (mode `menu-bar`; Section →
  Submenu → Item with `onAction(event)`), `fixtures/extensions/pagination`
  (`index` List, `grid`, `dropdown`), `fixtures/extensions/feedback`
  (no-view commands, see its package.json).
- Menu bar: put rendering in `packages/tui/src/menu-bar.tsx` with a pure
  helper. Show `MenuBarExtra` `title`/`tooltip` as the header, Sections as
  headers, Items (title, subtitle, shortcut label) selectable with ↑/↓,
  Enter runs `onAction` with the event argument the runtime expects (check
  how `packages/runtime` builds it), → / Enter opens a Submenu, ← / Esc goes
  back. `MenuBarExtra.Item` without `onAction` is shown disabled.
- No-view: the scene has no view entry; render feedback only. When the
  session exits with code 0, quit after any HUD has shown (keep the 2.5 s
  HUD rule, but tests may shorten it via a prop). A non-zero exit shows the
  error and waits for Esc.
- Pagination: List/Grid carry `pagination` props (`pageSize`, `hasMore`,
  `onLoadMore` handler; check the scene). Send `onLoadMore` once when the
  selection reaches the last loaded item (or the last Grid row) and `hasMore`
  is true; don't resend until the item count changes. Show "Loading…" while
  `isLoading`.
- Keep `app.tsx` edits to dispatching and small hooks.
- Tests via `@opentui/react/test-utils` with those fixtures. Wait on specific
  scene props, not bare titles (dropdown items repeat titles).
- Update `docs/tui.md` (keys table plus a note for each shape).

## Acceptance

- [x] Menu-bar test: open Submenu, Enter on "Click" changes the header title.
- [x] No-view test: a feedback command shows its toast/HUD and the TUI exits 0.
- [x] Pagination tests: moving to the end of the List and of the Grid loads
      the next page exactly once per page.
- [x] `bun run verify` passes.

## Out of scope

- Real system menu bar, images, runtime or protocol changes.

## Handoff

Filled in by the worker when finishing:

```
Branch/commit: t3/menu-bar-no-view-pagination @ <filled in below>
Verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok)
Done:
- packages/tui/src/menu-bar.tsx: pure `menuRows(node, path)` + `MenuBarView`;
  MenuBarExtra title/tooltip heads the window, Sections are headers, Items
  (title/subtitle/shortcut) selectable, → / Enter opens a Submenu, ← / Esc
  closes it, Enter runs `onAction` with `{ type: "left-click" }`, no-handler
  Items render dimmed.
- app.tsx: no-view commands quit after the HUD window once the runtime exits 0
  (2.5 s rule, `hudDurationMs` prop shortens it in tests); a failed runtime
  shows an Error box and waits for Esc; main.tsx no longer races `exited` so
  the App owns exit handling. Pagination: one `onLoadMore` per item-count
  change when the selection is at the last loaded item / last Grid row.
- nodes.ts: `handlerEvent` (handler refs not stored as direct props) and
  `paginationOf`; view.ts derives the menu-bar title.
- Tests: menu-bar.test.tsx (helper + fixture), pagination.test.tsx (synthetic
  exact-once for List and Grid + fixture round trip), app.test.tsx no-view
  exit-0 and failure-path tests; docs/tui.md keys and shape notes updated.
Not done / risks: real system menu bar, images and runtime/protocol changes
out of scope (per task); a failed runtime now exits the TUI process with 0
after Esc instead of propagating the crash exit code.
```
