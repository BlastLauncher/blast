import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { SceneMessage } from "@blastlauncher/protocol";
import { createClientHarness, find } from "./serve-test-helper.ts";

const { client, cleanup } = createClientHarness();
afterEach(cleanup);

test("handshake, version mismatch and malformed-line recovery", async () => {
  const c = await client();
  c.child.stdin.write("{broken\n");
  expect((await c.wait((v) => v.type === "error")).error.code).toBe("invalid_message");
  c.child.stdin.write(Buffer.from([0xc3, 0x28, 0x0a]));
  await c.wait((v) => v.type === "error");
  c.child.stdin.write("x".repeat(8 * 1024 * 1024 + 1) + "\n");
  expect((await c.wait((v) => v.type === "error")).error.message).toContain("8 MiB");
  expect((await c.hello()).catalog["clipboard.copy"].scope).toBe("grant");
  c.send({ type: "request", id: "bad", method: "session.event", params: { session: "no" } });
  await c.wait((v) => v.type === "error");
  c.child.stdin.end();
  expect(await c.exited).toBe(0);
  const mismatch = await client();
  mismatch.send({ type: "hello", protocol: 1, capabilities: [] });
  expect((await mismatch.wait((v) => v.type === "error")).error.code).toBe("version_mismatch");
  expect(await mismatch.exited).toBe(2);
});

test("welcome reports the running serve package version", async () => {
  const c = await client();
  const welcome = await c.hello();
  const manifest = JSON.parse(readFileSync(resolve("packages/serve/package.json"), "utf8")) as {
    version?: unknown;
  };
  expect(welcome.engine.version).toBe(
    typeof manifest.version === "string" ? manifest.version : "0.0.0-dev",
  );
  c.child.stdin.end();
  expect(await c.exited).toBe(0);
});

test("launch, scenes, events, capability forwarding and EOF shutdown", async () => {
  const c = await client(true);
  await c.hello(["clipboard.copy"], undefined, true);
  const opened = await c.request("extension.open", {
    dir: resolve("fixtures/extensions/hello-list"),
  });
  const extension = opened.result.extension;
  const launched = await c.request("extension.launch", { extension, command: "index" });
  const session = launched.result.session;
  const scene = (await c.wait((v) => v.event === "session.scene" && v.session === session))
    .scene as SceneMessage;
  const action = find(scene.root, (n) => n.props.title === "Pin apple")!;
  await c.request("session.event", {
    session,
    node: action.id,
    handler: (action.props.onAction as { $handler: string }).$handler,
    args: [],
  });
  const updated = await c.wait(
    (v) =>
      v.event === "session.scene" &&
      !!find(v.scene.root, (n) => n.props.navigationTitle === "pinned apple"),
  );
  const copy = find(updated.scene.root, (n) => n.type === "Action.CopyToClipboard")!;
  await c.request("session.event", {
    session,
    node: copy.id,
    handler: (copy.props.onAction as { $handler: string }).$handler,
    args: [],
  });
  const capability = await c.wait((v) => v.type === "capability.request");
  expect(capability.name).toBe("clipboard.copy");
  expect(capability.session).toBe(session);
  c.send({ type: "capability.result", id: capability.id, ok: true, value: null });
  await c.wait(
    (v) =>
      v.event === "session.scene" &&
      !!find(v.scene.root, (n) => n.props.navigationTitle === "pinned apple copied apple"),
  );
  c.child.stdin.end();
  await c.wait((v) => v.event === "session.exited");
  expect(await c.exited).toBe(0);
});

test("launch reports typed missing dependencies and accepts the install flag", async () => {
  const c = await client();
  await c.hello();
  const missing = await c.request("extension.open", {
    dir: resolve("fixtures/extensions/missing-dependency"),
  });
  const extension = missing.result.extension;
  const failed = await c.request("extension.launch", {
    extension,
    command: "index",
    installDependencies: false,
  });
  expect(failed.error).toMatchObject({
    code: "missing_dependencies",
    data: {
      unresolved: ["@blast-missing/scoped", "blast-unavailable"],
      installable: false,
      pinned: false,
    },
  });
  c.child.stdin.end();
  expect(await c.exited).toBe(0);
});

test("serve reports dependencies imported from a non-entry source file", async () => {
  const c = await client();
  const extensionDir = join(c.dir, "nested-import");
  await mkdir(join(extensionDir, "src/lib"), { recursive: true });
  await writeFile(
    join(extensionDir, "package.json"),
    JSON.stringify({ name: "nested-import", commands: [{ name: "index", mode: "view" }] }),
  );
  await writeFile(
    join(extensionDir, "src/index.tsx"),
    'import { value } from "./lib/api"; import { List } from "@raycast/api"; export default () => <List navigationTitle={value} />;',
  );
  await writeFile(
    join(extensionDir, "src/lib/api.ts"),
    'import "nested-missing-package"; export const value = "x";',
  );
  await c.hello();
  const opened = await c.request("extension.open", { dir: extensionDir });
  const failed = await c.request("extension.launch", {
    extension: opened.result.extension,
    command: "index",
  });
  expect(failed.error).toMatchObject({
    code: "missing_dependencies",
    data: {
      unresolved: ["nested-missing-package"],
      installable: false,
      pinned: false,
    },
  });
  c.child.stdin.end();
  expect(await c.exited).toBe(0);
});

test("serve auto dependency policy is accepted", async () => {
  const c = await client(false, ["--dependencies", "auto"]);
  await c.hello();
  await c.request("engine.shutdown");
  expect(await c.exited).toBe(0);
});

test("undeclared capability is denied and logged", async () => {
  const c = await client();
  await c.hello([], undefined, true);
  const {
    result: { extension },
  } = await c.request("extension.open", { dir: resolve("fixtures/extensions/hello-list") });
  const {
    result: { session },
  } = await c.request("extension.launch", { extension, command: "index" });
  const { scene } = await c.wait((v) => v.event === "session.scene");
  const copy = find(scene.root, (n) => n.type === "Action.CopyToClipboard")!;
  await c.request("session.event", {
    session,
    node: copy.id,
    handler: (copy.props.onAction as { $handler: string }).$handler,
    args: [],
  });
  const log = await c.wait(
    (v) => v.event === "session.log" && JSON.stringify(v.log).includes("denied"),
  );
  expect(JSON.stringify(log)).toContain("clipboard.copy");
  await c.request("engine.shutdown");
  expect(await c.exited).toBe(0);
});

test("manifest watch, missing values, preferences, dependencies and close", async () => {
  const c = await client();
  await c.hello();
  const dir = join(c.dir, "extension");
  await cp(resolve("fixtures/extensions/engine-handle"), dir, { recursive: true });
  const file = join(dir, "package.json");
  const manifest = JSON.parse(await readFile(file, "utf8"));
  manifest.preferences = [{ name: "token", type: "textfield", title: "Token", required: true }];
  manifest.commands[0].arguments = [{ name: "query", type: "text", required: true }];
  await writeFile(file, JSON.stringify(manifest));
  const {
    result: { extension },
  } = await c.request("extension.open", { dir });
  expect((await c.request("extension.manifest", { extension })).result.name).toBe("engine-handle");
  expect((await c.request("extension.dependencies.check", { extension })).ok).toBe(true);
  expect((await c.request("extension.dependencies.install", { extension })).ok).toBe(true);
  const missing = await c.request("extension.launch", { extension, command: "index" });
  expect(missing.error.code).toBe("missing_values");
  expect(missing.error.data.arguments).toEqual(["query"]);
  expect(
    (await c.request("extension.preferences", { extension, command: "index" })).result.missing[0]
      .name,
  ).toBe("token");
  await c.request("extension.savePreferences", {
    extension,
    command: "index",
    values: { token: "fixture" },
  });
  expect(
    (
      await c.request("extension.launch", {
        extension,
        command: "index",
        argumentValues: { query: "test" },
        launchContext: { answer: 42 },
      })
    ).ok,
  ).toBe(true);
  await c.request("extension.watch", { extension });
  // FSEvents can drop or delay a write made right after the watch starts, most
  // often when fseventsd is busy; rewrite until the event arrives, as a user
  // saving again would, instead of trusting the first write.
  const saveUntil = async (text: string, event: string) => {
    for (let attempt = 1; ; attempt++) {
      await writeFile(file, text);
      try {
        return await c.wait((v) => v.event === event, 1500);
      } catch (error) {
        if (attempt >= 8) throw error;
      }
    }
  };
  manifest.title = "Changed";
  expect((await saveUntil(JSON.stringify(manifest), "manifest.changed")).manifest.title).toBe(
    "Changed",
  );
  await saveUntil("invalid", "manifest.error");
  await c.request("extension.unwatch", { extension });
  await c.request("extension.close", { extension });
  await c.wait((v) => v.event === "session.exited");
  expect((await c.request("extension.manifest", { extension })).ok).toBe(false);
  c.child.stdin.end();
  expect(await c.exited).toBe(0);
}, 30_000);

test("capability progress and abort, late results, and session close", async () => {
  const c = await client();
  await c.hello(["ai.ask"], undefined, true);
  const dir = join(c.dir, "stream");
  await cp(resolve("fixtures/extensions/engine-handle"), dir, { recursive: true });
  await writeFile(
    join(dir, "src/index.tsx"),
    `
    import { AI, Action, ActionPanel, List } from "@raycast/api";
    import { useState } from "react";
    const controller = new AbortController();
    export default function Command() {
      const [text, setText] = useState("waiting");
      return <List navigationTitle={text}><List.Item title="stream" actions={<ActionPanel>
        <Action title="Start" onAction={() => {
          const work = AI.ask("test", {signal: controller.signal});
          work.on("data", setText); void work.catch(() => setText("cancelled"));
        }} />
        <Action title="Abort" onAction={() => controller.abort()} />
      </ActionPanel>} /></List>;
    }
  `,
  );
  const {
    result: { extension },
  } = await c.request("extension.open", { dir });
  const {
    result: { session },
  } = await c.request("extension.launch", { extension, command: "index" });
  const { scene } = await c.wait((v) => v.event === "session.scene");
  const start = find(scene.root, (n) => n.props.title === "Start")!;
  await c.request("session.event", {
    session,
    node: start.id,
    handler: (start.props.onAction as { $handler: string }).$handler,
    args: [],
  });
  const capability = await c.wait((v) => v.type === "capability.request");
  c.send({ type: "capability.progress", id: capability.id, value: "chunk" });
  const updated = await c.wait(
    (v) =>
      v.event === "session.scene" &&
      !!find(v.scene.root, (n) => n.props.navigationTitle === "chunk"),
  );
  const abort = find(updated.scene.root, (n) => n.props.title === "Abort")!;
  await c.request("session.event", {
    session,
    node: abort.id,
    handler: (abort.props.onAction as { $handler: string }).$handler,
    args: [],
  });
  expect((await c.wait((v) => v.type === "capability.cancel")).id).toBe(capability.id);
  c.send({ type: "capability.result", id: capability.id, ok: true, value: "late" });
  await c.request("session.close", { session });
  await c.wait((v) => v.event === "session.exited");
  c.child.stdin.end();
  expect(await c.exited).toBe(0);
});

test("launch forwards bundleTimeoutMs and the server remains usable after a timeout", async () => {
  const c = await client();
  await c.hello([]);
  const opened = await c.request("extension.open", {
    dir: resolve("fixtures/extensions/hello-list"),
  });
  const extension = opened.result.extension;
  const failed = await c.request("extension.launch", {
    extension,
    command: "index",
    bundleTimeoutMs: 1,
  });
  expect(failed.ok).toBe(false);
  expect(failed.error.code).toBe("BUNDLE_TIMEOUT");
  expect(failed.error.data).toMatchObject({ command: "index", timeoutMs: 1 });
  expect(failed.error.message).toContain("timed out after 1 ms");
  const launched = await c.request("extension.launch", {
    extension,
    command: "index",
    bundleTimeoutMs: 0,
  });
  expect(launched.ok).toBe(true);
  await c.request("engine.shutdown");
  expect(await c.exited).toBe(0);
}, 15000);
