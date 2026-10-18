// Newline-delimited JSON framing (docs/decisions/0001-process-and-scene-model.md).
// One message is one JSON object on one line. A line that is oversize, invalid
// UTF-8 or invalid JSON is a protocol error: the decoder reports it once and
// then stops emitting, because the stream position after a broken line cannot
// be trusted.
//
// Lines are split on bytes, not on decoded text: 0x0A can never appear inside a
// multi-byte UTF-8 sequence, so a complete line is always decodable.
import type { HostMessage, RuntimeMessage } from "./messages.ts";

/** 8 MiB, per docs/decisions/0001: lines have a size cap. */
export const DEFAULT_MAX_LINE_BYTES = 8 * 1024 * 1024;

export type WireMessage = HostMessage | RuntimeMessage;

/** One message as one JSON line, ready to write to the stream. */
export function encodeMessage(message: WireMessage): string {
  return `${JSON.stringify(message)}\n`;
}

export type LineDecoderOptions = {
  /** Longest accepted line in bytes, terminator excluded. */
  maxLineBytes?: number;
  /** Called once per non-blank line with the parsed JSON value, unvalidated. */
  onLine: (value: unknown) => void;
  /** Called once when the stream is unusable; no callback follows. */
  onError: (error: string) => void;
};

export type LineDecoder = {
  push(chunk: string | Uint8Array): void;
  /** Closes the stream; a line left without its newline is an error. */
  end(): void;
};

const NEWLINE = 0x0a;
const HIGH_SURROGATE_START = 0xd800;
const HIGH_SURROGATE_END = 0xdbff;

export function createLineDecoder(options: LineDecoderOptions): LineDecoder {
  const maxLineBytes = options.maxLineBytes ?? DEFAULT_MAX_LINE_BYTES;
  if (!Number.isSafeInteger(maxLineBytes) || maxLineBytes < 1) {
    throw new RangeError("maxLineBytes must be a positive integer");
  }
  const encoder = new TextEncoder();
  // `fatal` turns a truncated or overlong sequence into a protocol error rather
  // than silently writing U+FFFD into the message.
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = new Uint8Array(0);
  // A string chunk can end between the halves of a surrogate pair; the high
  // half waits here so the pair is encoded as one character.
  let heldHighSurrogate = "";
  let stopped = false;

  function stop(error: string): void {
    stopped = true;
    options.onError(error);
  }

  function append(bytes: Uint8Array): void {
    const joined = new Uint8Array(buffer.length + bytes.length);
    joined.set(buffer);
    joined.set(bytes, buffer.length);
    buffer = joined;
  }

  function emitLine(line: Uint8Array): void {
    if (line.length > maxLineBytes) {
      stop(`line exceeds ${maxLineBytes} bytes`);
      return;
    }
    let text: string;
    try {
      text = decoder.decode(line);
    } catch {
      stop("line is not valid UTF-8");
      return;
    }
    // Whitespace-only lines are framing noise, not messages.
    if (text.trim() === "") return;
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch (error) {
      stop(`invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    options.onLine(value);
  }

  function drain(): void {
    let start = 0;
    for (;;) {
      const index = buffer.indexOf(NEWLINE, start);
      if (index === -1) break;
      emitLine(buffer.subarray(start, index));
      if (stopped) return;
      start = index + 1;
    }
    if (start > 0) buffer = buffer.slice(start);
    // Checked before the terminator arrives so one bad line cannot grow the
    // buffer without bound.
    if (buffer.length > maxLineBytes) stop(`line exceeds ${maxLineBytes} bytes`);
  }

  function encodeChunk(text: string): Uint8Array {
    let value = heldHighSurrogate + text;
    heldHighSurrogate = "";
    const last = value.charCodeAt(value.length - 1);
    if (last >= HIGH_SURROGATE_START && last <= HIGH_SURROGATE_END) {
      heldHighSurrogate = value.slice(-1);
      value = value.slice(0, -1);
    }
    return encoder.encode(value);
  }

  return {
    push(chunk: string | Uint8Array): void {
      if (stopped) return;
      // Copy the caller's bytes: the buffer outlives the call.
      const bytes = typeof chunk === "string" ? encodeChunk(chunk) : new Uint8Array(chunk);
      if (bytes.length === 0) return;
      append(bytes);
      drain();
    },
    end(): void {
      if (stopped) return;
      if (heldHighSurrogate !== "") {
        append(encoder.encode(heldHighSurrogate));
        heldHighSurrogate = "";
      }
      const leftover = buffer;
      buffer = new Uint8Array(0);
      if (leftover.length === 0) {
        stopped = true;
        return;
      }
      stop(`unterminated line: ${leftover.length} bytes without a newline`);
    },
  };
}
