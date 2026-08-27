import assert from "node:assert/strict";
import test from "node:test";

import { createMessage, validateHandshakeMessage } from "@blastlauncher/protocol";
import { createInMemoryTransportPair } from "@blastlauncher/transport";

import { acceptProtocolSession, connectProtocolSession } from "../dist/index.js";

function idFactory(prefix) {
  let value = 0;
  return () => `${prefix}-${++value}`;
}

function connectorOptions(overrides = {}) {
  return {
    role: "extension-host",
    implementation: { name: "test-extension-host", version: "0.0.0" },
    createMessageId: idFactory("connector"),
    ...overrides,
  };
}

function acceptorOptions(overrides = {}) {
  return {
    role: "core",
    implementation: { name: "test-core", version: "0.0.0" },
    createMessageId: idFactory("acceptor"),
    createSessionId: () => "session-1",
    ...overrides,
  };
}

async function createSessionPair() {
  const [connectorTransport, acceptorTransport] = createInMemoryTransportPair();
  return Promise.all([
    connectProtocolSession(connectorTransport, connectorOptions()),
    acceptProtocolSession(acceptorTransport, acceptorOptions()),
  ]);
}

test("negotiates one session identity and both peer identities", async () => {
  const [connector, acceptor] = await createSessionPair();

  assert.equal(connector.state, "ready");
  assert.equal(acceptor.state, "ready");
  assert.equal(connector.sessionId, "session-1");
  assert.equal(acceptor.sessionId, "session-1");
  assert.equal(connector.protocolVersion, 1);
  assert.equal(acceptor.protocolVersion, 1);
  assert.deepEqual(connector.remotePeer, {
    role: "core",
    implementation: { name: "test-core", version: "0.0.0" },
  });
  assert.deepEqual(acceptor.remotePeer, {
    role: "extension-host",
    implementation: { name: "test-extension-host", version: "0.0.0" },
  });
});

test("exchanges application messages only after negotiation", async () => {
  const [connector, acceptor] = await createSessionPair();

  const sent = await connector.send("test.message", { value: 42 });
  assert.deepEqual(await acceptor.receive(), sent);
  await assert.rejects(() => connector.send("ready", {}), /reserved by the session/);
  await assert.rejects(() => connector.send("", {}), /must not be empty/);
});

test("sends shutdown and closes both session states", async () => {
  const [connector, acceptor] = await createSessionPair();

  await connector.close("test complete");
  const shutdown = await acceptor.receive();

  assert.equal(shutdown.type, "shutdown");
  assert.deepEqual(shutdown.payload, { reason: "test complete" });
  assert.equal(connector.state, "closed");
  assert.equal(acceptor.state, "closed");
});

test("rejects negotiation when no protocol version overlaps", async () => {
  const [connectorTransport, acceptorTransport] = createInMemoryTransportPair();
  const results = await Promise.allSettled([
    connectProtocolSession(connectorTransport, connectorOptions({ protocolVersions: [1] })),
    acceptProtocolSession(acceptorTransport, acceptorOptions({ protocolVersions: [2] })),
  ]);

  assert.deepEqual(
    results.map((result) => result.status),
    ["rejected", "rejected"],
  );
  assert.equal(results[0].reason.code, "unsupported_protocol_version");
  assert.equal(results[1].reason.code, "unsupported_protocol_version");
});

test("cancellation closes a pending negotiation", async () => {
  const [connectorTransport, acceptorTransport] = createInMemoryTransportPair();
  const controller = new AbortController();
  const accepting = acceptProtocolSession(acceptorTransport, acceptorOptions({ signal: controller.signal }));

  controller.abort("test cancellation");

  await assert.rejects(accepting, (error) => error.code === "cancelled");
  await assert.rejects(() => connectorTransport.send(createMessage("late", "hello", {})), /closed/i);
});

test("reports malformed handshake input before closing", async () => {
  const [connectorTransport, acceptorTransport] = createInMemoryTransportPair();
  const responses = connectorTransport.messages[Symbol.asyncIterator]();
  const accepting = acceptProtocolSession(acceptorTransport, acceptorOptions());

  await connectorTransport.send({ protocolVersion: 1, id: "bad", type: "hello" });
  const response = await responses.next();

  assert.equal(response.done, false);
  const validation = validateHandshakeMessage(response.value);
  assert.equal(validation.ok, true);
  assert.equal(validation.value.type, "error");
  assert.equal(validation.value.payload.code, "invalid_handshake");
  await assert.rejects(accepting, (error) => error.code === "invalid_handshake");
});

test("closes the transport when shutdown message creation fails", async () => {
  const [connectorTransport, acceptorTransport] = createInMemoryTransportPair();
  const connectorIds = ["hello-1", ""];
  const [connector, acceptor] = await Promise.all([
    connectProtocolSession(connectorTransport, connectorOptions({ createMessageId: () => connectorIds.shift() })),
    acceptProtocolSession(acceptorTransport, acceptorOptions()),
  ]);

  await assert.rejects(() => connector.close("test complete"), /Message IDs must not be empty/);
  assert.equal(connector.state, "closed");
  assert.equal(await acceptor.receive(), undefined);
  assert.equal(acceptor.state, "closed");
});

test("fails both peers when an application message uses another protocol version", async () => {
  const [connectorTransport, acceptorTransport] = createInMemoryTransportPair();
  const [connector, acceptor] = await Promise.all([
    connectProtocolSession(connectorTransport, connectorOptions()),
    acceptProtocolSession(acceptorTransport, acceptorOptions()),
  ]);

  await acceptorTransport.send(createMessage("wrong-version", "test.message", {}, 2));

  await assert.rejects(
    () => connector.receive(),
    (error) => error.code === "protocol_version_mismatch",
  );
  await assert.rejects(
    () => acceptor.receive(),
    (error) => error.code === "protocol_version_mismatch",
  );
  assert.equal(connector.state, "failed");
  assert.equal(acceptor.state, "failed");
});

test("fails and closes a session when application delivery fails", async () => {
  const [connectorTransport, acceptorTransport] = createInMemoryTransportPair();
  let sends = 0;
  const failingTransport = {
    messages: connectorTransport.messages,
    async send(message) {
      sends += 1;
      if (sends > 1) {
        throw new Error("simulated delivery failure");
      }
      await connectorTransport.send(message);
    },
    close: (reason) => connectorTransport.close(reason),
  };
  const [connector, acceptor] = await Promise.all([
    connectProtocolSession(failingTransport, connectorOptions()),
    acceptProtocolSession(acceptorTransport, acceptorOptions()),
  ]);

  await assert.rejects(
    () => connector.send("test.message", {}),
    (error) => error.code === "transport_send_failed",
  );
  assert.equal(connector.state, "failed");
  assert.equal(await acceptor.receive(), undefined);
  assert.equal(acceptor.state, "closed");
});
