import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { acceptProtocolSession } from "@blastlauncher/session";
import { SceneStateBuffer, validateSceneTransactionMessage } from "@blastlauncher/scene";
import { createInMemoryTransportPair } from "@blastlauncher/transport";

import { ExtensionEntrypointError, loadExtensionEntrypoint, runNodeExtensionBootstrap } from "../dist/index.js";

const esmEntrypoint = fileURLToPath(new URL("./fixtures/entrypoints/example-command.mjs", import.meta.url));
const cjsEntrypoint = fileURLToPath(new URL("./fixtures/entrypoints/example-command.cjs", import.meta.url));
const brokenEntrypoint = fileURLToPath(new URL("./fixtures/entrypoints/broken-command.mjs", import.meta.url));
const sceneEntrypoint = fileURLToPath(new URL("./fixtures/entrypoints/scene-command.mjs", import.meta.url));

const descriptor = {
  extensionId: "fixture.extension",
  commandName: "index",
  entrypoint: esmEntrypoint,
  rootDirectory: fileURLToPath(new URL("./fixtures", import.meta.url)),
};

function idFactory(prefix) {
  let value = 0;
  return () => `${prefix}-${++value}`;
}

function runtimeImplementation() {
  return { name: "runtime-node-test", version: "0.0.0" };
}

test("loads ESM and CommonJS fixture entrypoints", async (context) => {
  await context.test("ESM namespace", async () => {
    const entrypointModule = await loadExtensionEntrypoint(esmEntrypoint);
    assert.equal(entrypointModule.marker, "fixture-esm-loaded");
    assert.equal(typeof entrypointModule.run, "function");
  });

  await context.test("CommonJS default export", async () => {
    const entrypointModule = await loadExtensionEntrypoint(cjsEntrypoint);
    assert.equal(entrypointModule.default.marker, "fixture-cjs-loaded");
  });
});

test("rejects invalid entrypoints", async (context) => {
  await context.test("empty value", async () => {
    await assert.rejects(
      () => loadExtensionEntrypoint(""),
      (error) => error.code === "entrypoint_invalid",
    );
  });

  await context.test("relative path", async () => {
    await assert.rejects(
      () => loadExtensionEntrypoint("./fixtures/entrypoints/example-command.mjs"),
      (error) => error.code === "entrypoint_not_absolute",
    );
  });

  await context.test("evaluation failure", async () => {
    await assert.rejects(
      () => loadExtensionEntrypoint(brokenEntrypoint),
      (error) => error.code === "entrypoint_load_failed",
    );
  });

  await context.test("missing file", async () => {
    await assert.rejects(
      () => loadExtensionEntrypoint(`${descriptor.rootDirectory}/does-not-exist.mjs`),
      (error) => error.code === "entrypoint_load_failed",
    );
  });
});

test("honors an aborted signal", async () => {
  const controller = new AbortController();
  controller.abort("test cancellation");
  await assert.rejects(() => loadExtensionEntrypoint(esmEntrypoint, controller.signal));
});

test("runs the bootstrap lifecycle over an in-memory transport", async () => {
  const [runtimeTransport, hostTransport] = createInMemoryTransportPair();
  const loaded = [];
  const bootstrap = runNodeExtensionBootstrap({
    implementation: runtimeImplementation(),
    createMessageId: idFactory("runtime"),
    transport: runtimeTransport,
    onLoaded: (entrypointModule, loadedDescriptor) => loaded.push([entrypointModule.marker, loadedDescriptor]),
  });

  const host = await acceptProtocolSession(hostTransport, {
    role: "extension-host",
    implementation: { name: "host-test", version: "0.0.0" },
    createMessageId: idFactory("host"),
    createSessionId: idFactory("session"),
  });

  await host.send("extension.initialize", { descriptor });
  const ready = await host.receive();
  assert.equal(ready.type, "extension.ready");
  assert.equal(ready.payload.extensionId, descriptor.extensionId);
  assert.equal(ready.payload.commandName, descriptor.commandName);
  assert.deepEqual(loaded, [["fixture-esm-loaded", descriptor]]);

  await host.close("test complete");
  const result = await bootstrap;
  assert.equal(result.descriptor, descriptor);
  assert.equal(result.entrypointModule.marker, "fixture-esm-loaded");
  assert.equal(host.state, "closed");
});

test("reports entrypoint loading failures during initialization", async () => {
  const [runtimeTransport, hostTransport] = createInMemoryTransportPair();
  const bootstrap = runNodeExtensionBootstrap({
    implementation: runtimeImplementation(),
    createMessageId: idFactory("runtime"),
    transport: runtimeTransport,
    loadEntrypoint: async () => {
      throw new ExtensionEntrypointError("entrypoint_load_failed", "injected failure");
    },
  });

  const host = await acceptProtocolSession(hostTransport, {
    role: "extension-host",
    implementation: { name: "host-test", version: "0.0.0" },
    createMessageId: idFactory("host"),
    createSessionId: idFactory("session"),
  });

  await host.send("extension.initialize", { descriptor });
  await assert.rejects(
    () => bootstrap,
    (error) => error.code === "entrypoint_load_failed",
  );
  assert.equal((await host.receive()).type, "shutdown");
  assert.equal(host.state, "closed");
});

test("runs the scene loop over an in-memory transport", async () => {
  const [runtimeTransport, hostTransport] = createInMemoryTransportPair();
  const sceneDescriptor = { ...descriptor, entrypoint: sceneEntrypoint };
  const bootstrap = runNodeExtensionBootstrap({
    implementation: runtimeImplementation(),
    createMessageId: idFactory("runtime"),
    transport: runtimeTransport,
  });

  const host = await acceptProtocolSession(hostTransport, {
    role: "extension-host",
    implementation: { name: "host-test", version: "0.0.0" },
    createMessageId: idFactory("host"),
    createSessionId: idFactory("session"),
  });
  await host.send("extension.initialize", { descriptor: sceneDescriptor });
  assert.equal((await host.receive()).type, "extension.ready");

  const buffer = new SceneStateBuffer();
  const snapshot = validateSceneTransactionMessage(await host.receive());
  assert.equal(snapshot.ok, true);
  buffer.apply(snapshot.value.payload);
  assert.deepEqual(buffer.toJSON(), {
    id: "root",
    type: "list",
    props: { navigationTitle: "Fixture" },
    children: [
      {
        id: "item-1",
        type: "list-item",
        props: { title: "Hello" },
        children: [
          { id: "action-1", type: "action", props: { title: "Run", onAction: "event-action-1" }, children: [] },
        ],
      },
    ],
  });

  const action = buffer.childrenOf("root")[0].children.find((child) => child.type === "action");
  await host.send("scene.event", { eventId: action.props.onAction });

  const update = validateSceneTransactionMessage(await host.receive());
  assert.equal(update.ok, true);
  assert.equal(update.value.payload.transactionId, "fixture-update");
  buffer.apply(update.value.payload);
  assert.equal(buffer.get("item-1").props.title, "Ran:event-action-1");

  await host.close("scene loop complete");
  const result = await bootstrap;
  assert.equal(result.descriptor, sceneDescriptor);
  assert.equal(typeof result.entrypointModule.command, "function");
  assert.equal(host.state, "closed");
});

test("reports command failures and closes the session", async () => {
  const [runtimeTransport, hostTransport] = createInMemoryTransportPair();
  const bootstrap = runNodeExtensionBootstrap({
    implementation: runtimeImplementation(),
    createMessageId: idFactory("runtime"),
    transport: runtimeTransport,
    loadEntrypoint: async () => ({
      command() {
        throw new Error("command exploded");
      },
    }),
  });

  const host = await acceptProtocolSession(hostTransport, {
    role: "extension-host",
    implementation: { name: "host-test", version: "0.0.0" },
    createMessageId: idFactory("host"),
    createSessionId: idFactory("session"),
  });

  await host.send("extension.initialize", { descriptor });
  assert.equal((await host.receive()).type, "extension.ready");

  await assert.rejects(() => bootstrap, /command exploded/);
  assert.equal((await host.receive()).type, "shutdown");
  assert.equal(host.state, "closed");
});

test("exposes capability requests through the command context", async () => {
  const [runtimeTransport, hostTransport] = createInMemoryTransportPair();
  const bootstrap = runNodeExtensionBootstrap({
    implementation: runtimeImplementation(),
    createMessageId: idFactory("runtime"),
    transport: runtimeTransport,
    loadEntrypoint: async () => ({
      async command(context) {
        const response = await context.requestCapability({
          capability: "clipboard",
          operation: "write",
          arguments: { text: "hello" },
        });
        await context.publish({
          transactionId: "after-capability",
          operations: [{ type: "update", nodeId: "item-1", props: { title: `clipboard:${response.outcome}` } }],
        });
      },
    }),
  });

  const host = await acceptProtocolSession(hostTransport, {
    role: "extension-host",
    implementation: { name: "host-test", version: "0.0.0" },
    createMessageId: idFactory("host"),
    createSessionId: idFactory("session"),
  });

  await host.send("extension.initialize", { descriptor });
  assert.equal((await host.receive()).type, "extension.ready");

  const request = await host.receive();
  assert.equal(request.type, "capability.request");
  assert.equal(request.payload.extensionId, "fixture.extension");
  assert.equal(request.payload.capability, "clipboard");
  assert.deepEqual(request.payload.arguments, { text: "hello" });
  await host.send("capability.response", { requestId: request.payload.requestId, outcome: "succeeded" });

  const update = validateSceneTransactionMessage(await host.receive());
  assert.equal(update.ok, true);
  assert.equal(update.value.payload.operations[0].props.title, "clipboard:succeeded");

  await host.close("capability loop complete");
  const result = await bootstrap;
  assert.equal(result.descriptor, descriptor);
});
