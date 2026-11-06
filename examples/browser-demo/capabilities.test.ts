import { describe, expect, test } from "bun:test";
import { createBrowserCapabilities, type BrowserStorage } from "./capabilities.ts";

function catalog() {
  return {
    commit: "fixture",
    extensions: [
      {
        name: "alpha",
        title: "Alpha",
        commands: [{ name: "index", title: "Index", mode: "view" }],
      },
      { name: "beta", title: "Beta", commands: [{ name: "other", title: "Other", mode: "view" }] },
    ],
  } as const as import("./root.ts").Catalog;
}

function storage(throws = false): BrowserStorage {
  const values = new Map<string, string>();
  return {
    get length() {
      if (throws) throw new Error("private mode");
      return values.size;
    },
    getItem(key) {
      if (throws) throw new Error("private mode");
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      if (throws) throw new Error("private mode");
      values.set(key, value);
    },
    removeItem(key) {
      if (throws) throw new Error("private mode");
      values.delete(key);
    },
    key(index) {
      if (throws) throw new Error("private mode");
      return [...values.keys()][index] ?? null;
    },
  };
}

const context = { extensionName: "alpha", commandName: "index", source: "alpha" };

describe("browser capabilities", () => {
  test("storage round trips, isolates extensions, and supports all and clear", async () => {
    const handle = createBrowserCapabilities({ catalog: catalog(), storage: storage() });
    expect(
      await handle({ name: "storage.set", params: { key: "answer", value: 42 } }, context),
    ).toEqual({ ok: true, value: null });
    expect(await handle({ name: "storage.get", params: { key: "answer" } }, context)).toEqual({
      ok: true,
      value: 42,
    });
    expect(
      await handle(
        { name: "storage.set", params: { key: "draft", value: "x", scope: "blast:internal" } },
        context,
      ),
    ).toEqual({ ok: true, value: null });
    expect(await handle({ name: "storage.all", params: {} }, context)).toEqual({
      ok: true,
      value: { answer: 42 },
    });
    expect(
      await handle(
        { name: "storage.get", params: { key: "answer" } },
        { ...context, extensionName: "beta" },
      ),
    ).toEqual({ ok: true, value: null });
    await handle({ name: "storage.clear", params: {} }, context);
    expect(await handle({ name: "storage.get", params: { key: "answer" } }, context)).toEqual({
      ok: true,
      value: null,
    });
    expect(
      await handle(
        { name: "storage.get", params: { key: "draft", scope: "blast:internal" } },
        context,
      ),
    ).toEqual({ ok: true, value: "x" });
  });

  test("falls back to memory when localStorage throws", async () => {
    const handle = createBrowserCapabilities({ catalog: catalog(), storage: storage(true) });
    await handle({ name: "storage.set", params: { key: "answer", value: true } }, context);
    expect(await handle({ name: "storage.get", params: { key: "answer" } }, context)).toEqual({
      ok: true,
      value: true,
    });
  });

  test("clipboard reads the browser value, falls back to copied value, and pastes", async () => {
    let browserValue = "from browser";
    let clipboardDenied = false;
    const copied: string[] = [];
    const statuses: string[] = [];
    const handle = createBrowserCapabilities({
      catalog: catalog(),
      clipboard: {
        readText: async () => {
          if (clipboardDenied) throw new Error("permission denied");
          return browserValue;
        },
        writeText: async (value) => {
          copied.push(value);
        },
      },
      status: (value) => statuses.push(value),
    });
    expect(await handle({ name: "clipboard.read", params: {} }, context)).toEqual({
      ok: true,
      value: { text: "from browser" },
    });
    await handle({ name: "clipboard.paste", params: { text: "paste me" } }, context);
    expect(copied).toEqual(["paste me"]);
    expect(statuses).toContain("Copied — paste with ⌘V");
    clipboardDenied = true;
    expect(await handle({ name: "clipboard.read", params: {} }, context)).toEqual({
      ok: true,
      value: { text: "paste me" },
    });
  });

  test("metadata and same-extension launch work, cross-extension launch is denied", async () => {
    const launches: string[] = [];
    const handle = createBrowserCapabilities({
      catalog: catalog(),
      launchCommand: async (source, command) => {
        launches.push(`${source}:${command}`);
      },
    });
    expect(
      await handle({ name: "command.metadata", params: { subtitle: "changed" } }, context),
    ).toEqual({ ok: true, value: null });
    expect(
      await handle(
        { name: "command.launch", params: { name: "index", type: "userInitiated" } },
        context,
      ),
    ).toEqual({ ok: true, value: null });
    expect(launches).toEqual(["alpha:index"]);
    const denied = await handle(
      {
        name: "command.launch",
        params: { name: "other", type: "userInitiated", extensionName: "beta" },
      },
      context,
    );
    expect(denied).toMatchObject({
      ok: false,
      error: { message: "The browser demo can launch commands only from the current extension" },
    });
  });

  test("oauth tokens are extension scoped", async () => {
    const handle = createBrowserCapabilities({ catalog: catalog(), storage: storage() });
    const tokens = { accessToken: "a", refreshToken: "r", scope: ["read"] };
    await handle({ name: "oauth.tokens.set", params: { providerId: "fixture", tokens } }, context);
    expect(
      await handle({ name: "oauth.tokens.get", params: { providerId: "fixture" } }, context),
    ).toEqual({ ok: true, value: tokens });
    expect(
      await handle(
        { name: "oauth.tokens.get", params: { providerId: "fixture" } },
        { ...context, extensionName: "beta" },
      ),
    ).toEqual({ ok: true, value: null });
    await handle({ name: "oauth.tokens.remove", params: { providerId: "fixture" } }, context);
    expect(
      await handle({ name: "oauth.tokens.get", params: { providerId: "fixture" } }, context),
    ).toEqual({ ok: true, value: null });
  });

  test("denials name the browser limitation", async () => {
    const handle = createBrowserCapabilities({ catalog: catalog() });
    for (const [name, phrase] of [
      ["applications.list", "Applications"],
      ["selection.text", "Selection"],
      ["window.active", "Window management"],
      ["ai.ask", "AI access"],
      ["oauth.authorize", "host redirect"],
      ["preferences.open", "managed by the browser demo host"],
    ] as const) {
      const result = await handle({ name, params: {} }, context);
      expect(result).toMatchObject({
        ok: false,
        error: { message: expect.stringContaining(phrase) },
      });
    }
  });
});
