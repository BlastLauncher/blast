// @covers AI.ModelMessage
// @covers AI.ModelMessage.content
// @covers AI.ModelMessage.role
// @covers AI.ModelMessageContent
// @covers AI.ModelProviderOptions
// @covers AI.ModelProviderOptions.raycast
// @covers AI.ModelProviderOptions.raycast.currentDate
// @covers AI.ModelProviderOptions.raycast.locale
// @covers AI.ModelProviderOptions.raycast.reasoningEffort
// @covers AI.ModelProviderOptions.raycast.sessionId
// @covers AI.ModelRequest
// @covers AI.ModelRequest.messages
// @covers AI.ModelRequest.providerOptions
// @covers AI.ModelRequest.system
// @covers AI.ModelRequest.temperature
// @covers AI.ModelRequest.toolChoice
// @covers AI.ModelRequest.tools
// @covers AI.ModelToolSet
// @covers AI.RegisteredModel
// @covers AI.RegisteredModel.capabilities
// @covers AI.RegisteredModel.capabilities.reasoningEffort
// @covers AI.RegisteredModel.capabilities.reasoningEffort.default
// @covers AI.RegisteredModel.capabilities.reasoningEffort.options
// @covers AI.RegisteredModel.capabilities.reasoningEffort.supported
// @covers AI.RegisteredModel.capabilities.streaming
// @covers AI.RegisteredModel.capabilities.streaming.supported
// @covers AI.RegisteredModel.capabilities.systemMessage
// @covers AI.RegisteredModel.capabilities.systemMessage.supported
// @covers AI.RegisteredModel.capabilities.temperature
// @covers AI.RegisteredModel.capabilities.temperature.supported
// @covers AI.RegisteredModel.capabilities.tools
// @covers AI.RegisteredModel.capabilities.tools.supported
// @covers AI.RegisteredModel.capabilities.vision
// @covers AI.RegisteredModel.capabilities.vision.mediaTypes
// @covers AI.RegisteredModel.contextWindow
// @covers AI.RegisteredModel.description
// @covers AI.RegisteredModel.icon
// @covers AI.RegisteredModel.id
// @covers AI.RegisteredModel.isLocal
// @covers AI.RegisteredModel.sizeInBytes
// @covers AI.RegisteredModel.title
import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { bundleModelProvider, startModelProvider } from "./index.ts";
import type { AI } from "../../runtime/src/api/index.ts";

const fixture = fileURLToPath(
  new URL("../../../fixtures/extensions/model-provider", import.meta.url),
);
const request: AI.ModelRequest = {
  system: "system",
  temperature: 0.5,
  toolChoice: "required",
  tools: {
    lookup: { type: "function", description: "Lookup", inputSchema: { type: "object" } },
  } satisfies AI.ModelToolSet,
  messages: [
    { role: "system", content: "system" },
    { role: "user", content: [{ type: "text", text: "hello" }] satisfies AI.ModelMessageContent },
    {
      role: "assistant",
      content: [
        { type: "reasoning", text: "thinking" },
        { type: "tool-call", toolCallId: "call", toolName: "lookup", input: {} },
      ],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "call",
          toolName: "lookup",
          input: {},
          output: { type: "json", value: { ok: true } },
        },
      ],
    },
  ] satisfies AI.ModelMessage[],
  providerOptions: {
    raycast: {
      locale: "en",
      currentDate: "2026-10-18",
      sessionId: "fixture",
      reasoningEffort: "low",
    },
  } satisfies AI.ModelProviderOptions,
};

async function withProvider(
  run: (provider: Awaited<ReturnType<typeof startModelProvider>>) => Promise<void>,
) {
  const directory = await mkdtemp(join(tmpdir(), "blast-provider-"));
  const bundled = await bundleModelProvider({
    extensionDir: fixture,
    outDir: join(directory, "build"),
  });
  const provider = await startModelProvider({ ...bundled, dataDir: directory });
  try {
    await run(provider);
  } finally {
    await provider.shutdown({ timeoutMs: 100 });
    await rm(directory, { recursive: true, force: true });
  }
}

test("provider lists typed models, serializes icons and streams both forms concurrently", async () => {
  await withProvider(async (provider) => {
    const models = await provider.getModels();
    const typed: AI.RegisteredModel = {
      ...models[0]!,
      icon: {
        source: { light: "light.png", dark: "dark.png" },
        fallback: "fallback.png",
        mask: "circle",
        tintColor: "red",
      },
    };
    expect(models[0]).toEqual(typed);
    expect(models.map((model) => [model.id, model.title])).toEqual([
      ["text", "Text Model"],
      ["full", "Full Model"],
    ]);
    expect(models[0]).toMatchObject({
      isLocal: true,
      contextWindow: 4096,
      sizeInBytes: 123,
      description: "Offline fixture",
      icon: {
        source: { light: "light.png", dark: "dark.png" },
        fallback: "fallback.png",
        mask: "circle",
        tintColor: "red",
      },
      capabilities: {
        reasoningEffort: { supported: true, options: ["low", "high"], default: "low" },
        vision: { mediaTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"] },
        tools: { supported: true },
        systemMessage: { supported: true },
        temperature: { supported: true },
        streaming: { supported: true },
      },
    });
    expect(models[1]!.icon).toEqual({ fileIcon: "fixture.txt" });
    const streams = await Promise.all(
      models.map(async (model) => Array.fromAsync(provider.stream(model, request))),
    );
    expect(streams[0]).toEqual([
      { type: "text-delta", textDelta: "Hello " },
      { type: "text-delta", textDelta: "world" },
    ]);
    expect(streams[1]).toEqual([
      { type: "text-start", id: "answer" },
      { type: "text-delta", id: "answer", text: "Hello " },
      { type: "text-delta", id: "answer", textDelta: "world" },
      { type: "text-end", id: "answer" },
      {
        type: "finish",
        finishReason: "stop",
        totalUsage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      },
    ]);
  });
});

test("attachment URL, bytes, buffer and string survive the child boundary", async () => {
  await withProvider(async (provider) => {
    const model = (await provider.getModels())[0]!;
    const bytes = new Uint8Array([0, 7, 0]).subarray(1, 2);
    const parts = await Array.fromAsync(
      provider.stream(model, {
        ...request,
        system: "attachments",
        messages: [
          {
            role: "user",
            content: [
              bytes,
              new Uint8Array([8]).buffer,
              new URL("https://example.com/image"),
              "base64",
            ].map((data) => ({ type: "file", data, mediaType: "image/png" })),
          },
        ],
      }),
    );
    expect(parts).toHaveLength(2);
  });
});

test("throwing and rejecting providers reject iteration while the session remains usable", async () => {
  await withProvider(async (provider) => {
    const model = (await provider.getModels())[0]!;
    for (const system of ["throw", "reject"])
      await expect(Array.fromAsync(provider.stream(model, { ...request, system }))).rejects.toThrow(
        system === "throw" ? "fixture provider threw" : "stream rejected",
      );
    expect(await provider.getModels()).toHaveLength(2);
  });
});

test("abort rejects blocked iteration, pre-abort sends no request, early return and shutdown settle", async () => {
  await withProvider(async (provider) => {
    const model = (await provider.getModels())[0]!;
    const controller = new AbortController();
    const stream = provider.stream(
      model,
      { ...request, system: "hang" },
      { signal: controller.signal },
    );
    expect((await stream.next()).value).toEqual({ type: "text-delta", textDelta: "first" });
    const waiting = stream.next();
    controller.abort();
    await expect(waiting).rejects.toMatchObject({ name: "AbortError" });
    await expect(
      Array.fromAsync(provider.stream(model, request, { signal: controller.signal })),
    ).rejects.toMatchObject({ name: "AbortError" });
    const early = provider.stream(model, request);
    await early.next();
    await early.return(undefined);
    const hanging = provider.stream(model, { ...request, system: "hang" });
    await hanging.next();
    const pending = hanging.next();
    await provider.shutdown({ timeoutMs: 100 });
    await expect(pending).rejects.toThrow("exited");
    await expect(provider.getModels()).rejects.toThrow("exited");
  });
});

test("missing exports and getModels throwing fail without hanging", async () => {
  for (const source of [
    "export const getModels = () => [];",
    "export const getModels = () => { throw new Error('listing failed'); }; export const streamCompletion = () => []; ",
  ]) {
    const dir = await mkdtemp(join(tmpdir(), "blast-provider-invalid-"));
    let provider: Awaited<ReturnType<typeof startModelProvider>> | undefined;
    try {
      await mkdir(join(dir, "src"));
      await writeFile(
        join(dir, "package.json"),
        JSON.stringify({ name: "invalid", ai: { modelProvider: "models" } }),
      );
      await writeFile(join(dir, "src/models.ts"), source);
      const bundled = await bundleModelProvider({ extensionDir: dir, outDir: join(dir, "build") });
      provider = await startModelProvider({ ...bundled, dataDir: dir });
      await expect(provider.getModels()).rejects.toThrow(
        source.includes("listing failed")
          ? "listing failed"
          : "named getModels and streamCompletion",
      );
    } finally {
      await provider?.shutdown({ timeoutMs: 100 });
      await rm(dir, { recursive: true, force: true });
    }
  }
});
