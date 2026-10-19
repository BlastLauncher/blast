export const theme = {
  colors: {
    background: "#181825",
    panel: "#1e1e2e",
    border: "#45475a",
    borderFocused: "#89b4fa",
    accent: "#89b4fa",
    selectionBg: "#313244",
    selectionFg: "#cdd6f4",
    text: "#cdd6f4",
    textMuted: "#6c7086",
    success: "#a6e3a1",
    warning: "#f9e2af",
    danger: "#f38ba8",
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
    corner: "╭",
  },
} as const;

export type Theme = typeof theme;
