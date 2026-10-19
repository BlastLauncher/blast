import type { PasteEvent } from "@opentui/core";

/** Bracketed-paste text for single-line secret fields: control characters
 * (including the trailing newline copied with most tokens) are dropped. */
export function pastedText(event: PasteEvent): string {
  return Array.from(new TextDecoder().decode(event.bytes))
    .filter((char) => char.codePointAt(0)! >= 32 && char.codePointAt(0) !== 127)
    .join("");
}
