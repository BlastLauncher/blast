/** OpenTUI owns terminal colour emission; this flag lets clients opt out of styling. */
export const noColor = process.env.NO_COLOR !== undefined;
const color = (value: string) => value;

export const theme = {
  colors: {
    background: color("#181825"),
    panel: color("#1e1e2e"),
    border: color("#45475a"),
    borderFocused: color("#89b4fa"),
    accent: color("#89b4fa"),
    selectionBg: color("#313244"),
    selectionFg: color("#cdd6f4"),
    text: color("#cdd6f4"),
    textMuted: color("#6c7086"),
    success: color("#a6e3a1"),
    warning: color("#f9e2af"),
    danger: color("#f38ba8"),
  },
  glyphs: {
    search: "⌕",
    pointer: "›",
    dropdown: "▾",
    enter: "↵",
    actionMod: "^K",
    dropdownMod: "^P",
    rule: "─",
    bullet: "·",
    iconPlaceholder: "◇",
    loading: "◌",
    corner: "╭",
  },
} as const;

export type Theme = typeof theme;
