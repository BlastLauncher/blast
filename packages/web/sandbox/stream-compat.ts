// almostnode's `stream` differs from Node's in two ways extensions rely on:
// its Readable and Writable do not inherit from `Stream`, and a Readable is not
// async iterable. node-fetch 3 checks `body instanceof Stream` and then reads
// it with `for await`; on almostnode it saw no stream and returned an empty
// body (uk-bank-holidays: "Unexpected end of JSON input"). Both patches are
// no-ops where the module already behaves like Node's.

type Listener = (...args: unknown[]) => void;
type Emitter = {
  on(event: string, listener: Listener): unknown;
  removeListener(event: string, listener: Listener): unknown;
  readableEnded?: boolean;
  destroy?: () => unknown;
  resume?: () => unknown;
};
type Constructor = { prototype: object };
export type StreamModule = { Stream: Constructor; Readable: Constructor; Writable: Constructor };

const instanceOf = (value: unknown, type: Constructor) =>
  Function.prototype[Symbol.hasInstance].call(type, value);

/** Reads a Readable's `data` events in order; `end` or `close` finishes, `error` throws. */
export function readableAsyncIterator(stream: Emitter): AsyncIterableIterator<unknown> {
  const chunks: unknown[] = [];
  let ended = stream.readableEnded === true;
  let failure: { error: unknown } | undefined;
  let wake: (() => void) | undefined;
  const notify = () => {
    wake?.();
    wake = undefined;
  };
  const listeners: Record<string, Listener> = {
    data: (chunk) => {
      chunks.push(chunk);
      notify();
    },
    end: () => {
      ended = true;
      notify();
    },
    close: () => {
      ended = true;
      notify();
    },
    error: (error) => {
      failure = { error };
      notify();
    },
  };
  for (const [event, listener] of Object.entries(listeners)) stream.on(event, listener);
  // almostnode keeps a readable paused until resume() is called, even after a
  // data listener is attached. Node's async iterator starts flowing itself.
  stream.resume?.();
  const stop = () => {
    for (const [event, listener] of Object.entries(listeners))
      stream.removeListener(event, listener);
  };
  return {
    async next() {
      while (true) {
        if (chunks.length) return { value: chunks.shift(), done: false };
        if (failure) {
          stop();
          throw failure.error;
        }
        if (ended) {
          stop();
          return { value: undefined, done: true };
        }
        await new Promise<void>((resolve) => (wake = resolve));
      }
    },
    async return() {
      stop();
      stream.destroy?.();
      return { value: undefined, done: true };
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };
}

export function patchStreams(stream: StreamModule | undefined): void {
  if (!stream?.Stream || !stream.Readable || !stream.Writable) return;
  const { Stream, Readable, Writable } = stream;
  const readable = Object.create(Readable.prototype) as object;
  if (!instanceOf(readable, Stream))
    // Only `instanceof Stream` itself widens; a subclass keeps its own check.
    Object.defineProperty(Stream, Symbol.hasInstance, {
      configurable: true,
      value(this: Constructor, value: unknown) {
        return (
          instanceOf(value, this) ||
          (this === Stream && (instanceOf(value, Readable) || instanceOf(value, Writable)))
        );
      },
    });
  if (!(Symbol.asyncIterator in Readable.prototype))
    Object.defineProperty(Readable.prototype, Symbol.asyncIterator, {
      configurable: true,
      writable: true,
      value(this: Emitter) {
        return readableAsyncIterator(this);
      },
    });
}
