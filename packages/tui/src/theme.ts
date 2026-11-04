// The reference palette. `NO_COLOR` (https://no-color.org) turns every value
// into `undefined`, which OpenTUI renders with the terminal's own default
// foreground/background instead of emitting SGR colours.
export const noColor = (process.env.NO_COLOR ?? "").trim() !== "";

// OpenTUI treats an absent colour as the terminal default; the cast keeps the
// palette's declared type plain `string` for every synchronous caller.
const paint = (value: string): string => (noColor ? (undefined as unknown as string) : value);

export const theme = {
  colors: {
    background: paint("#181825"),
    panel: paint("#1e1e2e"),
    border: paint("#45475a"),
    borderFocused: paint("#89b4fa"),
    accent: paint("#89b4fa"),
    selectionBg: paint("#313244"),
    selectionFg: paint("#cdd6f4"),
    text: paint("#cdd6f4"),
    textMuted: paint("#6c7086"),
    success: paint("#a6e3a1"),
    warning: paint("#f9e2af"),
    danger: paint("#f38ba8"),
    orange: paint("#fab387"),
    magenta: paint("#f5c2e7"),
    purple: paint("#cba6f7"),
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

/**
 * Resolve a Raycast tint name (see `iconView` in client-core) to the palette.
 * Raw CSS colours are passed through; anything unrecognised stays muted.
 */
export function iconTint(tint: string | undefined): string {
  switch (tint) {
    case "blue":
      return theme.colors.accent;
    case "green":
      return theme.colors.success;
    case "yellow":
      return theme.colors.warning;
    case "orange":
      return theme.colors.orange;
    case "red":
      return theme.colors.danger;
    case "magenta":
      return theme.colors.magenta;
    case "purple":
      return theme.colors.purple;
    case "primary-text":
      return theme.colors.text;
    case "secondary-text":
      return theme.colors.textMuted;
  }
  if (tint && /^(?:#|rgba?\(|hsla?\()/i.test(tint)) return noColor ? theme.colors.text : tint;
  return theme.colors.textMuted;
}
