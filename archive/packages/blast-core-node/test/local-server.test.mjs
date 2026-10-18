import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { once } from "node:events";
import { createConnection, createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { connectCoreClient } from "@blastlauncher/core";
import { createJsonLineTransport } from "@blastlauncher/transport-node";

import { createLocalCoreServer, LocalCoreServerError } from "../dist/index.js";

const identity = { extensionId: "local.extension", commandName: "index" };

function idFactory(prefix) {
  let value = 0;
  return () => `${prefix}-${++value}`;
}

function createDeferred() {
  let resolve;
  return { promise: new Promise((resolveValue) => (resolve = resolveValue)), resolve };
}

function createCoreFixture() {
  const completion = createDeferred();
  const inbound = createDeferred();
  const calls = [];
  let session;
  let state = "ready";
  const protocol = {
    get state() {
      return state;
    },
    async receive() {
      return inbound.promise;
    },
    async send() {},
    async close() {
      if (state === "closed") {
        return;
      }
      state = "closed";
      inbound.resolve(undefined);
      completion.resolve({ code: 0 });
    },
  };
  session = {
    descriptor: {
      ...identity,
      entrypoint: "/extensions/local/index.mjs",
      rootDirectory: "/extensions/local",
    },
    process: {
      completion: completion.promise,
      async stop(reason) {
        calls.push(["process.stop", reason]);
        await protocol.close(reason);
      },
    },
    protocol,
  };
  return {
    calls,
    core: {
      async runCommand(value) {
        calls.push(["run", value]);
        return session;
      },
      async stopCommand(value, reason) {
        calls.push(["stop", value, reason]);
        await session.process.stop(reason);
      },
    },
  };
}

async function connectClient(socketPath) {
  const socket = createConnection(socketPath);
  await once(socket, "connect");
  const transport = createJsonLineTransport({ readable: socket, writable: socket });
  return connectCoreClient(transport, {
    implementation: { name: "local-test-client", version: "0.0.0" },
    createMessageId: idFactory("client"),
  });
}

async function createListener(directory, core, overrides = {}) {
  const socketPath = path.join(directory, "core.sock");
  const listener = createLocalCoreServer({
    core,
    socketPath,
    implementation: { name: "local-test-core", version: "0.0.0" },
    createMessageId: idFactory("core"),
    createSessionId: idFactory("session"),
    ...overrides,
  });
  return { listener, socketPath };
}

test("serves the client/core session over a protected local socket", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "blast-core-listener-"));
  const fixture = createCoreFixture();
  const { listener, socketPath } = await createListener(directory, fixture.core);
  try {
    await listener.listen();
    assert.equal(listener.state, "listening");
    assert.equal((await stat(socketPath)).mode & 0o777, 0o600);

    const client = await connectClient(socketPath);
    await client.runCommand(identity);
    assert.equal((await client.receive()).type, "core.command.started");

    await client.stopCommand(identity, "local test complete");
    const stopped = await client.receive();
    assert.equal(stopped.type, "core.command.stopped");
    assert.equal(stopped.payload.reason, "local test complete");
    await client.close("client complete");

    await listener.close("listener complete");
    assert.equal(listener.state, "closed");
    await assert.rejects(() => stat(socketPath), { code: "ENOENT" });
    assert.deepEqual(fixture.calls, [
      ["run", identity],
      ["stop", identity, "local test complete"],
      ["process.stop", "local test complete"],
    ]);
  } finally {
    await listener.close().catch(() => {});
    await rm(directory, { recursive: true, force: true });
  }
});

test("closes active client sessions before removing the socket", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "blast-core-listener-"));
  const fixture = createCoreFixture();
  const { listener, socketPath } = await createListener(directory, fixture.core);
  try {
    await listener.listen();
    const client = await connectClient(socketPath);
    await client.runCommand(identity);
    assert.equal((await client.receive()).type, "core.command.started");

    await listener.close("application shutdown");

    assert.equal(listener.state, "closed");
    assert.equal(listener.connectionCount, 0);
    assert.equal(await client.receive(), undefined);
    await assert.rejects(() => stat(socketPath), { code: "ENOENT" });
    assert.deepEqual(fixture.calls, [
      ["run", identity],
      ["stop", identity, "Client disconnected"],
      ["process.stop", "Client disconnected"],
    ]);
  } finally {
    await listener.close().catch(() => {});
    await rm(directory, { recursive: true, force: true });
  }
});

test("does not replace an occupied non-socket path", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "blast-core-listener-"));
  const fixture = createCoreFixture();
  const { listener, socketPath } = await createListener(directory, fixture.core);
  try {
    await writeFile(socketPath, "keep me");
    await assert.rejects(
      () => listener.listen(),
      (error) => error instanceof LocalCoreServerError && error.code === "socket_path_occupied",
    );
    assert.equal(await readFile(socketPath, "utf8"), "keep me");
  } finally {
    await listener.close().catch(() => {});
    await rm(directory, { recursive: true, force: true });
  }
});

test("times out a client that never completes the handshake", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "blast-core-listener-"));
  const fixture = createCoreFixture();
  const { listener, socketPath } = await createListener(directory, fixture.core, {
    handshakeTimeoutMilliseconds: 25,
  });
  try {
    await listener.listen();
    const socket = createConnection(socketPath);
    await once(socket, "connect");
    await once(socket, "close");
    assert.equal(listener.connectionCount, 0);
  } finally {
    await listener.close().catch(() => {});
    await rm(directory, { recursive: true, force: true });
  }
});

test("closes a client that sends malformed JSON before the handshake", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "blast-core-listener-"));
  const fixture = createCoreFixture();
  const { listener, socketPath } = await createListener(directory, fixture.core);
  try {
    await listener.listen();
    const socket = createConnection(socketPath);
    socket.on("error", () => {});
    await once(socket, "connect");
    socket.end("not-json\n");
    await once(socket, "close");
    assert.equal(listener.connectionCount, 0);
  } finally {
    await listener.close().catch(() => {});
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects a second connection while the connection limit is full", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "blast-core-listener-"));
  const fixture = createCoreFixture();
  const { listener, socketPath } = await createListener(directory, fixture.core, { maxConnections: 1 });
  try {
    await listener.listen();
    const first = createConnection(socketPath);
    await once(first, "connect");
    const second = createConnection(socketPath);
    await once(second, "close");
    assert.equal(listener.connectionCount, 1);
    first.destroy();
    await once(first, "close");
  } finally {
    await listener.close().catch(() => {});
    await rm(directory, { recursive: true, force: true });
  }
});

test("recovers a stale socket and refuses an active one", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "blast-core-listener-"));
  const fixture = createCoreFixture();
  const socketPath = path.join(directory, "core.sock");
  const stale = createServer();
  await new Promise((resolve) => stale.listen(socketPath, resolve));
  await new Promise((resolve, reject) => stale.close((error) => (error ? reject(error) : resolve())));

  const { listener } = await createListener(directory, fixture.core);
  const { listener: activeListener } = await createListener(directory, fixture.core);
  try {
    await listener.listen();
    assert.equal(listener.state, "listening");
    await assert.rejects(
      () => activeListener.listen(),
      (error) => error instanceof LocalCoreServerError && error.code === "socket_path_occupied",
    );
  } finally {
    await activeListener.close().catch(() => {});
    await listener.close().catch(() => {});
    await rm(directory, { recursive: true, force: true });
  }
});
