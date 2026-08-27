import type { ProtocolEnvelope } from "@blastlauncher/protocol";

export interface ProtocolTransport {
  readonly messages: AsyncIterable<ProtocolEnvelope>;
  send(message: ProtocolEnvelope): Promise<void>;
  close(reason?: string): Promise<void>;
}

export type InMemoryTransportPair = readonly [ProtocolTransport, ProtocolTransport];

export function createInMemoryTransportPair(): InMemoryTransportPair {
  const leftInbox = new AsyncQueue<ProtocolEnvelope>();
  const rightInbox = new AsyncQueue<ProtocolEnvelope>();
  const state = new PairState(leftInbox, rightInbox);

  return [new InMemoryTransport(leftInbox, rightInbox, state), new InMemoryTransport(rightInbox, leftInbox, state)];
}

class InMemoryTransport implements ProtocolTransport {
  readonly messages: AsyncIterable<ProtocolEnvelope>;
  readonly #outbox: AsyncQueue<ProtocolEnvelope>;
  readonly #state: PairState;

  constructor(inbox: AsyncQueue<ProtocolEnvelope>, outbox: AsyncQueue<ProtocolEnvelope>, state: PairState) {
    this.messages = inbox;
    this.#outbox = outbox;
    this.#state = state;
  }

  async send(message: ProtocolEnvelope): Promise<void> {
    if (this.#state.closed) {
      throw new Error("Protocol transport is closed");
    }

    this.#outbox.enqueue(message);
  }

  async close(reason?: string): Promise<void> {
    void reason;
    this.#state.close();
  }
}

class PairState {
  #closed = false;
  readonly #inboxes: readonly AsyncQueue<ProtocolEnvelope>[];

  constructor(...inboxes: readonly AsyncQueue<ProtocolEnvelope>[]) {
    this.#inboxes = inboxes;
  }

  get closed(): boolean {
    return this.#closed;
  }

  close(): void {
    if (this.#closed) {
      return;
    }

    this.#closed = true;
    for (const inbox of this.#inboxes) {
      inbox.close();
    }
  }
}

class AsyncQueue<T> implements AsyncIterableIterator<T> {
  readonly #values: T[] = [];
  readonly #waiters: ((result: IteratorResult<T>) => void)[] = [];
  #closed = false;

  [Symbol.asyncIterator](): AsyncIterableIterator<T> {
    return this;
  }

  next(): Promise<IteratorResult<T>> {
    const value = this.#values.shift();
    if (value !== undefined) {
      return Promise.resolve({ done: false, value });
    }

    if (this.#closed) {
      return Promise.resolve({ done: true, value: undefined });
    }

    return new Promise((resolve) => {
      this.#waiters.push(resolve);
    });
  }

  enqueue(value: T): void {
    if (this.#closed) {
      throw new Error("Cannot enqueue on a closed transport");
    }

    const waiter = this.#waiters.shift();
    if (waiter) {
      waiter({ done: false, value });
      return;
    }

    this.#values.push(value);
  }

  close(): void {
    if (this.#closed) {
      return;
    }

    this.#closed = true;
    for (const waiter of this.#waiters.splice(0)) {
      waiter({ done: true, value: undefined });
    }
  }
}
