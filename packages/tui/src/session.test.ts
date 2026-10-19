import { expect, test } from "bun:test";
import { createBroker } from "@blastlauncher/host";
import { createClientHandlers } from "./session.ts";
import type { JsonValue } from "@blastlauncher/protocol";

test("terminal clipboard and URL handlers stay local and other effects are denied", async () => {
  const effects = createClientHandlers();
  const broker = createBroker(effects.handlers);
  const request = (name: string, params: JsonValue = {}) =>
    broker({ type: "capability.request", id: "1", name, params });
  await request("clipboard.copy", { html: "<b>hello</b>", text: "hello" });
  expect(await request("clipboard.read")).toMatchObject({
    ok: true,
    value: { html: "<b>hello</b>", text: "hello" },
  });
  expect(await request("clipboard.read", { offset: 1 })).toMatchObject({ value: { text: "" } });
  await request("clipboard.paste", { file: "/tmp/example" });
  expect(await request("clipboard.read")).toMatchObject({
    value: { text: "", file: "/tmp/example" },
  });
  await request("clipboard.clear");
  expect(await request("clipboard.read")).toMatchObject({ value: { text: "" } });
  await request("open.url", { url: "https://example.com" });
  expect(effects.urls).toEqual(["https://example.com"]);
  expect(await request("open.path", { path: "/tmp/example" })).toMatchObject({
    ok: false,
    error: { code: "denied" },
  });
  expect(
    await createBroker(createClientHandlers().handlers)({
      type: "capability.request",
      id: "2",
      name: "clipboard.read",
      params: {},
    }),
  ).toMatchObject({ value: { text: "" } });
});

test("openCommand resolves a matching installed dependency using its data directory", async () => {
  const { cp, mkdir, mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { installExtensionDependencies } = await import("@blastlauncher/host");
  const { openCommand } = await import("./session.ts");
  const root = await mkdtemp(join(tmpdir(), "blast-tui-installed-"));
  const extensionDir = join(root, "extension");
  const dataDir = join(root, "data");
  try {
    await cp(
      new URL("../../../fixtures/extensions/installed-deps", import.meta.url).pathname,
      extensionDir,
      { recursive: true },
    );
    await installExtensionDependencies({
      extensionDir,
      dataDir,
      installer: async ({ cwd }) => {
        await mkdir(join(cwd, "node_modules"), { recursive: true });
        await cp(
          new URL("../../../fixtures/packages/blast-offline-dep", import.meta.url).pathname,
          join(cwd, "node_modules/blast-offline-dep"),
          { recursive: true },
        );
      },
    });
    const opened = await openCommand(extensionDir, "index", { dataDir });
    try {
      const scene = await new Promise((resolve, reject) => {
        opened.session.scenes(resolve);
        void opened.session.exited.then((exit) =>
          reject(exit.error ?? new Error("Exited before scene")),
        );
      });
      expect(JSON.stringify(scene)).toContain("Installed offline dependency");
    } finally {
      await opened.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
