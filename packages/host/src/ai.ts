import type { JsonValue, RegisteredModel, CapabilityRequestMessage } from "@blastlauncher/protocol";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { dirname } from "node:path";
import { bundleModelProvider } from "./bundle.ts";
import { startModelProvider } from "./provider.ts";
import { createBroker, type CapabilityContext } from "./broker.ts";
import type { StartOptions } from "./session.ts";

/** Own-extension providers share the command's lifetime and need no capability grant. */
export function createAIRouter(options: StartOptions) {
  const sessionId = randomUUID();
  let loading: Promise<Awaited<ReturnType<typeof startModelProvider>>> | undefined;
  let directory: string | undefined;
  let models: RegisteredModel[] | undefined;
  const provider = () =>
    (loading ??= (async () => {
      const bundled = await bundleModelProvider({
        extensionDir: options.modelProviderDir!,
        ...(options.dataDir === undefined ? {} : { dataDir: options.dataDir }),
      });
      directory = dirname(bundled.entry);
      const { environment: _environment, ...inherited } = options;
      return startModelProvider({
        ...inherited,
        ...bundled,
        ...(options.environment
          ? { environment: { ...options.environment, commandName: bundled.commandName } }
          : {}),
      });
    })());
  const broker = createBroker({
    "ai.models.refresh": async () => {
      if (options.modelProviderDir) models = await (await provider()).getModels();
    },
    "ai.ask": async (params, context = { signal: new AbortController().signal, progress() {} }) => {
      const { model, prompt, creativity } = params as {
        model: { id: string };
        prompt: string;
        creativity?: string | number;
      };
      const session = await provider();
      models ??= await session.getModels();
      if (context.signal.aborted) throw new DOMException("The operation was aborted", "AbortError");
      const selected = models.find((item) => item.id === model.id);
      if (!selected) throw new Error(`Unknown model ${model.id}`);
      const temperature =
        typeof creativity === "number"
          ? Math.max(0, Math.min(2, creativity))
          : creativity === undefined
            ? undefined
            : ({ none: 0, low: 0.5, medium: 1, high: 1.5, maximum: 2 } as Record<string, number>)[
                creativity
              ];
      let text = "";
      for await (const part of session.stream(
        selected,
        {
          messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
          ...(temperature === undefined ? {} : { temperature }),
          providerOptions: {
            raycast: {
              locale: "en",
              currentDate: new Date().toISOString(),
              sessionId,
            },
          },
        },
        { signal: context.signal },
      )) {
        if (part.type === "error") throw new Error(String(part.error));
        const chunk =
          part.type === "text-delta"
            ? (part.textDelta ?? part.text)
            : part.type === "text"
              ? part.text
              : undefined;
        if (chunk !== undefined) {
          text += chunk;
          context.progress(chunk);
        }
      }
      return text;
    },
  });
  return {
    broker(request: CapabilityRequestMessage, context?: CapabilityContext) {
      const model = (request.params as { model?: JsonValue } | null)?.model;
      return request.name === "ai.models.refresh" ||
        (options.modelProviderDir &&
          request.name === "ai.ask" &&
          model !== null &&
          typeof model === "object")
        ? broker(request, context)
        : options.broker(request, context);
    },
    async shutdown() {
      try {
        await (await loading)?.shutdown({ timeoutMs: 250 });
      } catch {
        /* Startup failures still own a bundle directory. */
      } finally {
        if (directory) await rm(directory, { recursive: true, force: true });
      }
    },
  };
}
