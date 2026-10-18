import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { once } from "node:events";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { connectLocalCoreClient, createLocalCoreServer, LocalCoreClientError } from "../dist/index.js";

const listedCommand = {
  extensionId: "local.extension",
  commandName: "index",
  title: "Local command",
  entryPointMode: "view",
};

function idFactory(prefix) {
  let value = 0;
  return () => `${prefix}-${++value}`;
}

function createClientOptions(socketPath, overrides = {}) {
  return {
    socketPath,
    implementation: { name: "local-client-test", version: "0.0.0" },
    createMessageId: idFactory("client"),
    ...overrides,
  };
}

function createDiscoveryCore() {
  return {
    async listCommands() {
      return [listedCommand];
    },
    async runCommand() {
      throw new Error("runCommand is not used by this connector fixture");
    },
    async stopCommand() {},
  };
}

async function createListener(directory) {
  const socketPath = path.join(directory, "core.sock");
  const listener = createLocalCoreServer({
    core: createDiscoveryCore(),
    socketPath,
    implementation: { name: "local-core-test", version: "0.0.0" },
    createMessageId: idFactory("core"),
    createSessionId: idFactory("session"),
  });
  await listener.listen();
  return { listener, socketPath };
}

async function closeServer(server) {
  if (!server.listening) {
    return;
  }
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test("connects a CoreClient through the bounded local listener", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "blast-core-client-"));
  const { listener, socketPath } = await createListener(directory);
  let client;
  try {
    client = await connectLocalCoreClient(createClientOptions(socketPath, { maxFrameBytes: 4096 }));
    await client.requestCommandList();
    const message = await client.receive();

    assert.equal(message.type, "core.command.listed");
    assert.deepEqual(message.payload.commands, [listedCommand]);
    await client.close("connector test complete");
  } finally {
    await client?.close().catch(() => {});
    await listener.close().catch(() => {});
    await rm(directory, { recursive: true, force: true });
  }
});

test("reports a structured failure for a missing local socket", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "blast-core-client-"));
  const socketPath = path.join(directory, "missing.sock");
  try {
    await assert.rejects(
      () => connectLocalCoreClient(createClientOptions(socketPath, { connectTimeoutMilliseconds: 250 })),
      (error) =>
        error instanceof LocalCoreClientError &&
        error.code === "socket_connect_failed" &&
        error.details?.socketPath === socketPath,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("honors an already-aborted signal without opening a socket", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "blast-core-client-"));
  const controller = new AbortController();
  controller.abort("cancel before connect");
  try {
    await assert.rejects(
      () =>
        connectLocalCoreClient(createClientOptions(path.join(directory, "never.sock"), { signal: controller.signal })),
      (error) =>
        error instanceof LocalCoreClientError &&
        error.code === "socket_connect_aborted" &&
        error.details?.reason === "cancel before connect",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("aborts a handshake that does not produce a ready response", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "blast-core-client-"));
  const socketPath = path.join(directory, "core.sock");
  const server = createServer((socket) => socket.on("error", () => {}));
  let peer;
  const controller = new AbortController();
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, resolve);
    });
    const connection = once(server, "connection");
    const connecting = connectLocalCoreClient(createClientOptions(socketPath, { signal: controller.signal }));
    [peer] = await connection;
    peer.on("error", () => {});
    controller.abort("cancel during handshake");

    await assert.rejects(
      connecting,
      (error) =>
        error instanceof LocalCoreClientError &&
        error.code === "socket_connect_aborted" &&
        error.details?.reason === "cancel during handshake",
    );
  } finally {
    peer?.destroy();
    await closeServer(server).catch(() => {});
    await rm(directory, { recursive: true, force: true });
  }
});

test("enforces the bounded connection/handshake deadline", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "blast-core-client-"));
  const socketPath = path.join(directory, "core.sock");
  const server = createServer((socket) => socket.on("error", () => {}));
  let peer;
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, resolve);
    });
    const connection = once(server, "connection");
    const connecting = connectLocalCoreClient(createClientOptions(socketPath, { connectTimeoutMilliseconds: 25 }));
    [peer] = await connection;
    peer.on("error", () => {});

    await assert.rejects(
      connecting,
      (error) =>
        error instanceof LocalCoreClientError &&
        error.code === "socket_connect_timeout" &&
        error.details?.timeoutMilliseconds === 25,
    );
  } finally {
    peer?.destroy();
    await closeServer(server).catch(() => {});
    await rm(directory, { recursive: true, force: true });
  }
});
