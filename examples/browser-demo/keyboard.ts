import type { KeyInput } from "../../packages/client-core/src/shortcut.ts";

/** The keyboard fields the browser supplies and the launcher needs. */
export type KeyboardLike = {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
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
