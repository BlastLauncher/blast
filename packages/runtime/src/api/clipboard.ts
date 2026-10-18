// Internal module for the clipboard capability; the public surface is the
// `Clipboard` object re-exported from index.ts.
import { requestCapability } from "./capability.ts";

/** `Clipboard.Content`; Blast M1 only supports the `{ text }` form. */
export type ClipboardContent =
  | { text: string }
  | { file: string }
  | { html: string; text?: string };

/** `Clipboard.CopyOptions`. */
export interface CopyOptions {
  /** Indicates whether the content should be treated as confidential. */
  concealed?: boolean;
}

export async function copy(
  content: string | number | ClipboardContent,
  // Concealing is a host-side concern; the M1 capability only carries text.
  _options?: CopyOptions,
): Promise<void> {
  const text = toText(content);
  await requestCapability("clipboard.copy", { text });
}

export function toText(
  content: string | number | ClipboardContent,
  api = "Clipboard.copy",
): string {
  if (typeof content === "string") return content;
  if (typeof content === "number") return String(content);
  if ("text" in content && typeof content.text === "string") return content.text;
  throw new TypeError(
    `${api}: unsupported content in Blast; only string, number and { text } content can be copied`,
  );
}

export const Clipboard = { copy };
