import { EventEmitter } from "node:events";
import * as nodeStream from "node:stream";
import { expect, test } from "bun:test";
import { patchStreams } from "./stream-compat.ts";

/** almostnode's shape: Stream, Readable and Writable are unrelated emitters. */
function almostnodeStreams() {
  class Stream extends EventEmitter {}
  class Readable extends EventEmitter {
    readableEnded = false;
    destroyed = false;
    destroy() {
      this.destroyed = true;
    }
  }
  class Writable extends EventEmitter {}
  class PassThrough extends Readable {}
  class Pipe extends Stream {}
  return { Stream, Readable, Writable, PassThrough, Pipe };
}

test("almostnode readables become Streams for instanceof, subclasses stay strict", () => {
  const streams = almostnodeStreams();
  expect(new streams.PassThrough() instanceof streams.Stream).toBe(false);
  patchStreams(streams);
  patchStreams(streams);
  expect(new streams.PassThrough() instanceof streams.Stream).toBe(true);
  expect(new streams.Writable() instanceof streams.Stream).toBe(true);
  expect(new streams.Pipe() instanceof streams.Stream).toBe(true);
  expect(new streams.PassThrough() instanceof streams.Pipe).toBe(false);
  expect({} instanceof streams.Stream).toBe(false);
});

test("a readable is async iterable: data in order, then end; errors throw", async () => {
  const streams = almostnodeStreams();
  patchStreams(streams);
  const body = new streams.PassThrough();
  setTimeout(() => {
    body.emit("data", '{"a":');
    body.emit("data", "1}");
    body.emit("end");
  }, 0);
  const chunks: unknown[] = [];
  for await (const chunk of body as unknown as AsyncIterable<unknown>) chunks.push(chunk);
  expect(chunks.join("")).toBe('{"a":1}');
  expect(body.listenerCount("data")).toBe(0);

  const failing = new streams.PassThrough();
  setTimeout(() => failing.emit("error", new Error("reset")), 0);
  const read = async () => {
    for await (const chunk of failing as unknown as AsyncIterable<unknown>) void chunk;
  };
  await expect(read()).rejects.toThrow("reset");

  // Leaving the loop early releases the stream.
  const early = new streams.PassThrough();
  setTimeout(() => early.emit("data", "x"), 0);
  for await (const chunk of early as unknown as AsyncIterable<unknown>) if (chunk) break;
  expect(early.destroyed).toBe(true);
});

test("Node's own stream module is left as it is", () => {
  const iterator = nodeStream.Readable.prototype[Symbol.asyncIterator];
  patchStreams(nodeStream as unknown as Parameters<typeof patchStreams>[0]);
  expect(nodeStream.Readable.prototype[Symbol.asyncIterator]).toBe(iterator);
  expect(Object.hasOwn(nodeStream.Stream, Symbol.hasInstance)).toBe(false);
});
