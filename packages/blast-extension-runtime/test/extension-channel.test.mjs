import assert from "node:assert/strict";
import test from "node:test";

import { acceptProtocolSession, connectProtocolSession } from "@blastlauncher/session";
import { createInMemoryTransportPair } from "@blastlauncher/transport";

import { createExtensionChannel } from "../dist/index.js";

function idFactory(prefix) {
  let value = 0;
  return () => `${prefix}-${++value}`;
}

const descriptor = {
  extensionId: "fixture.extension",
  commandName: "index",
  entrypoint: "/extensions/fixture/index.mjs",
  rootDirectory: "/extensions/fixture",
};

const transaction = {
  transactionId: "transaction-1",
  operations: [
    {
      type: "snapshot",
      root: { id: "root", type: "list", props: {}, children: [] },
    },
  ],
};

async function createPeerPair() {
  const [runtimeTransport, hostTransport] = createInMemoryTransportPair();
  const runtimeSessionPromise = connectProtocolSession(runtimeTransport, {
    role: "extension-runtime",
    implementation: { name: "runtime-test", version: "0.0.0" },
    createMessageId: idFactory("runtime"),
  });
  const hostSession = await acceptProtocolSession(hostTransport, {
    role: "extension-host",
    implementation: { name: "host-test", version: "0.0.0" },
    createMessageId: idFactory("host"),
    createSessionId: idFactory("session"),
  });
  const runtimeSession = await runtimeSessionPromise;
  return { runtimeSession, hostSession };
}

test("publish validates and forwards scene transactions", async () => {
  const { runtimeSession, hostSession } = await createPeerPair();
  const channel = createExtensionChannel(runtimeSession, { descriptor });

  await channel.publish(transaction);

  const message = await hostSession.receive();
  assert.equal(message.type, "scene.transaction");
  assert.deepEqual(message.payload, transaction);
  await runtimeSession.close("test complete");
  await hostSession.receive();
});

test("publish refuses invalid transactions without sending", async () => {
  const { runtimeSession, hostSession } = await createPeerPair();
  const channel = createExtensionChannel(runtimeSession, { descriptor });

  await assert.rejects(
    () => channel.publish({ transactionId: "transaction-2", operations: "not-an-array" }),
    (error) => error.code === "invalid_transaction",
  );

  await runtimeSession.close("test complete");
  const message = await hostSession.receive();
  assert.equal(message.type, "shutdown");
});

test("routes valid scene events to the registered handler", async () => {
  const { runtimeSession, hostSession } = await createPeerPair();
  const channel = createExtensionChannel(runtimeSession, { descriptor });
  const received = [];
  channel.onEvent((payload) => {
    received.push(payload);
  });

  await hostSession.send("scene.event", { eventId: "event-1" });
  await channel.handleMessage(await runtimeSession.receive());
  await hostSession.send("other.message", { anything: true });
  await channel.handleMessage(await runtimeSession.receive());

  assert.deepEqual(received, [{ eventId: "event-1" }]);
  await runtimeSession.close("test complete");
  await hostSession.receive();
});

test("replaces the event handler on repeated registration", async () => {
  const { runtimeSession, hostSession } = await createPeerPair();
  const channel = createExtensionChannel(runtimeSession, { descriptor });
  const first = [];
  const second = [];
  channel.onEvent((payload) => first.push(payload));
  channel.onEvent((payload) => second.push(payload));

  await hostSession.send("scene.event", { eventId: "event-2" });
  await channel.handleMessage(await runtimeSession.receive());

  assert.deepEqual(first, []);
  assert.deepEqual(second, [{ eventId: "event-2" }]);
  await runtimeSession.close("test complete");
  await hostSession.receive();
});

test("fails the session on an invalid scene event", async () => {
  const { runtimeSession, hostSession } = await createPeerPair();
  const channel = createExtensionChannel(runtimeSession, { descriptor });
  const received = [];
  channel.onEvent((payload) => received.push(payload));

  await hostSession.send("scene.event", { eventId: 42 });
  await assert.rejects(
    async () => channel.handleMessage(await runtimeSession.receive()),
    (error) => error.code === "invalid_scene_event",
  );

  assert.deepEqual(received, []);
  assert.equal(runtimeSession.state, "closed");
  assert.equal((await hostSession.receive()).type, "shutdown");
});

test("awaits handlers that return promises", async () => {
  const { runtimeSession, hostSession } = await createPeerPair();
  const channel = createExtensionChannel(runtimeSession, { descriptor });
  const order = [];
  channel.onEvent(async (payload) => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    order.push(`handled:${payload.eventId}`);
  });

  await hostSession.send("scene.event", { eventId: "event-3" });
  await channel.handleMessage(await runtimeSession.receive());
  order.push("after-dispatch");

  assert.deepEqual(order, ["handled:event-3", "after-dispatch"]);
  await runtimeSession.close("test complete");
  await hostSession.receive();
});

test("round-trips capability requests through the session", async () => {
  const { runtimeSession, hostSession } = await createPeerPair();
  const channel = createExtensionChannel(runtimeSession, {
    descriptor,
    createRequestId: (() => {
      let value = 0;
      return () => `request-${++value}`;
    })(),
  });

  const requestPromise = channel.requestCapability({
    capability: "clipboard",
    operation: "write",
    arguments: { text: "hello" },
  });

  const request = await hostSession.receive();
  assert.equal(request.type, "capability.request");
  assert.equal(request.payload.requestId, "request-1");
  assert.equal(request.payload.extensionId, "fixture.extension");
  assert.equal(request.payload.commandName, "index");
  assert.deepEqual(request.payload.arguments, { text: "hello" });

  await hostSession.send("capability.response", {
    requestId: "request-1",
    outcome: "succeeded",
    value: null,
  });
  await channel.handleMessage(await runtimeSession.receive());
  const response = await requestPromise;
  assert.deepEqual(response, { requestId: "request-1", outcome: "succeeded", value: null });

  await runtimeSession.close("test complete");
  await hostSession.receive();
});

test("resolves denied capability responses", async () => {
  const { runtimeSession, hostSession } = await createPeerPair();
  const channel = createExtensionChannel(runtimeSession, { descriptor });

  const requestPromise = channel.requestCapability({ capability: "clipboard", operation: "read" });
  await hostSession.receive();
  await hostSession.send("capability.response", {
    requestId: "capability-1",
    outcome: "denied",
    code: "capability_denied",
    message: "not granted",
  });
  await channel.handleMessage(await runtimeSession.receive());

  const response = await requestPromise;
  assert.equal(response.outcome, "denied");
  assert.equal(response.code, "capability_denied");

  await runtimeSession.close("test complete");
  await hostSession.receive();
});

test("rejects pending capability requests when the channel closes", async () => {
  const { runtimeSession, hostSession } = await createPeerPair();
  const channel = createExtensionChannel(runtimeSession, { descriptor });

  const requestPromise = channel.requestCapability({ capability: "clipboard", operation: "read" });
  await hostSession.receive();
  channel.close();

  await assert.rejects(
    () => requestPromise,
    (error) => error.code === "session_closed",
  );

  await runtimeSession.close("test complete");
  await hostSession.receive();
});

test("refuses invalid capability responses", async () => {
  const { runtimeSession, hostSession } = await createPeerPair();
  const channel = createExtensionChannel(runtimeSession, { descriptor });

  void channel.requestCapability({ capability: "clipboard", operation: "read" });
  await hostSession.receive();
  await hostSession.send("capability.response", { requestId: "capability-1", outcome: "succeeded", value: {} });
  await assert.rejects(
    async () => channel.handleMessage(await runtimeSession.receive()),
    (error) => error.code === "invalid_capability_response",
  );

  await runtimeSession.close("test complete");
  await hostSession.receive();
});
