import { expect, test } from "bun:test";
import { createLineDecoder, DEFAULT_MAX_LINE_BYTES, encodeMessage } from "./framing.ts";
import { parseHostMessage, type HostMessage } from "./messages.ts";

const encoder = new TextEncoder();

function collector(maxLineBytes = DEFAULT_MAX_LINE_BYTES) {
  const lines: unknown[] = [];
  const errors: string[] = [];
  const decoder = createLineDecoder({
    maxLineBytes,
    onLine: (value) => lines.push(value),
    onError: (error) => errors.push(error),
  });
  return { decoder, lines, errors };
}

test("the line size default is 8 MiB and can be overridden", () => {
  expect(DEFAULT_MAX_LINE_BYTES).toBe(8 * 1024 * 1024);
  expect(() =>
    createLineDecoder({ maxLineBytes: 0, onLine: () => {}, onError: () => {} }),
  ).toThrow();
  expect(() =>
    createLineDecoder({ maxLineBytes: 1.5, onLine: () => {}, onError: () => {} }),
  ).toThrow();
});

test("assembles a line from chunks of any size", () => {
  const { decoder, lines, errors } = collector();
  const bytes = encoder.encode('{"type":"shutdown"}\n{"type":"shutdown"}\n');
  for (const byte of bytes) decoder.push(new Uint8Array([byte]));
  decoder.end();
  expect(lines).toEqual([{ type: "shutdown" }, { type: "shutdown" }]);
  expect(errors).toEqual([]);
});

test("emits every line of a chunk and ignores blank lines", () => {
  const { decoder, lines, errors } = collector();
  decoder.push('\n{"a":1}\n\n   \n\t\n{"b":2}\r\n');
  decoder.end();
  expect(lines).toEqual([{ a: 1 }, { b: 2 }]);
  expect(errors).toEqual([]);
});

test("decodes a line split at every byte boundary", () => {
  const bytes = encoder.encode('{"text":"héllo — 😀","n":1}\n');
  for (let cut = 0; cut <= bytes.length; cut++) {
    const { decoder, lines, errors } = collector();
    decoder.push(bytes.subarray(0, cut));
    decoder.push(bytes.subarray(cut));
    decoder.end();
    expect(lines, `cut at ${cut}`).toEqual([{ text: "héllo — 😀", n: 1 }]);
    expect(errors, `cut at ${cut}`).toEqual([]);
  }
});

test("reassembles a surrogate pair split across string chunks", () => {
  const emoji = "😀";
  const { decoder, lines, errors } = collector();
  decoder.push(`{"a":"${emoji.charAt(0)}`);
  decoder.push(`${emoji.charAt(1)}"}\n`);
  decoder.end();
  expect(lines).toEqual([{ a: "😀" }]);
  expect(errors).toEqual([]);
});

test("emits parsed JSON without validating it", () => {
  const { decoder, lines, errors } = collector();
  decoder.push('"text"\n42\nnull\n[1,2]\n');
  decoder.end();
  expect(lines).toEqual(["text", 42, null, [1, 2]]);
  expect(errors).toEqual([]);
});

test("an oversize line fails before its terminator arrives and stops the stream", () => {
  const { decoder, lines, errors } = collector(4);
  decoder.push("abcde");
  expect(errors).toEqual(["line exceeds 4 bytes"]);
  decoder.push("f\n");
  decoder.push('{"a":1}\n');
  decoder.end();
  expect(lines).toEqual([]);
  expect(errors).toEqual(["line exceeds 4 bytes"]);
});

test("a complete oversize line in one chunk fails the same way", () => {
  const { decoder, lines, errors } = collector(8);
  decoder.push('{"a":1,2}\n{"b":2}\n');
  expect(lines).toEqual([]);
  expect(errors).toEqual(["line exceeds 8 bytes"]);
});

test("a line of exactly maxLineBytes passes", () => {
  const { decoder, lines, errors } = collector(2);
  decoder.push("{}\n");
  expect(lines).toEqual([{}]);
  decoder.push("[ ]\n");
  expect(errors).toEqual(["line exceeds 2 bytes"]);
});

test("invalid JSON fails once and stops the stream", () => {
  const { decoder, lines, errors } = collector();
  decoder.push('{"a":1}\n');
  decoder.push("not json\n");
  decoder.push('{"b":2}\n');
  decoder.end();
  expect(lines).toEqual([{ a: 1 }]);
  expect(errors).toHaveLength(1);
  expect(errors[0]).toMatch(/^invalid JSON: /);
});

test("bytes that are not valid UTF-8 fail the line", () => {
  const { decoder, lines, errors } = collector();
  decoder.push(new Uint8Array([0x7b, 0xff, 0x7d, 0x0a]));
  decoder.end();
  expect(lines).toEqual([]);
  expect(errors).toEqual(["line is not valid UTF-8"]);
});

test("end() reports a trailing partial line once and then closes", () => {
  const { decoder, lines, errors } = collector();
  decoder.push('{"a":1}\n{"b":');
  decoder.end();
  decoder.end();
  decoder.push('{"c":3}\n');
  expect(lines).toEqual([{ a: 1 }]);
  expect(errors).toEqual(["unterminated line: 5 bytes without a newline"]);
});

test("end() with nothing pending is silent and closes the decoder", () => {
  const { decoder, lines, errors } = collector();
  decoder.push("");
  decoder.end();
  decoder.push('{"a":1}\n');
  decoder.end();
  expect(lines).toEqual([]);
  expect(errors).toEqual([]);
});

test("the decoder copies the bytes it is given", () => {
  const { decoder, lines, errors } = collector();
  const head = encoder.encode('{"a":');
  const tail = encoder.encode("1}\n");
  decoder.push(head);
  head.fill(0);
  decoder.push(tail);
  decoder.end();
  expect(lines).toEqual([{ a: 1 }]);
  expect(errors).toEqual([]);
});

test("encodeMessage writes exactly one line, even for strings holding newlines", () => {
  const message: HostMessage = {
    type: "event",
    node: "node",
    handler: "handler",
    args: ["a\nb", "\r\n", "\u0000"],
  };
  const encoded = encodeMessage(message);
  expect(encoded).toBe(`${JSON.stringify(message)}\n`);
  expect(encoded.endsWith("\n")).toBe(true);
  expect(encoded.slice(0, -1)).not.toContain("\n");

  const { decoder, lines, errors } = collector();
  decoder.push(encoded);
  decoder.end();
  expect(errors).toEqual([]);
  expect(parseHostMessage(lines[0])).toEqual({ ok: true, message });
});
