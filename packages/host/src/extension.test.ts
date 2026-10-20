import { expect, test } from "bun:test";
import type { SceneMessage } from "@blastlauncher/protocol";
import { cp, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import {
  openExtension,
  MissingLaunchValuesError,
  createPreferenceStore,
  type ExtensionManifest,
  type DependencyInstaller,
} from "./index.ts";

async function fixture(installer?: DependencyInstaller) {
  const root = await mkdtemp(join(tmpdir(), "blast-extension-"));
  const extensionDir = join(root, "extension");
  const dataDir = join(root, "data");
  await cp(new URL("../../../fixtures/extensions/engine-handle", import.meta.url), extensionDir, {
    recursive: true,
  });
  const file = join(extensionDir, "package.json");
  const raw = JSON.parse(await readFile(file, "utf8"));
  const handle = openExtension({ extensionDir, dataDir, ...(installer ? { installer } : {}) });
  return {
    handle,
    raw,
    file,
    extensionDir,
    dataDir,
    write: () => writeFile(file, JSON.stringify(raw)),
    close: async () => {
      await handle.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

const preference = (name: string, extra = {}) => ({
  name,
  type: "textfield",
  required: true,
  ...extra,
});

test("extension manifest validates structure, preference schemas and unknown commands", async () => {
  const f = await fixture();
  try {
    expect(await f.handle.manifest()).toMatchObject({
      name: "engine-handle",
      title: "Engine Handle",
      commands: [{ name: "index", mode: "view", arguments: [], preferences: [] }],
    });
    f.raw.commands[0].preferences = [preference("key")];
    await f.write();
    expect((await f.handle.manifest()).commands[0]!.preferences[0]!.required).toBe(true);
    await expect(f.handle.preferences("unknown")).rejects.toThrow("Unknown extension command");
    await writeFile(f.file, "{");
    await expect(f.handle.manifest()).rejects.toThrow("Invalid extension manifest");
    await writeFile(f.file, JSON.stringify({ name: "invalid" }));
    await expect(f.handle.manifest()).rejects.toThrow('manifest needs a "commands" array');
  } finally {
    await f.close();
  }
});

test("extension watch reloads atomic manifest and lockfile changes, errors, unsubscribe and close", async () => {
  const f = await fixture();
  const updates: (ExtensionManifest | Error)[] = [];
  let notified = Promise.withResolvers<void>();
  const next = async (write: () => Promise<unknown>) => {
    notified = Promise.withResolvers<void>();
    const timer = setTimeout(() => notified.reject(new Error("watch timeout")), 2000);
    try {
      await write();
      await notified.promise;
    } finally {
      clearTimeout(timer);
    }
  };
  try {
    const unsubscribe = f.handle.watch((value) => {
      updates.push(value);
      notified.resolve();
    });
    f.raw.title = "Reloaded";
    await next(async () => {
      await writeFile(`${f.file}.tmp`, JSON.stringify(f.raw));
      await rename(`${f.file}.tmp`, f.file);
    });
    expect(updates.at(-1)).toMatchObject({ title: "Reloaded" });
    await next(() => writeFile(join(f.extensionDir, "package-lock.json"), "{}"));
    expect(updates.at(-1)).toMatchObject({ title: "Reloaded" });
    await next(() => writeFile(f.file, "{"));
    expect(updates.at(-1)).toBeInstanceOf(Error);
    unsubscribe();
    const count = updates.length;
    await f.write();
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(updates).toHaveLength(count);
    f.handle.watch((value) => updates.push(value));
    await f.handle.close();
    await f.write();
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(updates).toHaveLength(count);
    await expect(f.handle.manifest()).rejects.toThrow("closed");
  } finally {
    await f.close();
  }
});

test("extension serializes installs and launch waits for a pending install", async () => {
  const started = Promise.withResolvers<void>();
  const finish = Promise.withResolvers<void>();
  let active = 0;
  let maximum = 0;
  let calls = 0;
  const f = await fixture(async ({ onLog }) => {
    maximum = Math.max(maximum, ++active);
    calls++;
    onLog?.("Installing fixture");
    started.resolve();
    await finish.promise;
    active--;
  });
  try {
    f.raw.dependencies = { example: "1" };
    await f.write();
    const logs: string[] = [];
    const first = f.handle.dependencies.install({ onLog: (line) => logs.push(line) });
    await started.promise;
    await writeFile(
      join(f.extensionDir, "package-lock.json"),
      JSON.stringify({ lockfileVersion: 3, packages: {} }),
    );
    const second = f.handle.dependencies.install();
    let launched = false;
    const launch = f.handle.launch("index").then((opened) => {
      launched = true;
      return opened;
    });
    expect(launched).toBe(false);
    expect(calls).toBe(1);
    finish.resolve();
    await Promise.all([first, second]);
    const opened = await launch;
    await opened.close();
    expect(maximum).toBe(1);
    expect(calls).toBe(2);
    expect(logs).toContain("Installing fixture");
    expect((await f.handle.dependencies.check()).needed).toBe(false);
  } finally {
    finish.resolve();
    await f.close();
  }
});

test("extension preferences detect missing values and split command overrides and extension-only edits", async () => {
  const f = await fixture();
  try {
    f.raw.preferences = [
      preference("token"),
      preference("shared"),
      preference("flag", { type: "checkbox", default: false }),
    ];
    f.raw.commands[0].preferences = [
      preference("shared"),
      preference("local"),
      preference("defaulted", { default: "yes" }),
    ];
    await f.write();
    expect((await f.handle.preferences("index")).missing.map((p) => p.name)).toEqual([
      "token",
      "shared",
      "local",
    ]);
    await f.handle.savePreferences("index", {
      token: "secret",
      shared: "command",
      local: "value",
      flag: false,
    });
    await f.handle.savePreferences("index", { shared: "extension" }, "extension");
    expect(
      await createPreferenceStore({ extensionName: f.raw.name, dataDir: f.dataDir }).read(),
    ).toEqual({
      extension: { token: "secret", flag: false, shared: "extension" },
      commands: { index: { shared: "command", local: "value" } },
    });
    expect((await f.handle.preferences("index")).missing).toEqual([]);
    expect((await f.handle.preferences("index")).values.shared).toBe("command");
    expect((await f.handle.preferences("index", "extension")).values.shared).toBe("extension");
  } finally {
    await f.close();
  }
});

test("extension launch rejects typed missing preferences and arguments before bundling", async () => {
  const f = await fixture();
  try {
    f.raw.preferences = [preference("token")];
    f.raw.commands[0].arguments = [{ name: "query", type: "text", required: true }];
    await f.write();
    const error = await f.handle.launch("index").catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(MissingLaunchValuesError);
    expect(error).toMatchObject({
      code: "MISSING_LAUNCH_VALUES",
      preferences: [{ name: "token" }],
      arguments: ["query"],
    });
    await f.handle.savePreferences("index", { token: "saved" });
    await expect(f.handle.launch("index", { argumentValues: { query: "" } })).rejects.toMatchObject(
      { preferences: [], arguments: ["query"] },
    );
  } finally {
    await f.close();
  }
});

test("extension launch renders props and preferences, and session/handle close remove bundles", async () => {
  const f = await fixture();
  try {
    await f.handle.savePreferences("index", { token: "saved" });
    for (const closeHandle of [false, true]) {
      const opened = await f.handle.launch("index", {
        argumentValues: { query: "hello" },
        launchContext: { source: "embedder" },
      });
      const scene = await new Promise<SceneMessage>((resolve, reject) => {
        opened.session.scenes(resolve);
        void opened.session.exited.then((exit) =>
          reject(exit.error ?? new Error("Exited before scene")),
        );
      });
      const serialized = JSON.stringify(scene);
      expect(serialized).toContain("Engine fixture");
      const list = scene.root!.children[0]!.children[0]!;
      const content = JSON.parse(String(list.children[0]!.props.title));
      expect(content).toMatchObject({
        props: { arguments: { query: "hello" }, launchContext: { source: "embedder" } },
        preferences: { token: "saved" },
      });
      const bundle = dirname(content.assetsPath);
      expect((await stat(bundle)).isDirectory()).toBe(true);
      if (closeHandle) await f.handle.close();
      else await opened.close();
      await opened.close();
      await expect(stat(bundle)).rejects.toMatchObject({ code: "ENOENT" });
    }
  } finally {
    await f.close();
  }
});
