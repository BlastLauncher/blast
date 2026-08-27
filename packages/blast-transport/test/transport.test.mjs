import assert from "node:assert/strict";
import test from "node:test";

import { createMessage } from "@blastlauncher/protocol";

import { createInMemoryTransportPair } from "../dist/index.js";

test("delivers messages to the opposite endpoint in order", async () => {
  const [left, right] = createInMemoryTransportPair();
  const messages = right.messages[Symbol.asyncIterator]();
  const first = createMessage("1", "test", { position: 1 });
  const second = createMessage("2", "test", { position: 2 });

  await left.send(first);
  await left.send(second);

  assert.deepEqual(await messages.next(), { done: false, value: first });
  assert.deepEqual(await messages.next(), { done: false, value: second });
});

test("closing either endpoint closes the pair", async () => {
  const [left, right] = createInMemoryTransportPair();
  const leftMessages = left.messages[Symbol.asyncIterator]();
  const rightMessages = right.messages[Symbol.asyncIterator]();

  await left.close("test complete");

  assert.deepEqual(await leftMessages.next(), { done: true, value: undefined });
  assert.deepEqual(await rightMessages.next(), { done: true, value: undefined });
  await assert.rejects(() => right.send(createMessage("1", "test", null)), /transport is closed/);
});
