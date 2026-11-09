import { describe, expect, test } from "bun:test";
import {
  createBrowserCapabilities,
  createBrowserPreferenceStore,
  type BrowserStorage,
} from "./capabilities.ts";

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

  test("a user key named like an internal one stays in LocalStorage and never collides", async () => {
    const handle = createBrowserCapabilities({ catalog: catalog(), storage: storage() });
    await handle(
      { name: "storage.set", params: { key: "draft", value: "internal", scope: "blast:internal" } },
      context,
    );
    await handle(
      { name: "storage.set", params: { key: "internal:draft", value: "user" } },
      context,
    );
    expect(await handle({ name: "storage.all", params: {} }, context)).toEqual({
      ok: true,
      value: { "internal:draft": "user" },
    });
    expect(
      await handle(
        { name: "storage.get", params: { key: "draft", scope: "blast:internal" } },
        context,
      ),
    ).toEqual({ ok: true, value: "internal" });
    await handle({ name: "storage.clear", params: {} }, context);
    expect(
      await handle(
        { name: "storage.get", params: { key: "draft", scope: "blast:internal" } },
        context,
      ),
    ).toEqual({ ok: true, value: "internal" });
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
    const statuses: string[] = [];
    const handle = createBrowserCapabilities({
      catalog: catalog(),
      launchCommand: async (source, command) => {
        launches.push(`${source}:${command}`);
      },
      status: (value) => statuses.push(value),
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
    // A background launch is acknowledged without replacing the caller's
    // foreground session; doing so lost the capability reply and left
    // one-thing/remove-one-thing waiting forever.
    expect(
      await handle(
        { name: "command.launch", params: { name: "index", type: "background" } },
        context,
      ),
    ).toEqual({ ok: true, value: null });
    expect(launches).toEqual(["alpha:index"]);
    expect(statuses.at(-1)).toBe("Background command accepted: index");
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
    expect(
      await handle(
        { name: "command.launch", params: { name: "missing", type: "background" } },
        context,
      ),
    ).toMatchObject({
      ok: false,
      error: { message: "That command is not in the browser catalog" },
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
      ["applications.default", "Applications"],
      ["selection.text", "Selection"],
      ["window.active", "Window management"],
      ["ai.ask", "AI access"],
      ["oauth.authorize", "host redirect"],
    ] as const) {
      const result = await handle({ name, params: {} }, context);
      expect(result).toMatchObject({
        ok: false,
        error: { message: expect.stringContaining(phrase) },
      });
    }
  });

  test("browser preference store scopes values and survives storage failures", () => {
    const browserStorage = storage();
    const first = createBrowserPreferenceStore("alpha", browserStorage);
    first.update({ shared: "extension" }, "index", { secret: "one" });
    expect(first.values("index")).toEqual({ shared: "extension", secret: "one" });
    expect(createBrowserPreferenceStore("beta", browserStorage).values("index")).toEqual({});
    browserStorage.setItem("blast:alpha:preferences", "not-json");
    expect(createBrowserPreferenceStore("alpha", browserStorage).values("index")).toEqual({});
    const fallback = createBrowserPreferenceStore("alpha", storage(true));
    fallback.update({ answer: true }, "index", {});
    expect(fallback.values("index")).toEqual({ answer: true });
  });

  test("preferences.open invokes the host form callback", async () => {
    const scopes: string[] = [];
    const handle = createBrowserCapabilities({
      catalog: catalog(),
      openPreferences: (scope) => scopes.push(scope),
    });
    expect(
      await handle({ name: "preferences.open", params: { scope: "extension" } }, context),
    ).toEqual({ ok: true, value: null });
    expect(
      await handle({ name: "preferences.open", params: { scope: "command" } }, context),
    ).toEqual({ ok: true, value: null });
    expect(scopes).toEqual(["extension", "command"]);
  });
});
