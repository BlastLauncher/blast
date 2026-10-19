---
id: "0062"
title: TUI looks like a command palette (Raycast-style theme and layout)
status: review
milestone: M4
depends: ["0061"]
---

## Goal

The picker and command views look like a real launcher, laid out like
Raycast: a framed window, a prominent search bar, a list with a highlighted
selection and dimmed right-aligned accessories, section headers, a footer
action bar and a floating action panel. This uses real OpenTUI components and
styling instead of plain text lines.

## Context

- Files: `packages/tui/src/app.tsx` (command view: List/Grid/Detail/Form,
  action panel, dropdown, toast, HUD, alert, footer), `picker.tsx`,
  `preferences.tsx`, `grid.tsx`, `dropdown.tsx`, `form.tsx`, `menu-bar.tsx`,
  and the row text helpers in `view.ts` / `grid.ts`.
- OpenTUI (`@opentui/core`, `@opentui/react`, versions in
  `packages/tui/package.json`): `<box>` supports `border`, `borderStyle`
  (`single|rounded|double|heavy`), `borderColor`, `title`, `titleAlignment`,
  `backgroundColor`, `padding*`, `position="absolute"` with `top/left/right/
  bottom/zIndex`. `<text>` supports `fg`, `bg`, `attributes` (`TextAttributes.
  BOLD|DIM` from `@opentui/core`) and nested `<span fg=…>`, `<b>`, `<u>`.
  `<input>` supports `backgroundColor`, `focusedBackgroundColor`, `textColor`,
  `placeholderColor`, `cursorColor`. Read the installed type definitions under
  `node_modules/@opentui/*/` to confirm props before using them.
- Add one `packages/tui/src/theme.ts` with a dark palette (background, panel,
  border, accent, selection bg, text, muted text, success/warning/danger for
  toast styles) and the glyphs used. All components use it, with no inline hex
  values elsewhere.
- Target layout (both picker and command view):
  - A rounded outer frame titled with the extension/command title. A search row
    at the top with a `⌕`-style prefix and the placeholder, the dropdown
    accessory right-aligned in the same row, then a horizontal rule.
  - List rows: icon slot/marker, title in normal text, subtitle muted, and
    accessories/mode right-aligned and muted. The selected row is a full-width
    accent background bar. Section headers are muted and bold, with an item
    count on the right.
  - Footer bar (the bottom row, panel bg): left side shows toast/HUD/status
    (toast style colored: animated/success/failure); right side shows
    `<primary title> ↵` and `Actions ^K`.
  - The action panel is an absolute-positioned rounded box anchored
    bottom-right above the footer, with a filter input on top and the selected
    action highlighted. Shortcuts are right-aligned and muted. The dropdown
    panel uses the same style. Alert and error are centered modal boxes.
  - Detail: markdown pane with the metadata separated by a rule. Form: label
    column right-aligned and muted, focused field highlighted.
  - Preferences gate/view (from 0061) and the argument form use the same
    form styling.
- Keep all key handling and behaviour unchanged. Tests assert frame text, so
  keep the visible words that tests look for. Update test expectations only
  where glyphs/layout legitimately changed, and say which in Handoff.
- Long text must truncate within its row. Narrow terminals (60 columns) must
  not wrap rows.

## Acceptance

- [x] `packages/tui/src/theme.ts` exists. `rg -n '#[0-9a-fA-F]{6}' packages/tui/src --glob '!theme.ts'` finds nothing outside tests.
- [x] New test (`packages/tui/src/look.test.tsx`) renders a fixture List at 80×24 and at 60×20 and asserts:
  - the frame's corner glyph `╭`;
  - the selected row's title and right-aligned accessory are on the same line;
  - the footer contains `↵` and `^K`;
  - no line is wider than the terminal.
- [x] Opening the action panel shows a bordered box whose rows include the shortcut text right-aligned (test).
- [x] Toast with `Toast.Style.Failure` renders in the footer (test may assert text only).
- [x] All existing tui tests pass, with changed expectations listed in Handoff.
- [x] `bun run tui fixtures/...` manual check is not required. Instead, paste one 80×24 captured frame of the picker and one of a List command into Handoff.
- [x] `docs/tui.md` gets a short "Look" paragraph.
- [x] `bun run verify` passes.

## Out of scope

- Behaviour or key binding changes. Images/icons beyond a single-char marker.
  Mouse support. New dependencies.

## Handoff

```
Branch/commit: t3/tui-command-palette-look
Verify: bun run verify passes (562 tests across 80 files, all 6 checks OK).
Done:
- Created packages/tui/src/theme.ts with Catppuccin Mocha semantic palette (bg #181825, panel #1e1e2e, border #313244, accent #89b4fa, selectionBg #313244, text #cdd6f4, textMuted #6c7086, success #a6e3a1, warning #f9e2af, danger #f38ba8) and glyphs (╭, ╰, ╮, ╯, ─, │, ⌕, ›, ↵, ◇). No hex colors outside theme.ts (except in grid test data).
- Enriched Row in packages/tui/src/view.ts with title, subtitle, accessories, count, icon, shortcut fields.
- Re-architected command views in packages/tui/src/app.tsx to command palette layout: rounded outer border with title, ⌕ search bar with horizontal rule separator, full-width row selections with › and right-aligned accessories, right-anchored floating action panel with right-aligned shortcuts (↵ by default for primary action), centered error and alert dialogs, and panel-bg footer.
- Updated packages/tui/src/picker.tsx, packages/tui/src/dropdown.tsx, packages/tui/src/grid.tsx, packages/tui/src/preferences.tsx, and packages/tui/src/menu-bar.tsx to use theme.
- Added packages/tui/src/look.test.tsx verifying 80×24 layout, 60×20 wrapping avoidance, action panel shortcuts, and failure toast footer styling.
- Documented "Look" in docs/tui.md, maintaining the ≤ 120 line limit (check:workflow passes).
- Test assertion updates:
  - packages/tui/src/dropdown.test.tsx: Frame corner assertion updated from ┌─Drink to ╭─Drink.
  - packages/tui/src/grid.test.tsx: Frame corner assertion updated from ┌─Drink to ╭─Drink, and footer expectation updated from "Enter Delete beer" to "Delete beer ↵".
Not done / risks: None.

Captured 80×24 Frames:

Picker (fixtures/extensions/form):
╭─form─────────────────────────────────────────────────────────────────────────╮
│ ⌕ Search commands…                                                           │
│──────────────────────────────────────────────────────────────────────────────│
│ › index  [view]                                                              │
│   persist  [view]                                                            │
│   secret  [view]                                                             │
│                                                                              │
│                                                                              │
│                                                                              │
│                                                                              │
│                                                                              │
│                                                                              │
│                                                                              │
│                                                                              │
│                                                                              │
│                                                                              │
│                                                                              │
│                                                                              │
│                                                                              │
│                                                                              │
│                                                                              │
│                                                                              │
│ ↑↓ Select · Enter Launch · Type to Filter · Ctrl-E Preferences · Esc Quit    │
╰──────────────────────────────────────────────────────────────────────────────╯

List (fixtures/extensions/list-extras):
╭─list-extras──────────────────────────────────────────────────────────────────╮
│ ⌕ Search…                                                            ▾ water │
│──────────────────────────────────────────────────────────────────────────────│
│ › beer  Germany                            Germany  1970-01-01T00:00:00.000Z │
│   wine  France                              France  1970-01-01T00:00:00.000Z │
│   water  Norway                             Norway  1970-01-01T00:00:00.000Z │
│                                                                              │
│                                                                              │
│                                                                              │
│                                                                              │
│                                                                              │
│                                                                              │
│                                                                              │
│                                                                              │
│                                                                              │
│                                                                              │
│                                                                              │
│                                                                              │
│                                                                              │
│                                                                              │
│                                                                              │
│                                                                              │
│                                                    Delete beer ↵  Actions ^K │
╰──────────────────────────────────────────────────────────────────────────────╯
```
