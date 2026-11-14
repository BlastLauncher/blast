import { PassThrough, Readable } from "node:stream";
import { expect, test } from "bun:test";
import { finished, pipeline } from "./stream-promises.ts";

test("stream promises pipeline and finished wrap callback streams", async () => {
  const source = Readable.from(["hello", " world"]);
  const target = new PassThrough();
  const chunks: Buffer[] = [];
  target.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  await pipeline(source, target);
  await finished(target);
  expect(Buffer.concat(chunks).toString()).toBe("hello world");
});
