// Raycast `Keyboard.Shortcut` for any platform: matching a key press and
// rendering a label. The runtime passes shortcuts through as written, either
// `{ modifiers, key }` or the cross-platform `{ macOS, Windows }` form
// (`Keyboard.Shortcut.Common.*` is the latter).

export type Platform = "macOS" | "Windows" | "Linux";

// The key shape a client matches against. Named neutrally: any embedder can
// supply it, not only a terminal (`name` plus the held modifiers). `meta` is
// the macOS Command key, `super` the Windows/Super key, `option` Option/Alt.
export type KeyInput = {
  name: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  option?: boolean;
  super?: boolean;
};

type Modifier = "ctrl" | "option" | "shift" | "meta" | "super";
const MODIFIERS = ["cmd", "ctrl", "opt", "shift", "alt", "windows"];

// Key names follow `KeyInput.name` (the terminal-style names clients report).
const NAMES: Record<string, string> = {
  return: "return",
  enter: "return",
  escape: "escape",
  space: "space",
  backspace: "backspace",
  delete: "backspace",
  deleteForward: "delete",
  tab: "tab",
  arrowUp: "up",
  arrowDown: "down",
  arrowLeft: "left",
  arrowRight: "right",
  pageUp: "pageup",
  pageDown: "pagedown",
  home: "home",
  end: "end",
};
const ALIASES: Record<string, string> = { enter: "return", esc: "escape" };

type Resolved = { key: string; modifiers: Set<Modifier> };

function plain(value: unknown): { key: unknown; modifiers: unknown } | undefined {
  return value && typeof value === "object" && "key" in value && "modifiers" in value
    ? value
    : undefined;
}

/** The `{ modifiers, key }` pair that applies on `platform`, if the value has one. */
function pick(
  value: unknown,
  platform: Platform,
): { key: unknown; modifiers: unknown } | undefined {
  if (plain(value)) return plain(value);
  if (!value || typeof value !== "object") return;
  if (platform === "macOS") return "macOS" in value ? plain(value.macOS) : undefined;
  // Linux uses the Windows variant; `windows` is its deprecated spelling.
  if ("Windows" in value && plain(value.Windows)) return plain(value.Windows);
  return "windows" in value ? plain(value.windows) : undefined;
}

function modifierOf(name: string, platform: Platform): Modifier {
  if (name === "shift") return "shift";
  if (name === "windows") return "super";
  if (name === "opt" || name === "alt") return "option";
  if (name === "cmd") return platform === "macOS" ? "meta" : "ctrl";
  return "ctrl";
}

function resolve(value: unknown, platform: Platform): Resolved | undefined {
  const picked = pick(value, platform);
  if (!picked) return;
  const { key, modifiers } = picked;
  if (typeof key !== "string" || !Array.isArray(modifiers)) return;
  if (!modifiers.every((m) => typeof m === "string" && MODIFIERS.includes(m))) return;
  const name = NAMES[key] ?? (key.length === 1 ? key.toLowerCase() : undefined);
  if (!name) return;
  return { key: name, modifiers: new Set(modifiers.map((m) => modifierOf(m, platform))) };
}

/** Whether `key` is the press `value` describes on `platform` (default `Linux`). */
export function matchesShortcut(value: unknown, key: KeyInput, platform: Platform = "Linux") {
  const resolved = resolve(value, platform);
  if (!resolved) return false;
  const name = key.name.toLowerCase();
  const pressed: Record<Modifier, boolean> = {
    ctrl: !!key.ctrl,
    option: !!key.option,
    shift: !!key.shift,
    meta: !!key.meta,
    super: !!key.super,
  };
  return (
    (ALIASES[name] ?? name) === resolved.key &&
    (Object.keys(pressed) as Modifier[]).every((m) => pressed[m] === resolved.modifiers.has(m))
  );
}

const MAC_GLYPHS: Record<Modifier, string> = {
  ctrl: "⌃",
  option: "⌥",
  shift: "⇧",
  meta: "⌘",
  super: "❖",
};
const TEXT_NAMES: Record<Modifier, string> = {
  ctrl: "Ctrl",
  option: "Alt",
  shift: "Shift",
  meta: "Cmd",
  super: "Win",
};
const ORDER: Modifier[] = ["ctrl", "option", "shift", "meta", "super"];
const MAC_KEYS: Record<string, string> = {
  return: "↵",
  escape: "⎋",
  space: "␣",
  backspace: "⌫",
  delete: "⌦",
  tab: "⇥",
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
  pageup: "⇞",
  pagedown: "⇟",
  home: "↖",
  end: "↘",
};
const TEXT_KEYS: Record<string, string> = {
  return: "Enter",
  escape: "Esc",
  space: "Space",
  backspace: "Backspace",
  delete: "Delete",
  tab: "Tab",
  up: "Up",
  down: "Down",
  left: "Left",
  right: "Right",
  pageup: "PageUp",
  pagedown: "PageDown",
  home: "Home",
  end: "End",
};

/** `⌘⇧K` on macOS, `Ctrl+Shift+K` elsewhere; empty for a shortcut that does not apply. */
export function shortcutLabel(value: unknown, platform: Platform = "Linux"): string {
  const resolved = resolve(value, platform);
  if (!resolved) return "";
  const mac = platform === "macOS";
  const modifiers = ORDER.filter((m) => resolved.modifiers.has(m));
  if (mac)
    return [
      ...modifiers.map((m) => MAC_GLYPHS[m]),
      MAC_KEYS[resolved.key] ?? resolved.key.toUpperCase(),
    ].join("");
  return [
    ...modifiers.map((m) => TEXT_NAMES[m]),
    TEXT_KEYS[resolved.key] ?? resolved.key.toUpperCase(),
  ].join("+");
}
