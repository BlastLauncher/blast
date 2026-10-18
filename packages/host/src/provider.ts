import {
  encodeModelRequest,
  type ModelRequest,
  type ModelStreamPart,
  type ProviderResponse,
  type RegisteredModel,
} from "@blastlauncher/protocol";
import { createBroker } from "./broker.ts";
import { startCommand, type StartOptions } from "./session.ts";

export async function startModelProvider(
  options: Omit<StartOptions, "broker" | "providerResponse"> & { broker?: StartOptions["broker"] },
) {
  let nextId = 0;
  let closed = false;
  const pending = new Map<string, (message: ProviderResponse | Error) => void>();
  const session = await startCommand({
    ...options,
    mode: "model-provider",
    broker: options.broker ?? createBroker({}),
    providerResponse(message) {
      pending.get(message.id)?.(message);
    },
  });
  void session.exited.then((exit) => {
    closed = true;
    for (const receive of pending.values())
      receive(exit.error ?? new Error("Model provider exited"));
    pending.clear();
  });
  return {
    shutdown: session.shutdown,
    exited: session.exited,
    logs: session.logs,
    getModels(): Promise<RegisteredModel[]> {
      if (closed) return Promise.reject(new Error("Model provider exited"));
      const id = String(++nextId);
      return new Promise((resolve, reject) => {
        pending.set(id, (message) => {
          pending.delete(id);
          if (message instanceof Error) reject(message);
          else if (message.type === "provider.models") resolve(message.models);
          else if (message.type === "provider.error")
            reject(Object.assign(new Error(message.error.message), { code: message.error.code }));
          else reject(new Error("Unexpected model provider response"));
        });
        session.sendProvider({ type: "provider.getModels", id });
      });
    },
    async *stream(
      model: RegisteredModel,
      request: ModelRequest,
      { signal }: { signal?: AbortSignal } = {},
    ): AsyncGenerator<ModelStreamPart> {
      if (closed) throw new Error("Model provider exited");
      const id = String(++nextId);
      const queue: ModelStreamPart[] = [];
      let done = false;
      let failure: Error | undefined;
      let wake: (() => void) | undefined;
      const abort = () => {
        failure = new DOMException("The operation was aborted", "AbortError");
        session.sendProvider({ type: "provider.abort", id });
        wake?.();
      };
      if (signal?.aborted) throw new DOMException("The operation was aborted", "AbortError");
      pending.set(id, (message) => {
        if (message instanceof Error) failure = message;
        else if (message.type === "provider.error")
          failure = Object.assign(new Error(message.error.message), { code: message.error.code });
        else if (message.type === "provider.part") queue.push(message.part);
        else if (message.type === "provider.end") done = true;
        else failure = new Error("Unexpected model provider response");
        wake?.();
      });
      signal?.addEventListener("abort", abort, { once: true });
      try {
        session.sendProvider({
          type: "provider.stream",
          id,
          model,
          request: encodeModelRequest(request),
        });
        while (true) {
          if (failure) throw failure;
          if (queue.length) yield queue.shift()!;
          else if (done) return;
          else
            await new Promise<void>((resolve) => {
              wake = resolve;
            });
        }
      } finally {
        pending.delete(id);
        signal?.removeEventListener("abort", abort);
        if (!done) session.sendProvider({ type: "provider.abort", id });
      }
    },
  };
}
