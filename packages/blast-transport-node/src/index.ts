import type { Readable, Writable } from "node:stream";

import type { ProtocolEnvelope } from "@blastlauncher/protocol";
import type { ProtocolTransport } from "@blastlauncher/transport";

export const DEFAULT_MAX_FRAME_BYTES = 8 * 1024 * 1024;

export interface JsonLineTransportOptions {
  readonly readable: Readable;
  readonly writable: Writable;
  readonly maxFrameBytes?: number;
}

export function createJsonLineTransport(options: JsonLineTransportOptions): ProtocolTransport {
  return new JsonLineTransport(options);
}

export function createProcessStdioTransport(options: { readonly maxFrameBytes?: number } = {}): ProtocolTransport {
  return createJsonLineTransport({
    readable: process.stdin,
    writable: process.stdout,
    ...(options.maxFrameBytes === undefined ? {} : { maxFrameBytes: options.maxFrameBytes }),
  });
}

class JsonLineTransport implements ProtocolTransport {
  readonly messages: AsyncIterable<unknown>;
  readonly #queue = new AsyncQueue<unknown>();
  readonly #readable: Readable;
  readonly #writable: Writable;
  readonly #maxFrameBytes: number;
  #buffer = Buffer.alloc(0);
  #closed = false;

  readonly #onData = (chunk: Buffer | string): void => {
    if (this.#closed) {
      return;
    }

    const incoming = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    this.#buffer = Buffer.concat([this.#buffer, incoming]);
    this.#drainFrames();
  };

  readonly #onEnd = (): void => {
    if (this.#closed) {
      return;
    }
    if (this.#buffer.length > 0) {
      this.#fail(new Error("Protocol transport ended with an incomplete JSON line"));
      return;
    }
    this.#markClosed();
  };

  readonly #onError = (error: Error): void => {
    this.#fail(error);
  };

  constructor(options: JsonLineTransportOptions) {
    if (
      !Number.isSafeInteger(options.maxFrameBytes ?? DEFAULT_MAX_FRAME_BYTES) ||
      (options.maxFrameBytes ?? DEFAULT_MAX_FRAME_BYTES) <= 0
    ) {
      throw new Error("maxFrameBytes must be a positive safe integer");
    }

    this.messages = this.#queue;
    this.#readable = options.readable;
    this.#writable = options.writable;
    this.#maxFrameBytes = options.maxFrameBytes ?? DEFAULT_MAX_FRAME_BYTES;
    this.#readable.on("data", this.#onData);
    this.#readable.once("end", this.#onEnd);
    this.#readable.once("error", this.#onError);
    this.#writable.once("error", this.#onError);
  }

  async send(message: ProtocolEnvelope): Promise<void> {
    if (this.#closed || this.#writable.destroyed || this.#writable.writableEnded) {
      throw new Error("Protocol transport is closed");
    }

    const frame = `${JSON.stringify(message)}\n`;
    if (Buffer.byteLength(frame) - 1 > this.#maxFrameBytes) {
      throw new Error(`Protocol frame exceeds ${this.#maxFrameBytes} bytes`);
    }

    await new Promise<void>((resolve, reject) => {
      this.#writable.write(frame, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  async close(reason?: string): Promise<void> {
    void reason;
    if (this.#closed) {
      return;
    }

    this.#markClosed();
    await this.#endWritable();
  }

  #drainFrames(): void {
    let newlineIndex = this.#buffer.indexOf(0x0a);
    while (newlineIndex !== -1) {
      let frame = this.#buffer.subarray(0, newlineIndex);
      this.#buffer = this.#buffer.subarray(newlineIndex + 1);
      if (frame.at(-1) === 0x0d) {
        frame = frame.subarray(0, -1);
      }
      if (frame.length > this.#maxFrameBytes) {
        this.#fail(new Error(`Protocol frame exceeds ${this.#maxFrameBytes} bytes`));
        return;
      }

      try {
        this.#queue.enqueue(JSON.parse(frame.toString("utf8")) as unknown);
      } catch (error) {
        this.#fail(new Error("Protocol transport received invalid JSON", { cause: error }));
        return;
      }
      newlineIndex = this.#buffer.indexOf(0x0a);
    }

    if (this.#buffer.length > this.#maxFrameBytes) {
      this.#fail(new Error(`Protocol frame exceeds ${this.#maxFrameBytes} bytes`));
    }
  }

  #fail(error: Error): void {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    this.#removeListeners();
    this.#queue.fail(error);
    void this.#endWritable().catch(() => {});
  }

  #markClosed(): void {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    this.#removeListeners();
    this.#queue.close();
  }

  #removeListeners(): void {
    this.#readable.off("data", this.#onData);
    this.#readable.off("end", this.#onEnd);
    this.#readable.off("error", this.#onError);
    this.#writable.off("error", this.#onError);
  }

  async #endWritable(): Promise<void> {
    if (this.#writable.destroyed || this.#writable.writableEnded) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const cleanup = (): void => {
        this.#writable.off("error", onError);
      };
      const onError = (error: Error): void => {
        cleanup();
        reject(error);
      };
      this.#writable.once("error", onError);
      this.#writable.end(() => {
        cleanup();
        resolve();
      });
    });
  }
}

class AsyncQueue<T> implements AsyncIterableIterator<T> {
  readonly #values: T[] = [];
  readonly #waiters: Array<{
    readonly resolve: (result: IteratorResult<T>) => void;
    readonly reject: (error: Error) => void;
  }> = [];
  #closed = false;
  #failure?: Error;

  [Symbol.asyncIterator](): AsyncIterableIterator<T> {
    return this;
  }

  next(): Promise<IteratorResult<T>> {
    const value = this.#values.shift();
    if (value !== undefined) {
      return Promise.resolve({ done: false, value });
    }
    if (this.#failure) {
      return Promise.reject(this.#failure);
    }
    if (this.#closed) {
      return Promise.resolve({ done: true, value: undefined });
    }

    return new Promise((resolve, reject) => {
      this.#waiters.push({ resolve, reject });
    });
  }

  enqueue(value: T): void {
    if (this.#closed || this.#failure) {
      throw new Error("Cannot enqueue on a closed transport");
    }
    const waiter = this.#waiters.shift();
    if (waiter) {
      waiter.resolve({ done: false, value });
      return;
    }
    this.#values.push(value);
  }

  close(): void {
    if (this.#closed || this.#failure) {
      return;
    }
    this.#closed = true;
    for (const waiter of this.#waiters.splice(0)) {
      waiter.resolve({ done: true, value: undefined });
    }
  }

  fail(error: Error): void {
    if (this.#closed || this.#failure) {
      return;
    }
    this.#failure = error;
    for (const waiter of this.#waiters.splice(0)) {
      waiter.reject(error);
    }
  }
}
