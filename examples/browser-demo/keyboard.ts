import {
  matchesShortcut,
  shortcutLabel,
  type KeyInput,
  type Platform,
} from "../../packages/client-core/src/shortcut.ts";

/** The keyboard fields the browser supplies and the launcher needs. */
export type KeyboardLike = {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  isComposing?: boolean;
};

const names: Record<string, string> = {
  Enter: "return",
  Escape: "escape",
  " ": "space",
  Backspace: "backspace",
  Delete: "delete",
  Tab: "tab",
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  PageUp: "pageup",
  PageDown: "pagedown",
  Home: "home",
  End: "end",
};

/** Convert a DOM key event to the neutral shortcut shape used by client-core. */
export function keyInputFromEvent(event: KeyboardLike): KeyInput {
  const name = names[event.key] ?? event.key.toLowerCase();
  return {
    name,
    ...(event.ctrlKey ? { ctrl: true } : {}),
    ...(event.metaKey ? { meta: true } : {}),
    ...(event.shiftKey ? { shift: true } : {}),
    ...(event.altKey ? { option: true } : {}),
  };
}

/**
 * Apply one key while a command is starting. The caller decides whether the
 * returned value should be rendered or replayed; unsupported keys return
 * undefined so shortcuts and navigation are never buffered.
 */
export function applyEarlyKey(buffer: string, event: KeyboardLike): string | undefined {
  if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return undefined;
  if (event.key === "Backspace") return buffer.slice(0, -1);
  return event.key.length === 1 ? buffer + event.key : undefined;
}

/**
 * Paste data is already text; no clipboard read is needed during startup. The
 * search bar is one line, so line breaks collapse to spaces as an input would.
 */
export function applyEarlyPaste(buffer: string, text: string): string {
  return buffer + text.replace(/\r?\n/g, " ");
}

/** The navigator fields that name the OS; `userAgentData` is Chromium-only. */
export type NavigatorLike = { platform?: string; userAgentData?: { platform?: string } };

/** Raycast's ⌘ is Ctrl off macOS; this picks which, from the browser's OS. */
export function platformFromNavigator(navigator: NavigatorLike | undefined): Platform {
  const name = navigator?.userAgentData?.platform || navigator?.platform || "";
  if (/mac|iphone|ipad/i.test(name)) return "macOS";
  return /win/i.test(name) ? "Windows" : "Linux";
}

/**
 * Combos the browser keeps for itself: pages never receive them, so
 * `preventDefault` cannot help. `cmd` is Ctrl off macOS, like any Raycast
 * shortcut. The only table of these; labels and matching both read it.
 */
export const BROWSER_RESERVED = [
  { modifiers: ["cmd"], key: "t" },
  { modifiers: ["cmd"], key: "w" },
  { modifiers: ["cmd"], key: "n" },
  { modifiers: ["cmd"], key: "q" },
  { modifiers: ["cmd"], key: "l" },
  { modifiers: ["cmd", "shift"], key: "t" },
  { modifiers: ["cmd", "shift"], key: "n" },
  { modifiers: ["cmd", "shift"], key: "w" },
  { modifiers: ["cmd"], key: "tab" },
  { modifiers: ["ctrl"], key: "tab" },
  { modifiers: ["ctrl", "shift"], key: "tab" },
] as const;

/** Whether the browser swallows `press` before the page sees it. */
export function isBrowserReserved(press: KeyInput, platform: Platform): boolean {
  return BROWSER_RESERVED.some((shortcut) => matchesShortcut(shortcut, press, platform));
}

/** Whether a rendered shortcut label (`⌘T`, `Ctrl+T`) names a reserved combo. */
export function isReservedLabel(label: string, platform: Platform): boolean {
  return (
    !!label && BROWSER_RESERVED.some((shortcut) => shortcutLabel(shortcut, platform) === label)
  );
}

/** Tooltip for a reserved combo: the action stays reachable from the panel. */
export const RESERVED_HINT = "Browser reserved: run it from the Actions panel";

/**
 * Whether a key pressed in a text field may run a shortcut. Like Raycast, a
 * field keeps plain typing (letters, Shift+letter, Space, Backspace, ←/→)
 * and gives up modifier combos, ↵, Esc and ↑/↓.
 */
export function shortcutAllowedInText(event: KeyboardLike): boolean {
  if (event.isComposing) return false;
  if (event.ctrlKey || event.metaKey || event.altKey) return true;
  return ["Enter", "Escape", "ArrowUp", "ArrowDown"].includes(event.key);
}
