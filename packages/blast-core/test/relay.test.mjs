import assert from "node:assert/strict";
import test from "node:test";

import { CapabilityBroker, createGrantListPolicy } from "@blastlauncher/capability";
import { acceptProtocolSession, connectProtocolSession } from "@blastlauncher/session";
import { createInMemoryTransportPair } from "@blastlauncher/transport";

import { relaySessionTraffic } from "../dist/index.js";

const descriptor = {
  extensionId: "relay.extension",
  commandName: "index",
  entrypoint: "/extensions/relay/index.mjs",
  rootDirectory: "/extensions/relay",
};

const transaction = {
  transactionId: "transaction-1",
  operations: [
    {
      type: "snapshot",
      root: {
        id: "root",
        type: "list",
        props: {},
        children: [
          {
            id: "item-1",
            type: "list-item",
            props: { title: "Hello" },
            children: [{ id: "action-1", type: "action", props: { title: "Run", onAction: "event-1" }, children: [] }],
          },
        ],
      },
    },
  ],
};

function idFactory(prefix) {
  let value = 0;
  return () => `${prefix}-${++value}`;
}

async function createRelayHarness({ broker, sceneSink } = {}) {
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
  const session = {
    descriptor,
    process: { connection: runtimeTransport, completion: new Promise(() => {}), stop: async () => {} },
    protocol: hostSession,
  };
  const relay = relaySessionTraffic(session, { sceneSink, capabilityBroker: broker });
  return { runtimeSession, hostSession, relay };
}

test("forwards validated scene transactions to the sink", async () => {
  const received = [];
  const { runtimeSession, hostSession, relay } = await createRelayHarness({
    sceneSink: { publish: (payload) => received.push(payload) },
  });

  await runtimeSession.send("scene.transaction", transaction);
  await new Promise((resolve) => setTimeout(resolve, 5));

  assert.deepEqual(received, [transaction]);
  await runtimeSession.close("test complete");
  await relay.done;
  assert.equal(hostSession.state, "closed");
});

test("routes capability requests through the broker", async () => {
  const performed = [];
  const broker = new CapabilityBroker({
    policy: createGrantListPolicy([{ extensionId: "relay.extension", capability: "clipboard", operation: "write" }]),
    providers: {
      clipboard: {
        async perform(request) {
          performed.push(request);
          return null;
        },
      },
    },
  });
  const { runtimeSession, relay } = await createRelayHarness({ broker });

  await runtimeSession.send("capability.request", {
    requestId: "request-1",
    extensionId: "relay.extension",
    commandName: "index",
    capability: "clipboard",
    operation: "write",
    arguments: { text: "hello" },
  });
  const response = await runtimeSession.receive();

  assert.equal(response.type, "capability.response");
  assert.deepEqual(response.payload, { requestId: "request-1", outcome: "succeeded", value: null });
  assert.deepEqual(
    performed.map((request) => request.arguments),
    [{ text: "hello" }],
  );

  await runtimeSession.close("test complete");
  await relay.done;
});

test("denies capability requests with mismatched identities", async () => {
  const performed = [];
  const broker = new CapabilityBroker({
    policy: createGrantListPolicy([{ extensionId: "relay.extension", capability: "clipboard", operation: "write" }]),
    providers: {
      clipboard: {
        async perform(request) {
          performed.push(request);
          return null;
        },
      },
    },
  });
  const { runtimeSession, relay } = await createRelayHarness({ broker });

  await runtimeSession.send("capability.request", {
    requestId: "request-2",
    extensionId: "other.extension",
    commandName: "index",
    capability: "clipboard",
    operation: "write",
  });
  const response = await runtimeSession.receive();

  assert.equal(response.payload.outcome, "denied");
  assert.equal(response.payload.code, "identity_mismatch");
  assert.deepEqual(performed, []);

  await runtimeSession.close("test complete");
  await relay.done;
});

test("denies capability requests without a broker", async () => {
  const { runtimeSession, relay } = await createRelayHarness();

  await runtimeSession.send("capability.request", {
    requestId: "request-3",
    extensionId: "relay.extension",
    commandName: "index",
    capability: "clipboard",
    operation: "write",
  });
  const response = await runtimeSession.receive();

  assert.equal(response.payload.outcome, "denied");
  assert.equal(response.payload.code, "capability_denied");

  await runtimeSession.close("test complete");
  await relay.done;
});

test("sends scene events toward the extension", async () => {
  const { runtimeSession, relay } = await createRelayHarness();

  await relay.sendSceneEvent("event-9");
  const event = await runtimeSession.receive();

  assert.equal(event.type, "scene.event");
  assert.deepEqual(event.payload, { eventId: "event-9" });

  await runtimeSession.close("test complete");
  await relay.done;
});

test("rejects invalid scene transactions and closes the session", async () => {
  const { runtimeSession, relay } = await createRelayHarness({ sceneSink: { publish: () => {} } });

  await runtimeSession.send("scene.transaction", { transactionId: "transaction-2", operations: "broken" });

  await assert.rejects(
    () => relay.done,
    (error) => error.code === "invalid_scene_transaction",
  );
  assert.equal((await runtimeSession.receive()).type, "shutdown");
  assert.equal(runtimeSession.state, "closed");
});

test("surfaces sink failures by closing the session", async () => {
  const { runtimeSession, relay } = await createRelayHarness({
    sceneSink: {
      publish() {
        throw new Error("client render failed");
      },
    },
  });

  await runtimeSession.send("scene.transaction", transaction);

  await assert.rejects(() => relay.done, /client render failed/);
  assert.equal((await runtimeSession.receive()).type, "shutdown");
  assert.equal(runtimeSession.state, "closed");
});

test("ends the relay cleanly when the runtime shuts down", async () => {
  const { runtimeSession, relay } = await createRelayHarness({ sceneSink: { publish: () => {} } });

  await runtimeSession.close("graceful shutdown");
  await relay.done;
});
