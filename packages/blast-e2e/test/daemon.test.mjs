import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { once } from "node:events";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

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
