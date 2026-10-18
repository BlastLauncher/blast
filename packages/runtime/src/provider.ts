import type { AI } from "./api/index.ts";
import {
  decodeModelRequest,
  parseRuntimeMessage,
  type ProviderRequest,
  type ProviderResponse,
  type ModelStreamPart,
} from "@blastlauncher/protocol";

export function createModelProvider(
  exports: { getModels?: AI.GetModels; streamCompletion?: AI.StreamCompletion },
  send: (message: ProviderResponse) => void,
) {
  if (typeof exports.getModels !== "function" || typeof exports.streamCompletion !== "function")
    throw new Error("Model provider requires named getModels and streamCompletion exports");
  const active = new Map<string, { cancelled: boolean; iterator?: AsyncIterator<unknown> }>();
  function emit(message: ProviderResponse) {
    const parsed = parseRuntimeMessage(JSON.parse(JSON.stringify(message)));
    if (!parsed.ok) throw new Error(parsed.error);
    send(parsed.message as ProviderResponse);
  }
  async function run(message: Exclude<ProviderRequest, { type: "provider.abort" }>) {
    const state: { cancelled: boolean; iterator?: AsyncIterator<unknown> } = { cancelled: false };
    if (active.has(message.id)) throw new Error("Duplicate provider request id");
    active.set(message.id, state);
    try {
      if (message.type === "provider.getModels") {
        const models = await exports.getModels!();
        if (!state.cancelled)
          emit({
            type: "provider.models",
            id: message.id,
            models: models.map(
              (model) =>
                Object.fromEntries(
                  [
                    "id",
                    "title",
                    "isLocal",
                    "icon",
                    "description",
                    "capabilities",
                    "contextWindow",
                    "sizeInBytes",
                  ]
                    .filter((key) => Object.hasOwn(model, key))
                    .map((key) => [key, model[key as keyof typeof model]]),
                ) as typeof model,
            ),
          });
      } else {
        const result = await exports.streamCompletion!(
          message.model as AI.RegisteredModel,
          decodeModelRequest(message.request),
        );
        const stream =
          "fullStream" in result
            ? result.fullStream
            : "textStream" in result
              ? result.textStream
              : result;
        const iterator = (stream as AsyncIterable<unknown>)[Symbol.asyncIterator]();
        state.iterator = iterator;
        if (state.cancelled) {
          void Promise.resolve()
            .then(() => iterator.return?.())
            .catch(() => undefined);
          return;
        }
        while (!state.cancelled) {
          const next = await iterator.next();
          if (state.cancelled || next.done) break;
          emit({
            type: "provider.part",
            id: message.id,
            part:
              typeof next.value === "string"
                ? { type: "text-delta", textDelta: next.value }
                : (next.value as ModelStreamPart),
          });
        }
        if (!state.cancelled) emit({ type: "provider.end", id: message.id });
      }
    } catch (error) {
      if (!state.cancelled)
        send({
          type: "provider.error",
          id: message.id,
          error: {
            code: "PROVIDER_ERROR",
            message: error instanceof Error ? error.message : String(error),
          },
        });
    } finally {
      active.delete(message.id);
    }
  }
  return {
    handle(message: ProviderRequest) {
      if (message.type === "provider.abort") {
        const state = active.get(message.id);
        if (state) {
          state.cancelled = true;
          // A blocked producer need not cooperate; stop publishing immediately.
          void Promise.resolve()
            .then(() => state.iterator?.return?.())
            .catch(() => undefined);
          active.delete(message.id);
        }
        return;
      }
      void run(message).catch((error: unknown) =>
        send({
          type: "provider.error",
          id: message.id,
          error: { code: "PROVIDER_ERROR", message: String(error) },
        }),
      );
    },
  };
}
