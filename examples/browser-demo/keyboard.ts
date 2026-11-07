import type { KeyInput } from "../../packages/client-core/src/shortcut.ts";

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
