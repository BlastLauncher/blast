import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { once } from "node:events";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { CoreClientController } from "@blastlauncher/client";
import { connectCoreClient } from "@blastlauncher/core";
import { createNodeCoreDaemon } from "@blastlauncher/core-node";
import { SceneStateBuffer } from "@blastlauncher/scene";
import { createJsonLineTransport } from "@blastlauncher/transport-node";

const catalogRoot = fileURLToPath(new URL("./fixtures/catalog", import.meta.url));
const bootstrapPath = fileURLToPath(new URL("./fixtures/bootstrap.mjs", import.meta.url));
const identity = { extensionId: "e2e.scene", commandName: "index" };

function createDaemon(socketPath) {
  return createNodeCoreDaemon({
    catalogRoot,
    bootstrapPath,
    environment: process.env,
    socketPath,
  });
}

async function connectClient(socketPath) {
  const socket = createConnection(socketPath);
  socket.on("error", () => {});
  await once(socket, "connect");
  return connectCoreClient(createJsonLineTransport({ readable: socket, writable: socket }), {
    implementation: { name: "daemon-test-client", version: "0.0.0" },
    createMessageId: createIdFactory("client"),
  });
}

function createIdFactory(prefix) {
  let value = 0;
  return () => `${prefix}-${++value}`;
}

async function waitFor(predicate, description, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${description}`);
}

test("composes the Node daemon and serves a real command over its local socket", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "blast-node-daemon-"));
  const socketPath = path.join(directory, "core.sock");
  const daemon = createDaemon(socketPath);
  let client;
  try {
    await Promise.all([daemon.start(), daemon.start()]);
    assert.equal(daemon.state, "running");
    assert.equal(daemon.listener.state, "listening");
    assert.equal((await stat(socketPath)).mode & 0o777, 0o600);

    client = await connectClient(socketPath);
    await client.requestCommandList();
    const listed = await client.receive();
    assert.equal(listed.type, "core.command.listed");
    const discovered = listed.payload.commands.find(
      (command) => command.extensionId === identity.extensionId && command.commandName === identity.commandName,
    );
    assert.deepEqual(discovered, {
      extensionId: identity.extensionId,
      commandName: identity.commandName,
      title: "Scene",
      extensionName: "E2E Scene Extension",
      entryPointMode: "view",
    });
    assert.equal("entrypoint" in discovered, false);
    assert.equal("rootDirectory" in discovered, false);

    await client.runCommand(identity);
    assert.deepEqual((await client.receive()).payload, identity);

    const buffer = new SceneStateBuffer();
    const initial = await client.receive();
    assert.equal(initial.type, "scene.transaction");
    buffer.apply(initial.payload);
    const action = buffer.childrenOf("root")[0].children.find((child) => child.type === "action");
    await client.sendSceneEvent(action.props.onAction);

    const update = await client.receive();
    assert.equal(update.type, "scene.transaction");
    buffer.apply(update.payload);
    assert.equal(buffer.get("item-1").props.title, "Ran:event-action-1");

    await client.stopCommand(identity, "daemon test complete");
    assert.equal((await client.receive()).type, "core.command.stopped");
    await client.close("client complete");

    await daemon.close("daemon test complete");
    assert.equal(daemon.state, "closed");
    assert.equal(daemon.core.state, "closed");
    assert.equal(daemon.host.activeSessions.length, 0);
    await assert.rejects(() => stat(socketPath), { code: "ENOENT" });
    await daemon.close("repeat close");
  } finally {
    await client?.close().catch(() => {});
    await daemon.close().catch(() => {});
    await rm(directory, { recursive: true, force: true });
  }
});

test("owns the catalog watcher and closes it with the daemon", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "blast-node-daemon-watch-"));
  const watchRoot = path.join(directory, "extensions");
  const socketPath = path.join(directory, "core.sock");
  await mkdir(watchRoot);
  let changes = 0;
  const daemon = createNodeCoreDaemon({
    catalogRoot: watchRoot,
    bootstrapPath,
    environment: process.env,
    socketPath,
    onCatalogChanged: () => {
      changes += 1;
    },
  });
  try {
    await daemon.start();
    const extensionDirectory = path.join(watchRoot, "watched-extension");
    await mkdir(path.join(extensionDirectory, "src"), { recursive: true });
    await writeFile(
      path.join(extensionDirectory, "package.json"),
      JSON.stringify({ name: "watched", commands: [{ name: "index" }] }),
    );
    await waitFor(() => changes > 0, "the daemon catalog watcher");

    const observedChanges = changes;
    await daemon.close("watcher lifecycle test complete");
    await writeFile(
      path.join(extensionDirectory, "package.json"),
      JSON.stringify({ name: "watched", title: "After close", commands: [{ name: "index" }] }),
    );
    await new Promise((resolve) => setTimeout(resolve, 125));
    assert.equal(changes, observedChanges);
    assert.equal(daemon.state, "closed");
  } finally {
    await daemon.close().catch(() => {});
    await rm(directory, { recursive: true, force: true });
  }
});

test("consumes discovery and semantic scenes through the transport-neutral client", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "blast-node-daemon-"));
  const socketPath = path.join(directory, "core.sock");
  const daemon = createDaemon(socketPath);
  let controller;
  try {
    await daemon.start();
    const client = await connectClient(socketPath);
    controller = new CoreClientController({ client });
    await controller.start();

    assert.equal(controller.state, "ready");
    assert.deepEqual(
      controller.snapshot.commands.find((command) => command.extensionId === identity.extensionId),
      {
        extensionId: identity.extensionId,
        commandName: identity.commandName,
        title: "Scene",
        extensionName: "E2E Scene Extension",
        entryPointMode: "view",
      },
    );

    await controller.runCommand(identity);
    await waitFor(() => controller.state === "running", "the command to start");
    await waitFor(() => controller.snapshot.scene !== undefined, "the initial scene");

    const action = controller.snapshot.scene.children[0].children.find((child) => child.type === "action");
    await controller.sendSceneEvent(action.props.onAction);
    await waitFor(() => controller.snapshot.scene.children[0].props.title === "Ran:event-action-1", "the scene update");

    await controller.stopCommand("controller test complete");
    await waitFor(() => controller.state === "ready", "the command to stop");
    assert.equal(controller.snapshot.scene, undefined);
    await controller.close("controller test complete");
    assert.equal(controller.state, "closed");
  } finally {
    await controller?.close().catch(() => {});
    await daemon.close().catch(() => {});
    await rm(directory, { recursive: true, force: true });
  }
});

test("daemon shutdown stops an active real command before closing the host", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "blast-node-daemon-"));
  const socketPath = path.join(directory, "core.sock");
  const daemon = createDaemon(socketPath);
  let client;
  try {
    await daemon.start();
    client = await connectClient(socketPath);
    await client.runCommand(identity);
    assert.equal((await client.receive()).type, "core.command.started");
    assert.equal((await client.receive()).type, "scene.transaction");

    await daemon.close("application shutdown");

    assert.equal(await client.receive(), undefined);
    assert.equal(daemon.state, "closed");
    assert.equal(daemon.core.state, "closed");
    assert.equal(daemon.host.activeSessions.length, 0);
    await assert.rejects(() => stat(socketPath), { code: "ENOENT" });
  } finally {
    await client?.close().catch(() => {});
    await daemon.close().catch(() => {});
    await rm(directory, { recursive: true, force: true });
  }
});
