import assert from "node:assert/strict";
import test from "node:test";
import { PassThrough } from "node:stream";

import { createMessage } from "@blastlauncher/protocol";
import { defineTransportConformanceSuite } from "@blastlauncher/transport-test-suite";

import { createJsonLineTransport } from "../dist/index.js";

const samples = [createMessage("one", "test.one", { value: 1 }), createMessage("two", "test.two", { value: 2 })];

function createPair(options = {}) {
  const leftToRight = new PassThrough();
  const rightToLeft = new PassThrough();
  return [
    createJsonLineTransport({ readable: rightToLeft, writable: leftToRight, ...options }),
    createJsonLineTransport({ readable: leftToRight, writable: rightToLeft, ...options }),
  ];
}

defineTransportConformanceSuite("Node JSON-lines transport", createPair, samples);

test("parses fragmented JSON and multiple frames", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const transport = createJsonLineTransport({ readable: input, writable: output });
  const messages = transport.messages[Symbol.asyncIterator]();
  const firstFrame = JSON.stringify(samples[0]);

  input.write(firstFrame.slice(0, 7));
  input.write(`${firstFrame.slice(7)}\n${JSON.stringify(samples[1])}\n`);

  assert.deepEqual(await messages.next(), { done: false, value: samples[0] });
  assert.deepEqual(await messages.next(), { done: false, value: samples[1] });
  await transport.close();
});

test("rejects malformed and oversized frames", async (context) => {
  await context.test("malformed JSON", async () => {
    const input = new PassThrough();
    const transport = createJsonLineTransport({ readable: input, writable: new PassThrough() });
    const message = transport.messages[Symbol.asyncIterator]().next();
    input.write("{not-json}\n");
    await assert.rejects(message, /invalid JSON/);
  });

  await context.test("oversized JSON", async () => {
    const input = new PassThrough();
    const transport = createJsonLineTransport({ readable: input, writable: new PassThrough(), maxFrameBytes: 8 });
    const message = transport.messages[Symbol.asyncIterator]().next();
    input.write("123456789\n");
    await assert.rejects(message, /exceeds 8 bytes/);
  });
});
