// The reference palette. `NO_COLOR` (https://no-color.org) turns every value
// into `undefined`, which OpenTUI renders with the terminal's own default
// foreground/background instead of emitting SGR colours.
export const noColor = (process.env.NO_COLOR ?? "").trim() !== "";

// OpenTUI treats an absent colour as the terminal default; the cast keeps the
// palette's declared type plain `string` for every synchronous caller.
import { execFileSync } from "node:child_process";

export type ThemeName = "system" | "dark" | "light" | "mono";

function systemTheme(): Exclude<ThemeName, "system"> {
  if (process.platform !== "darwin") return "dark";
  try {
    execFileSync("defaults", ["read", "-g", "AppleInterfaceStyle"], { stdio: "ignore" });
    return "dark";
  } catch {
    return "light";
  }
}

export function createTheme(colorless = noColor, name: ThemeName = "dark") {
  const resolvedName = name === "system" ? systemTheme() : name;
  const light = resolvedName === "light";
  const mono = resolvedName === "mono";
  const paint = (value: string): string => (colorless ? (undefined as unknown as string) : value);
  return {
    colors: {
      background: paint(light ? "#eff1f5" : mono ? "#111111" : "#181825"),
      panel: paint(light ? "#e6e9ef" : mono ? "#1b1b1b" : "#1e1e2e"),
      border: paint(light ? "#9ca0b0" : mono ? "#666666" : "#45475a"),
      borderFocused: paint(light ? "#1e66f5" : mono ? "#ffffff" : "#89b4fa"),
      accent: paint(light ? "#1e66f5" : mono ? "#ffffff" : "#89b4fa"),
      selectionBg: paint(light ? "#ccd0da" : mono ? "#333333" : "#313244"),
      selectionFg: paint(light ? "#4c4f69" : mono ? "#ffffff" : "#cdd6f4"),
      text: paint(light ? "#4c4f69" : mono ? "#ffffff" : "#cdd6f4"),
      textMuted: paint(light ? "#6c6f85" : mono ? "#aaaaaa" : "#6c7086"),
      success: paint(light ? "#40a02b" : mono ? "#ffffff" : "#a6e3a1"),
      warning: paint(light ? "#df8e1d" : mono ? "#ffffff" : "#f9e2af"),
      danger: paint(light ? "#d20f39" : mono ? "#ffffff" : "#f38ba8"),
      orange: paint(light ? "#fe640b" : mono ? "#ffffff" : "#fab387"),
      magenta: paint(light ? "#ea76cb" : mono ? "#ffffff" : "#f5c2e7"),
      purple: paint(light ? "#8839ef" : mono ? "#ffffff" : "#cba6f7"),
    },
    glyphs: {
      search: "⌕",
      pointer: "›",
      dropdown: "▾",
      enter: "↵",
      actionMod: "^A",
      dropdownMod: "^P",
      rule: "─",
      bullet: "·",
      iconPlaceholder: "◇",
      loading: "◌",
      corner: "╭",
    },
  } as const;
}

const requestedTheme = (process.env.BLAST_THEME ?? "dark").toLowerCase();
export const theme = createTheme(
  noColor,
  requestedTheme === "system" || requestedTheme === "light" || requestedTheme === "mono"
    ? requestedTheme
    : "dark",
);

export type Theme = ReturnType<typeof createTheme>;

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
