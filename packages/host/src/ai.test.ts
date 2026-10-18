import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createAIRouter } from "./ai.ts";
import { createBroker } from "./broker.ts";
import type { JsonValue } from "@blastlauncher/protocol";

test("own-provider routing reuses its child, refreshes listings, maps requests and cancels blocked streams", async () => {
  const directory = await mkdtemp(join(tmpdir(), "blast-ai-route-"));
  const router = createAIRouter({
    entry: "unused",
    extensionName: "model-provider-fixture",
    commandName: "ask",
    mode: "no-view",
    arguments: [],
    dataDir: directory,
    modelProviderDir: fileURLToPath(
      new URL("../../../fixtures/extensions/model-provider", import.meta.url),
    ),
    broker: createBroker({}),
  });
  let id = 0;
  const ask = (creativity?: JsonValue) =>
    router.broker({
      type: "capability.request",
      id: String(++id),
      name: "ai.ask",
      params: {
        model: { id: "text" },
        prompt: "inspect",
        ...(creativity === undefined ? {} : { creativity }),
      },
    });
  const inspect = async (creativity?: JsonValue) => {
    const result = await ask(creativity);
    if (!result.ok || typeof result.value !== "string") throw new Error(JSON.stringify(result));
    return JSON.parse(result.value);
  };
  try {
    expect(await inspect("low")).toMatchObject({
      listings: 1,
      temperature: 0.5,
      messages: [{ role: "user", content: [{ type: "text", text: "inspect" }] }],
    });
    for (const [creativity, temperature] of [
      ["none", 0],
      ["medium", 1],
      ["high", 1.5],
      ["maximum", 2],
      [3, 2],
      [-1, 0],
    ] as const)
      expect(await inspect(creativity)).toMatchObject({ listings: 1, temperature });
    expect((await inspect()).temperature).toBeUndefined();
    await router.broker({
      type: "capability.request",
      id: "refresh",
      name: "ai.models.refresh",
      params: {},
    });
    expect((await inspect()).listings).toBe(2);
    expect(
      await router.broker({
        type: "capability.request",
        id: "unknown",
        name: "ai.ask",
        params: { model: { id: "unknown" }, prompt: "q" },
      }),
    ).toMatchObject({ ok: false, error: { message: "Unknown model unknown" } });
    const controller = new AbortController();
    const chunks: JsonValue[] = [];
    const aborted = await router.broker(
      {
        type: "capability.request",
        id: "abort",
        name: "ai.ask",
        params: { model: { id: "text" }, prompt: "hang" },
      },
      {
        signal: controller.signal,
        progress(value) {
          chunks.push(value);
          controller.abort();
        },
      },
    );
    expect(chunks).toEqual(["first"]);
    expect(aborted).toMatchObject({ ok: false, error: { message: "The operation was aborted" } });
  } finally {
    await router.shutdown();
    await rm(directory, { recursive: true, force: true });
  }
});

test("refresh without a provider is a no-op and external asks and decisions stay denied", async () => {
  const router = createAIRouter({
    entry: "unused",
    extensionName: "empty",
    commandName: "empty",
    mode: "no-view",
    arguments: [],
    broker: createBroker({}),
  });
  for (const name of ["ai.models.refresh", "ai.ask", "ai.decide"]) {
    expect(
      (await router.broker({ type: "capability.request", id: name, name, params: {} })).ok,
    ).toBe(name === "ai.models.refresh");
  }
  await router.shutdown();
});
