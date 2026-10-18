// Internal module for the clipboard capability; the public surface is the
// `Clipboard` object re-exported from index.ts.
import type { JsonValue } from "../reconciler/index.ts";
import { pathParam, type ApplicationPath } from "./applications.ts";
import { requestCapability } from "./capability.ts";

/** `Clipboard.Content`: the text, file and HTML forms the declarations define. */
export type ClipboardContent =
  | { text: string }
  | { file: ApplicationPath }
  | { html: string; text?: string };

/** `Clipboard.CopyOptions`. */
export interface CopyOptions {
  /** Indicates whether the content should be treated as confidential. */
  concealed?: boolean;
}

/** Options shared by `Clipboard.read` and `Clipboard.readText`. */
export interface ReadOptions {
  /** Reaches back through the clipboard history; 0 is the current content. */
  offset?: number;
}

/** `Clipboard.ReadContent`. */
export interface ReadContent {
  /** The text representation of the content. */
  text: string;
  /** The file representation of the content. */
  file?: string;
  /** The HTML representation of the content. */
  html?: string;
}

/** The offsets the declarations allow into the clipboard history. */
const MAX_OFFSET = 5;

/**
 * `Clipboard.Content` as capability params: exactly one representation per
 * request, so a client can tell a file copy from an HTML copy. `concealed` is
 * a host-side concern (history elision) and travels alongside, never inside.
 */
export function contentParams(
  content: string | number | ClipboardContent,
  api: string,
): Record<string, JsonValue> {
  if (typeof content === "string") return { text: content };
  if (typeof content === "number") return { text: String(content) };
  if (typeof content === "object" && content !== null && !Array.isArray(content)) {
    if (
      "file" in content &&
      (typeof content.file === "string" ||
        Buffer.isBuffer(content.file) ||
        content.file instanceof URL)
    )
      return { file: pathParam(content.file, api) };
    if ("html" in content && typeof content.html === "string") {
      if (content.text === undefined) return { html: content.html };
      if (typeof content.text === "string") return { html: content.html, text: content.text };
    } else if ("text" in content && typeof content.text === "string") return { text: content.text };
  }
  throw new TypeError(`${api}: unsupported content in Blast`);
}

export async function copy(
  content: string | number | ClipboardContent,
  options?: CopyOptions,
): Promise<void> {
  const params = contentParams(content, "Clipboard.copy");
  // Only a set flag crosses the wire: absent stays absent, like every prop.
  if (options?.concealed !== undefined) params["concealed"] = options.concealed;
  await requestCapability("clipboard.copy", params);
}

export async function clear(): Promise<void> {
  await requestCapability("clipboard.clear", {});
}

export async function paste(content: string | number | ClipboardContent): Promise<void> {
  await requestCapability("clipboard.paste", contentParams(content, "Clipboard.paste"));
}

function readParams(options: ReadOptions | undefined, api: string): Record<string, JsonValue> {
  const offset = options?.offset;
  if (offset === undefined) return {};
  if (!Number.isInteger(offset) || offset < 0 || offset > MAX_OFFSET) {
    throw new TypeError(`${api}: offset must be an integer between 0 and ${MAX_OFFSET}`);
  }
  return { offset };
}

/** Reads the clipboard at `offset`; the host answers with whatever it has. */
export async function read(options?: ReadOptions): Promise<ReadContent> {
  const value = await requestCapability("clipboard.read", readParams(options, "Clipboard.read"));
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Clipboard.read: the host returned a non-object clipboard content");
  }
  // The declarations make `text` required, so a host without text answers empty.
  const content: ReadContent = { text: typeof value.text === "string" ? value.text : "" };
  if (typeof value.file === "string") content.file = value.file;
  if (typeof value.html === "string") content.html = value.html;
  return content;
}

export async function readText(options?: ReadOptions): Promise<string | undefined> {
  const { text } = await read(options);
  // The wire cannot tell "no text" apart from an empty string; Raycast reports
  // the former as undefined, so an empty text maps to that.
  return text === "" ? undefined : text;
}

/** Members in the order the declarations list them. */
export const Clipboard = { copy, clear, paste, read, readText };
