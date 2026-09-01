import assert from "node:assert/strict";
import test from "node:test";

import { createInMemoryTransportPair } from "@blastlauncher/transport";

import {
  acceptCoreClientSession,
  BlastCore,
  connectCoreClient,
  CORE_COMMAND_LIST_MESSAGE,
  CORE_COMMAND_RUN_MESSAGE,
} from "../dist/index.js";

const identity = { extensionId: "example.extension", commandName: "index" };
const descriptor = {
  ...identity,
  entrypoint: "/extensions/example/index.js",
  rootDirectory: "/extensions/example",
};

function createDeferred() {
  let resolve;
  return { promise: new Promise((resolveValue) => (resolve = resolveValue)), resolve };
}

function idFactory(prefix) {
  let value = 0;
  return () => `${prefix}-${++value}`;
}

async function connectClient(core, options = {}) {
  const [clientTransport, coreTransport] = createInMemoryTransportPair();
  const accepting = acceptCoreClientSession(core, coreTransport, {
    implementation: { name: "test-core", version: "0.0.0" },
    createMessageId: idFactory("core"),
    createSessionId: idFactory("session"),
    ...(options.capabilityBroker === undefined ? {} : { capabilityBroker: options.capabilityBroker }),
  });
  const client = await connectCoreClient(clientTransport, {
    implementation: { name: "test-client", version: "0.0.0" },
    createMessageId: idFactory("client"),
  });
  return { client, server: await accepting };
}

function createControlledSession() {
  const completion = createDeferred();
  const received = createDeferred();
  let state = "ready";
  const protocol = {
    get state() {
      return state;
    },
    async receive() {
      return received.promise;
    },
    async send() {},
    async close() {
      state = "closed";
      received.resolve(undefined);
    },
  };
  return {
    session: {
      descriptor,
      process: {
        completion: completion.promise,
        async stop() {
          await protocol.close();
          completion.resolve({ code: null });
        },
      },
      protocol,
    },
    completion,
  };
}

function createHarness(overrides = {}) {
  const calls = [];
  const supervisor = {
    events: { async *[Symbol.asyncIterator]() {} },
    activeSessions: [],
    async start(value) {
      calls.push(["start", value]);
      return { descriptor: value, process: {}, protocol: {} };
    },
    async stop(...args) {
      calls.push(["stop", ...args]);
    },
    async close(reason) {
      calls.push(["close", reason]);
    },
    ...overrides.supervisor,
  };
  const catalog = {
    async resolve(value) {
      calls.push(["resolve", value]);
      return descriptor;
    },
    ...overrides.catalog,
  };
  return { core: new BlastCore({ catalog, extensionHost: supervisor }), calls, supervisor };
}

test("resolves trusted command metadata before starting an extension", async () => {
  const { core, calls } = createHarness();
  const session = await core.runCommand(identity);

  assert.deepEqual(session.descriptor, descriptor);
  assert.deepEqual(calls, [
    ["resolve", identity],
    ["start", descriptor],
  ]);
});

test("rejects missing and mismatched catalog results", async (context) => {
  await context.test("missing command", async () => {
    const { core } = createHarness({ catalog: { resolve: async () => undefined } });
    await assert.rejects(
      () => core.runCommand(identity),
      (error) => error.code === "command_not_found",
    );
  });

  await context.test("mismatched command", async () => {
    const { core } = createHarness({
      catalog: { resolve: async () => ({ ...descriptor, commandName: "different" }) },
    });
    await assert.rejects(
      () => core.runCommand(identity),
      (error) => error.code === "catalog_identity_mismatch",
    );
  });
});

test("routes stop requests by stable command identity", async () => {
  const { core, calls } = createHarness();
  await core.stopCommand(identity, "user closed command");
  assert.deepEqual(calls, [["stop", identity.extensionId, identity.commandName, "user closed command"]]);
});

test("normalizes path-free command discovery metadata", async () => {
  const { core } = createHarness({
    catalog: {
      listCommands: async () => [
        {
          extensionId: "example.extension",
          commandName: "index",
          title: "Example",
          extensionName: "Example Extension",
          ownerOrAuthorName: "example-owner",
          entryPointMode: "view",
          sourceKind: "raycast-curated",
        },
      ],
    },
  });

  assert.deepEqual(await core.listCommands(), [
    {
      extensionId: "example.extension",
      commandName: "index",
      title: "Example",
      extensionName: "Example Extension",
      ownerOrAuthorName: "example-owner",
      entryPointMode: "view",
      sourceKind: "raycast-curated",
    },
  ]);
});

test("rejects an unknown catalog source classification", async () => {
  const { core } = createHarness({
    catalog: {
      listCommands: async () => [{ extensionId: "example.extension", commandName: "index", sourceKind: "verified" }],
    },
  });

  await assert.rejects(
    () => core.listCommands(),
    (error) => error.code === "invalid_catalog_command",
  );
});

test("fails discovery closed when the catalog cannot list commands", async () => {
  const { core } = createHarness();
  await assert.rejects(
    () => core.listCommands(),
    (error) => error.code === "command_discovery_unavailable",
  );
});

test("waits for in-flight starts before closing the supervisor", async () => {
  const resolution = createDeferred();
  const { core, calls } = createHarness({ catalog: { resolve: () => resolution.promise } });
  const starting = core.runCommand(identity);
  const closing = core.close("application shutdown");

  assert.equal(core.state, "closing");
  resolution.resolve(descriptor);
  await assert.rejects(starting, (error) => error.code === "core_not_running");
  await closing;

  assert.equal(core.state, "closed");
  assert.deepEqual(calls, [["close", "application shutdown"]]);
  assert.throws(
    () => core.runCommand(identity),
    (error) => error.code === "core_not_running",
  );
});

test("validates command identity before consulting the catalog", async () => {
  const { core, calls } = createHarness();
  assert.throws(
    () => core.runCommand({ ...identity, commandName: "" }),
    (error) => error.code === "invalid_command_identity",
  );
  assert.deepEqual(calls, []);
});

test("reports command startup failures through the client boundary", async () => {
  const { core } = createHarness({ catalog: { resolve: async () => undefined } });
  const { client, server } = await connectClient(core);

  await client.runCommand(identity);
  assert.deepEqual(await client.receive(), {
    protocolVersion: 1,
    id: "core-2",
    type: "core.command.start-failed",
    payload: {
      extensionId: identity.extensionId,
      commandName: identity.commandName,
      code: "command_not_found",
      message: "Extension command was not found",
    },
  });

  await client.close("test complete");
  await server.done;
  await core.close();
});

test("serves path-free command discovery through the client boundary", async () => {
  const { core } = createHarness({
    catalog: {
      listCommands: async () => [
        {
          extensionId: "example.extension",
          commandName: "index",
          title: "Example",
          extensionName: "Example Extension",
          entryPointMode: "view",
          sourceKind: "external",
        },
      ],
    },
  });
  const { client, server } = await connectClient(core);

  await client.requestCommandList();
  assert.deepEqual(await client.receive(), {
    protocolVersion: 1,
    id: "core-2",
    type: "core.command.listed",
    payload: {
      commands: [
        {
          extensionId: "example.extension",
          commandName: "index",
          title: "Example",
          extensionName: "Example Extension",
          entryPointMode: "view",
          sourceKind: "external",
        },
      ],
    },
  });

  await client.close("test complete");
  await server.done;
  await core.close();
});

test("refreshes the catalog before serving a client discovery request", async () => {
  const { core, calls } = createHarness({
    catalog: {
      async refresh() {
        calls.push(["refresh"]);
      },
      listCommands: async () => [
        {
          extensionId: "example.extension",
          commandName: "index",
          title: "Example",
          entryPointMode: "view",
        },
      ],
    },
  });
  const { client, server } = await connectClient(core);

  await client.requestCommandList();
  assert.equal((await client.receive()).type, "core.command.listed");
  assert.deepEqual(calls, [["refresh"]]);

  await client.close("test complete");
  await server.done;
  await core.close();
});

test("reports discovery failures through the client boundary", async () => {
  const { core } = createHarness();
  const { client, server } = await connectClient(core);

  await client.requestCommandList();
  assert.deepEqual(await client.receive(), {
    protocolVersion: 1,
    id: "core-2",
    type: "core.command.list-failed",
    payload: {
      code: "command_discovery_unavailable",
      message: "The extension catalog does not support discovery",
    },
  });

  await client.close("test complete");
  await server.done;
  await core.close();
});

test("fails closed when a client sends a malformed command message", async () => {
  const { core } = createHarness({ catalog: { resolve: async () => undefined } });
  const { client, server } = await connectClient(core);

  await client.protocol.send(CORE_COMMAND_RUN_MESSAGE, { extensionId: "", commandName: "index" });
  await assert.rejects(
    () => server.done,
    (error) => error.code === "invalid_core_client_message",
  );
  assert.equal(await client.receive(), undefined);
  await core.close();
});

test("fails closed when a client sends a non-empty discovery payload", async () => {
  const { core } = createHarness();
  const { client, server } = await connectClient(core);

  await client.protocol.send(CORE_COMMAND_LIST_MESSAGE, { unexpected: true });
  await assert.rejects(
    () => server.done,
    (error) => error.code === "invalid_core_client_message",
  );
  assert.equal(await client.receive(), undefined);
  await core.close();
});

test("stops the active command when the client disconnects", async () => {
  const controlled = createControlledSession();
  const { core, calls } = createHarness({
    supervisor: {
      async start(value) {
        calls.push(["start", value]);
        return controlled.session;
      },
      async stop(...args) {
        calls.push(["stop", ...args]);
        await controlled.session.process.stop(args[2]);
      },
    },
  });
  const { client, server } = await connectClient(core);

  await client.runCommand(identity);
  const started = await client.receive();
  assert.equal(started.type, "core.command.started");
  await client.close("client window closed");
  await server.done;

  assert.deepEqual(calls.at(-1), ["stop", identity.extensionId, identity.commandName, "Client disconnected"]);
  await core.close();
});

test("reports an unexpected process exit through the client boundary", async () => {
  const controlled = createControlledSession();
  const { core } = createHarness({
    supervisor: {
      async start() {
        return controlled.session;
      },
    },
  });
  const { client, server } = await connectClient(core);

  await client.runCommand(identity);
  assert.equal((await client.receive()).type, "core.command.started");
  controlled.completion.resolve({ code: 23, signal: "SIGTERM" });

  const exited = await client.receive();
  assert.equal(exited.type, "core.command.exited");
  assert.deepEqual(exited.payload, { ...identity, code: 23, signal: "SIGTERM" });

  await controlled.session.protocol.close("process exited");
  await client.close("test complete");
  await server.done;
  await core.close();
});
