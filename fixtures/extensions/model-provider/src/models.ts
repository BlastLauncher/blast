import type { AI } from "@raycast/api";

export const getModels: AI.GetModels = () => [
  {
    id: "text",
    title: "Text Model",
    isLocal: true,
    description: "Offline fixture",
    contextWindow: 4096,
    sizeInBytes: 123,
    icon: {
      source: { light: "light.png", dark: "dark.png" },
      fallback: "fallback.png",
      mask: "circle",
      tintColor: "red",
    },
    capabilities: {
      systemMessage: { supported: true },
      temperature: { supported: true },
      vision: { mediaTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"] },
      tools: { supported: true },
      streaming: { supported: true },
      reasoningEffort: { supported: true, options: ["low", "high"], default: "low" },
    },
  },
  {
    id: "full",
    title: "Full Model",
    icon: { fileIcon: "fixture.txt" },
    capabilities: { streaming: { supported: true } },
  },
];

export const streamCompletion: AI.StreamCompletion = (model, request) => {
  if (request.system === "throw") throw new Error("fixture provider threw");
  if (request.system === "attachments") {
    const message = request.messages?.[0];
    if (message?.role !== "user") throw new Error("missing user message");
    const data = message.content.map((part) => (part.type === "file" ? part.data : null));
    if (
      !(data[0] instanceof Uint8Array) ||
      data[0][0] !== 7 ||
      !(data[1] instanceof ArrayBuffer) ||
      new Uint8Array(data[1])[0] !== 8 ||
      !(data[2] instanceof URL) ||
      data[2].href !== "https://example.com/image" ||
      data[3] !== "base64"
    )
      throw new Error("attachment types lost");
  }
  if (request.system === "hang")
    return {
      textStream: (async function* () {
        yield "first";
        await new Promise(() => {});
        yield "late";
      })(),
    };
  if (request.system === "reject")
    return {
      fullStream: (async function* () {
        yield { type: "text", text: "first" } as const;
        throw new Error("stream rejected");
      })(),
    };
  if (model.id === "text")
    return {
      textStream: new ReadableStream<string>({
        start(controller) {
          controller.enqueue("Hello ");
          controller.enqueue("world");
          controller.close();
        },
      }),
    };
  return {
    fullStream: (async function* () {
      yield { type: "text-start", id: "answer" } as const;
      yield { type: "text-delta", id: "answer", text: "Hello " } as const;
      yield { type: "text-delta", id: "answer", textDelta: "world" } as const;
      yield { type: "text-end", id: "answer" } as const;
      yield {
        type: "finish",
        finishReason: "stop",
        totalUsage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      } as const;
    })(),
  };
};
