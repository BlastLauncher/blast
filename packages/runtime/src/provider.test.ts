import { expect, test } from "bun:test";
import { createModelProvider } from "./provider.ts";
import { encodeModelRequest, type ProviderResponse } from "@blastlauncher/protocol";
import type { AI } from "./api/index.ts";

// @covers AI.GetModels
// @covers AI.StreamCompletion
// @covers AI.ModelFullStream
// @covers AI.ModelTextStream
// @covers AI.ModelStream
// @covers AI.ModelStream.fullStream
// @covers AI.ModelStream.textStream
// @covers AI.ModelTool
// @covers AI.ModelTool.type
// @covers AI.ModelTool.description
// @covers AI.ModelTool.inputSchema

const getModels: AI.GetModels = () => [{ id: "m", title: "Model" }];

test("direct text iterables and direct full ReadableStreams normalize without losing parts", async () => {
  const tool: AI.ModelTool = { type: "function", description: "Tool", inputSchema: {} };
  expect(tool.type).toBe("function");
  for (const full of [false, true]) {
    const text: AI.ModelTextStream = (async function* () {
      yield "direct";
    })();
    const stream: AI.ModelFullStream = new ReadableStream<AI.ModelStreamPart>({
      start(controller) {
        controller.enqueue({ type: "text", text: "direct" });
        controller.close();
      },
    });
    const result: AI.ModelStream = full ? stream : text;
    const streamCompletion: AI.StreamCompletion = () => result;
    const messages: ProviderResponse[] = [];
    let finish: () => void;
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const provider = createModelProvider({ getModels, streamCompletion }, (message) => {
      messages.push(message);
      if (message.type === "provider.end" || message.type === "provider.error") finish();
    });
    const models = await getModels();
    provider.handle({
      type: "provider.stream",
      id: "s",
      model: models[0]!,
      request: encodeModelRequest({
        providerOptions: { raycast: { locale: "en", currentDate: "today", sessionId: "test" } },
      }),
    });
    await finished;
    expect(messages).toEqual([
      {
        type: "provider.part",
        id: "s",
        part: full ? { type: "text", text: "direct" } : { type: "text-delta", textDelta: "direct" },
      },
      { type: "provider.end", id: "s" },
    ]);
  }
});

test("abort calls iterator return and suppresses late parts", async () => {
  let release: (value: IteratorResult<string>) => void;
  let returned = false;
  let started: () => void;
  const waiting = new Promise<void>((resolve) => {
    started = resolve;
  });
  const messages: ProviderResponse[] = [];
  const provider = createModelProvider(
    {
      getModels: () => [],
      streamCompletion: () => ({
        [Symbol.asyncIterator]() {
          return {
            next: () => {
              started();
              return new Promise<IteratorResult<string>>((resolve) => {
                release = resolve;
              });
            },
            return: async () => {
              returned = true;
              return { done: true, value: undefined };
            },
          };
        },
      }),
    },
    (message) => messages.push(message),
  );
  provider.handle({
    type: "provider.stream",
    id: "s",
    model: { id: "m", title: "Model" },
    request: encodeModelRequest({
      providerOptions: { raycast: { locale: "en", currentDate: "today", sessionId: "test" } },
    }),
  });
  await waiting;
  provider.handle({ type: "provider.abort", id: "s" });
  release!({ done: false, value: "late" });
  await Promise.resolve();
  await Promise.resolve();
  expect(returned).toBe(true);
  expect(messages).toEqual([]);
});

test("model listings project declared fields while preserving strict protocol validation", async () => {
  const message = await new Promise<ProviderResponse>((resolve) => {
    createModelProvider(
      {
        getModels: () => [{ id: "m", title: "Model", providerPrivate: 1n }],
        streamCompletion: async function* () {},
      },
      resolve,
    ).handle({ type: "provider.getModels", id: "list" });
  });
  expect(message).toEqual({
    type: "provider.models",
    id: "list",
    models: [{ id: "m", title: "Model" }],
  });
});

test("projected model listings still reject malformed declared fields", async () => {
  const message = await new Promise<ProviderResponse>((resolve) => {
    createModelProvider(
      {
        getModels: () => [{ id: "m", title: "Model", contextWindow: "large" }] as never,
        streamCompletion: async function* () {},
      },
      resolve,
    ).handle({ type: "provider.getModels", id: "invalid" });
  });
  expect(message).toMatchObject({
    type: "provider.error",
    id: "invalid",
    error: { code: "PROVIDER_ERROR" },
  });
});
