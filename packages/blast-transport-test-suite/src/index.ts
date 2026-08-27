import assert from "node:assert/strict";
import test from "node:test";

export interface TransportUnderTest<TMessage> {
  readonly messages: AsyncIterable<TMessage>;
  send(message: TMessage): Promise<void>;
  close(reason?: string): Promise<void>;
}

export type TransportPairFactory<TMessage> = () => readonly [
  TransportUnderTest<TMessage>,
  TransportUnderTest<TMessage>,
];

export function defineTransportConformanceSuite<TMessage>(
  name: string,
  createPair: TransportPairFactory<TMessage>,
  samples: readonly [TMessage, TMessage],
): void {
  test(`${name}: delivers messages to the opposite endpoint in order`, async () => {
    const [left, right] = createPair();
    const messages = right.messages[Symbol.asyncIterator]();

    await left.send(samples[0]);
    await left.send(samples[1]);

    assert.deepEqual(await messages.next(), { done: false, value: samples[0] });
    assert.deepEqual(await messages.next(), { done: false, value: samples[1] });
  });

  test(`${name}: resolves a pending reader when a message arrives`, async () => {
    const [left, right] = createPair();
    const pendingMessage = right.messages[Symbol.asyncIterator]().next();

    await left.send(samples[0]);

    assert.deepEqual(await pendingMessage, { done: false, value: samples[0] });
  });

  test(`${name}: drains queued messages before reporting closure`, async () => {
    const [left, right] = createPair();
    const messages = right.messages[Symbol.asyncIterator]();

    await left.send(samples[0]);
    await left.close("test complete");

    assert.deepEqual(await messages.next(), { done: false, value: samples[0] });
    assert.deepEqual(await messages.next(), { done: true, value: undefined });
  });

  test(`${name}: closing either endpoint closes the pair and rejects later sends`, async () => {
    const [left, right] = createPair();
    const leftMessages = left.messages[Symbol.asyncIterator]();
    const rightMessages = right.messages[Symbol.asyncIterator]();

    await left.close("test complete");
    await right.close("already closed");

    assert.deepEqual(await leftMessages.next(), { done: true, value: undefined });
    assert.deepEqual(await rightMessages.next(), { done: true, value: undefined });
    await assert.rejects(() => right.send(samples[0]), /closed/i);
  });
}
