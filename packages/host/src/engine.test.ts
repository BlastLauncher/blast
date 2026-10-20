import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createEngine,
  createSessionBroker,
  openExtension,
  type CapabilityHandler,
  type ExtensionHandle,
} from "./index.ts";

test("session defaults deny client capabilities and retain LocalStorage, internal storage and OAuth", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "blast-broker-"));
  try {
    const broker = createSessionBroker({ extensionName: "test", dataDir });
    const ask = (name: string, params = {}) =>
      broker({ type: "capability.request", id: "test", name, params });
    for (const name of ["applications.list", "selection.text", "window.list", "clipboard.read"])
      expect(await ask(name)).toMatchObject({ ok: false, error: { code: "denied" } });
    expect(await ask("storage.set", { key: "key", value: "local" })).toMatchObject({ ok: true });
    expect(
      await ask("storage.set", { key: "key", value: "internal", scope: "blast:internal" }),
    ).toMatchObject({ ok: true });
    expect(await ask("storage.get", { key: "key" })).toMatchObject({ ok: true, value: "local" });
    expect(await ask("storage.get", { key: "key", scope: "blast:internal" })).toMatchObject({
      ok: true,
      value: "internal",
    });
    expect(
      await ask("oauth.tokens.set", { providerId: "provider", tokens: { accessToken: "token" } }),
    ).toMatchObject({ ok: true });
    expect(await ask("oauth.tokens.get", { providerId: "provider" })).toMatchObject({
      ok: true,
      value: { accessToken: "token" },
    });
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "blast-engine-"));
  const extensionDir = join(root, "extension");
  await mkdir(join(extensionDir, "src"), { recursive: true });
  await writeFile(
    join(extensionDir, "package.json"),
    JSON.stringify({
      name: "registry",
      commands: [{ name: "index", mode: "no-view" }],
    }),
  );
  await writeFile(
    join(extensionDir, "src/index.ts"),
    `
    import { Clipboard, LocalStorage } from "@raycast/api";
    export default async function Command() {
      let text;
      try { text = await Clipboard.readText(); } catch { text = "denied"; }
      await LocalStorage.setItem("key", "stored");
      console.log(JSON.stringify({ text, stored: await LocalStorage.getItem("key") }));
    }
  `,
  );
  return { root, extensionDir, dataDir: join(root, "data") };
}

async function run(extension: ExtensionHandle, handlers?: Record<string, CapabilityHandler>) {
  const opened = await extension.launch("index", handlers ? { handlers } : {});
  try {
    expect(await opened.session.exited).toMatchObject({ code: 0 });
    const log = opened.session.logs.find((entry) => entry.message.startsWith('{"text":'));
    expect(log).toBeDefined();
    return JSON.parse(log!.message);
  } finally {
    await opened.close();
  }
}

const clipboard = (text: string): Record<string, CapabilityHandler> => ({
  "clipboard.read": () => ({ text }),
});

test("engine registrations resolve at launch, extension and launch handlers win, and storage cannot be shadowed", async () => {
  const f = await fixture();
  const engine = createEngine({
    dataDir: f.dataDir,
    handlers: {
      ...clipboard("engine"),
      "storage.get": () => "shadowed",
    },
  });
  try {
    const extension = engine.openExtension({ extensionDir: f.extensionDir });
    expect(await run(extension)).toEqual({ text: "engine", stored: "stored" });
    const unregister = engine.register(clipboard("registered"));
    const removeLater = engine.register(clipboard("later"));
    expect(await run(extension)).toEqual({ text: "later", stored: "stored" });
    unregister();
    unregister();
    expect(await run(extension)).toEqual({ text: "later", stored: "stored" });
    removeLater();
    expect(await run(extension)).toEqual({ text: "engine", stored: "stored" });
    const override = engine.openExtension({
      extensionDir: f.extensionDir,
      handlers: clipboard("extension"),
    });
    expect(await run(override)).toEqual({ text: "extension", stored: "stored" });
    expect(
      await run(override, { ...clipboard("launch"), "storage.get": () => "shadowed" }),
    ).toEqual({ text: "launch", stored: "stored" });
  } finally {
    await engine.close();
    await rm(f.root, { recursive: true, force: true });
  }
});

test("unregister restores denial and standalone extensions have no client defaults", async () => {
  const f = await fixture();
  const engine = createEngine({ dataDir: f.dataDir });
  const standalone = openExtension({ extensionDir: f.extensionDir, dataDir: f.dataDir });
  try {
    const extension = engine.openExtension({ extensionDir: f.extensionDir });
    const unregister = engine.register(clipboard("temporary"));
    expect(await run(extension)).toEqual({ text: "temporary", stored: "stored" });
    unregister();
    expect(await run(extension)).toEqual({ text: "denied", stored: "stored" });
    expect(await run(standalone)).toEqual({ text: "denied", stored: "stored" });
    await engine.close();
    await engine.close();
    expect(() => engine.register({})).toThrow("Engine is closed");
    expect(() => engine.openExtension({ extensionDir: f.extensionDir })).toThrow(
      "Engine is closed",
    );
    await expect(extension.launch("index")).rejects.toThrow("Extension handle is closed");
  } finally {
    await standalone.close();
    await engine.close();
    await rm(f.root, { recursive: true, force: true });
  }
});

test("engine inherits data directory and installer, permits extension overrides, and closes live sessions", async () => {
  const f = await fixture();
  const inherited: string[] = [];
  const overridden: string[] = [];
  const engine = createEngine({
    dataDir: f.dataDir,
    installer: async ({ cwd }) => {
      inherited.push(cwd);
    },
  });
  try {
    await writeFile(
      join(f.extensionDir, "package.json"),
      JSON.stringify({
        name: "registry",
        dependencies: { example: "1" },
        commands: [{ name: "index", mode: "view" }],
      }),
    );
    await writeFile(
      join(f.extensionDir, "src/index.ts"),
      `
      import { List } from "@raycast/api";
      import { createElement } from "react";
      export default function Command() { return createElement(List); }
    `,
    );
    const extension = engine.openExtension({ extensionDir: f.extensionDir });
    await extension.dependencies.install();
    expect(inherited).toHaveLength(1);
    expect(inherited[0]!.startsWith(join(f.dataDir, "deps"))).toBe(true);
    const otherData = join(f.root, "other");
    const other = engine.openExtension({
      extensionDir: f.extensionDir,
      dataDir: otherData,
      installer: async ({ cwd }) => {
        overridden.push(cwd);
      },
    });
    await other.dependencies.install();
    expect(inherited).toHaveLength(1);
    expect(overridden).toHaveLength(1);
    expect(overridden[0]!.startsWith(join(otherData, "deps"))).toBe(true);
    const opened = await extension.launch("index");
    await engine.close();
    expect(await opened.session.exited).toMatchObject({ code: 0 });
    await expect(extension.manifest()).rejects.toThrow("Extension handle is closed");
    expect((await stat(join(f.dataDir, "support", "registry"))).isDirectory()).toBe(true);
  } finally {
    await engine.close();
    await rm(f.root, { recursive: true, force: true });
  }
});
