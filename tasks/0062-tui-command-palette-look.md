---
id: "0062"
title: TUI looks like a command palette (Raycast-style theme and layout)
status: doing
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

- [ ] `packages/tui/src/theme.ts` exists. `rg -n '#[0-9a-fA-F]{6}'
      packages/tui/src --glob '!theme.ts'` finds nothing outside tests.
- [ ] New test (`packages/tui/src/look.test.tsx`) renders a fixture List
      at 80×24 and at 60×20 and asserts:
  - the frame's corner glyph `╭`;
  - the selected row's title and right-aligned accessory are on the same line;
  - the footer contains `↵` and `^K`;
  - no line is wider than the terminal.
- [ ] Opening the action panel shows a bordered box whose rows include the
      shortcut text right-aligned (test).
- [ ] Toast with `Toast.Style.Failure` renders in the footer (test may assert
      text only).
- [ ] All existing tui tests pass, with changed expectations listed in Handoff.
- [ ] `bun run tui fixtures/...` manual check is not required. Instead, paste
      one 80×24 captured frame of the picker and one of a List command into
      Handoff.
- [ ] `docs/tui.md` gets a short "Look" paragraph.
- [ ] `bun run verify` passes.

## Out of scope

- Behaviour or key binding changes. Images/icons beyond a single-char marker.
  Mouse support. New dependencies.

## Handoff

Filled in by the worker when finishing:

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
