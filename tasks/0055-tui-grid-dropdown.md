---
id: "0055"
title: "TUI Grid and search-bar dropdown accessory"
status: doing
milestone: M4
depends: ["0053"]
---

## Goal

`bun run tui fixtures/extensions/grid index` renders the Grid as rows of
`columns` cells with section headers and empty view, arrow keys move in two
dimensions, and both List and Grid show their `searchBarAccessory` dropdown,
which the user can open and change.

## Context

- Read `docs/tui.md` and `packages/tui/src/{view.ts,app.tsx}` (List rendering,
  selection, filtering, action panel from tasks 0052/0053).
- Put Grid code in its own module (e.g. `packages/tui/src/grid.ts` for the pure
  scene→cells layout, rendering in `grid.tsx`). Keep the `app.tsx` change to
  the dispatch on the active view's root type: task 0054 (Form) edits the same
  app in parallel, so keep shared-file edits small.
- Grid: `columns` (default 5) per row, a section's own `columns` overrides it.
  A cell shows the `content` as a glyph/short text (image source name or
  `{ color }`) above title/subtitle; `aspectRatio`, `fit` and `inset` are
  ignored (record this). Selection, `selectedItemId`, `onSelectionChange`,
  filtering, throttle, Enter primary action and Ctrl-K reuse the List logic:
  extract shared helpers rather than copying them.
- ←/→ move within a row, ↑/↓ move by column across rows and sections.
- Dropdown accessory (`List.Dropdown` / `Grid.Dropdown` inside the
  `searchBarAccessory` Slot): show the current value's title next to the search
  bar; Ctrl-P opens a filterable option list (sections and items), Enter sends
  the `onChange` event with the value, Esc closes. The runtime owns the value
  (`value`/`onChange` like form fields).
- Tests via `@opentui/react/test-utils`: `fixtures/extensions/grid` (cells,
  2-D movement, Enter action, empty view) and the List dropdown in
  `fixtures/extensions/list-extras` (Ctrl-P, choose "beer" → navigationTitle
  becomes "drink beer"). Note: dropdown items repeat item titles, so wait on
  specific props, not on a bare title string.
- Update `docs/tui.md` (keys table and a Grid note).

## Acceptance

- [ ] Grid test: 3 cells in one row, → then Enter runs the second cell's
      action; filtering to nothing shows the empty view.
- [ ] Dropdown test: List and Grid accessories change navigationTitle.
- [ ] Pure tests for the cell layout (columns, section overrides, movement).
- [ ] `bun run verify` passes.

## Out of scope

- Form (0054), image rendering, runtime or protocol changes.

## Handoff

Filled in by the worker when finishing:

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
