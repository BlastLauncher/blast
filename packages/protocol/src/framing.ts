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
  // Buffered slices of an incomplete line. Storing chunks instead of growing a
  // single Uint8Array avoids O(N^2) copies when large scenes arrive in pieces.
  let chunks: Uint8Array[] = [];
  let pendingBytes = 0;
  // A string chunk can end between the halves of a surrogate pair; the high
  // half waits here so the pair is encoded as one character.
  let heldHighSurrogate = "";
  let stopped = false;

  function stop(error: string): void {
    stopped = true;
    chunks = [];
    pendingBytes = 0;
    options.onError(error);
  }

  function assemble(tail: Uint8Array): Uint8Array {
    const line = new Uint8Array(pendingBytes + tail.length);
    let offset = 0;
    for (let i = 0; i < chunks.length; i++) {
      const part = chunks[i]!;
      line.set(part, offset);
      offset += part.length;
    }
    if (tail.length > 0) line.set(tail, offset);
    chunks = [];
    pendingBytes = 0;
    return line;
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
      const owned = typeof chunk === "string";
      const bytes = owned ? encodeChunk(chunk) : chunk;
      if (bytes.length === 0) return;

      let start = 0;
      for (;;) {
        const index = bytes.indexOf(NEWLINE, start);
        if (index === -1) break;
        const part = bytes.subarray(start, index);
        if (pendingBytes === 0) {
          emitLine(part);
        } else {
          if (pendingBytes + part.length > maxLineBytes) {
            stop(`line exceeds ${maxLineBytes} bytes`);
            return;
          }
          emitLine(assemble(part));
        }
        if (stopped) return;
        start = index + 1;
      }

      if (start < bytes.length) {
        const tailLen = bytes.length - start;
        // Checked before the terminator arrives so one bad line cannot grow the
        // buffer without bound.
        if (pendingBytes + tailLen > maxLineBytes) {
          stop(`line exceeds ${maxLineBytes} bytes`);
          return;
        }
        // Copy only bytes that outlive this `push()` call.
        const tail = bytes.subarray(start);
        chunks.push(owned ? tail : new Uint8Array(tail));
        pendingBytes += tailLen;
      }
    },
    end(): void {
      if (stopped) return;
      if (heldHighSurrogate !== "") {
        const encoded = encoder.encode(heldHighSurrogate);
        heldHighSurrogate = "";
        chunks.push(encoded);
        pendingBytes += encoded.length;
      }
      const leftoverBytes = pendingBytes;
      chunks = [];
      pendingBytes = 0;
      if (leftoverBytes === 0) {
        stopped = true;
        return;
      }
      stop(`unterminated line: ${leftoverBytes} bytes without a newline`);
    },
  };
}
