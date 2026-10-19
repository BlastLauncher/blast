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
Branch/commit: t3/tui-command-palette-look-1
Verify: bun run verify passes (562 tests across 80 files, all 6 checks OK).
Done:
- Restored docs/tui.md from 6e14821 and formatted a concise 3-line "Look" paragraph without hex codes, keeping the document at 119 lines (≤ 120 lines required by check:workflow).
- Segmented row layout:
  - List rows in packages/tui/src/app.tsx: rendered as horizontal flex boxes with pointer, bold text title when selected, muted truncating subtitle, flex spacer, and muted right-aligned accessories, with full-width selection background on selected rows.
  - Menu-bar rows in packages/tui/src/menu-bar.tsx: segmented with pointer, bold title when selected, muted subtitle, flex spacer, right-aligned muted shortcut, and right-aligned muted submenu indicator (›).
  - Action panel rows in packages/tui/src/app.tsx: segmented with pointer, bold title when chosen, flex spacer, right-aligned muted shortcut, and right-aligned muted submenu indicator (›).
  - Picker rows in packages/tui/src/picker.tsx: segmented matching list rows with pointer, bold title when selected, muted subtitle/description, flex spacer, and right-aligned muted mode label ("Command", "No View", "Menu Bar").
- Footer styling:
  - Command view footer: primary action title in text color and key glyphs (↵, ^K) in muted color as separate spans, with toast/HUD on the left side.
  - Picker footer: single footer bar matching command view footer, with left side showing status (errors in danger color, dependency progress or launching in muted color) and right side showing segmented action spans (Launch ↵, Preferences ^E, Quit esc).
- Look verification:
  - Added captureSpans() assertion in packages/tui/src/look.test.tsx verifying the selected list item title span and subtitle span have different foreground colors.
- Test assertion updates:
  - packages/tui/src/picker.ts & packages/tui/src/picker.test.ts: exported modeLabel() and updated commandRow mode labels from [view] / [no-view] / [menu-bar] to Command / No View / Menu Bar.
  - packages/tui/src/picker.test.tsx: updated assertions checking for [view] / [no-view] to match Command / No View and segmented rows.
  - packages/tui/src/menu-bar.test.tsx: updated frame settle predicate from "More ›" to "More" due to right-alignment of the submenu pointer.
Not done / risks: None.

Captured 80×24 Frames:

Picker (fixtures/extensions/host-session):
╭─host-session─────────────────────────────────────────────────────────────────╮
│ ⌕ Search commands…                                                           │
│──────────────────────────────────────────────────────────────────────────────│
│ › navigation                                                         Command │
│   session                                                            Command │
│   no-view                                                            No View │
│   stubborn                                                           No View │
│   invalid                                                            No View │
│   env                                                                No View │
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
│                                           Launch ↵  Preferences ^E  Quit esc │
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
