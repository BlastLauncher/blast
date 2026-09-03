import assert from "node:assert/strict";
import test from "node:test";

import { initializeExtensionRuntime } from "@blastlauncher/extension-runtime";
import { createInMemoryTransportPair } from "@blastlauncher/transport";

import { ExtensionHost } from "../dist/index.js";

const descriptor = {
  extensionId: "example.extension",
  commandName: "index",
  entrypoint: "/tmp/example/index.js",
  rootDirectory: "/tmp/example",
};

function idFactory(prefix) {
  let value = 0;
  return () => `${prefix}-${++value}`;
}

function createDeferred() {
  let resolve;
  return { promise: new Promise((resolveValue) => (resolve = resolveValue)), resolve };
}

function createLauncher(stopped, options = {}) {
  return {
    async launch() {
      const [runtimeTransport, hostTransport] = createInMemoryTransportPair();
      const completion = createDeferred();
      const runtime = initializeExtensionRuntime(runtimeTransport, {
        implementation: { name: "test-runtime", version: "0.0.0" },
        createMessageId: idFactory("runtime"),
        initialize: options.initialize,
      });
      void runtime.catch(() => {});
      return {
        connection: hostTransport,
        completion: completion.promise,
        async stop(reason) {
          stopped.push(reason);
          completion.resolve({ code: 0 });
        },
      };
    },
  };
}

function createHost(launcher) {
  return new ExtensionHost({
    launcher,
    implementation: { name: "test-extension-host", version: "0.0.0" },
    createMessageId: idFactory("host"),
    createSessionId: idFactory("session"),
  });
}

test("negotiates, initializes, tracks, and stops an extension session", async () => {
  const stopped = [];
  const initialized = [];
  const host = createHost(createLauncher(stopped, { initialize: (value) => initialized.push(value) }));
  const events = host.events[Symbol.asyncIterator]();

  const session = await host.start(descriptor);
  assert.equal(host.activeSessions.length, 1);
  assert.equal(session.protocol.remotePeer.role, "extension-runtime");
  assert.deepEqual(initialized, [descriptor]);
  assert.equal((await events.next()).value.type, "extension.starting");
  assert.equal((await events.next()).value.type, "extension.started");

  await host.stop(descriptor.extensionId, descriptor.commandName, "test complete");
  assert.equal(host.activeSessions.length, 0);
  assert.deepEqual(stopped, ["test complete"]);
  assert.equal((await events.next()).value.type, "extension.stopping");
  assert.equal((await events.next()).value.type, "extension.process-exited");
  assert.equal((await events.next()).value.type, "extension.stopped");
});

test("rejects duplicate extension sessions", async () => {
  const host = createHost(createLauncher([]));

  await host.start(descriptor);
  await assert.rejects(() => host.start(descriptor), /session already exists/);
});

test("reserves a session while its process is starting", async () => {
  let completeLaunch;
  const baseLauncher = createLauncher([]);
  const launcher = {
    launch: () =>
      new Promise((resolve) => {
        completeLaunch = async () => resolve(await baseLauncher.launch());
      }),
  };
  const host = createHost(launcher);
  const firstStart = host.start(descriptor);

  await assert.rejects(() => host.start(descriptor), /session already exists/);
  await completeLaunch();
  await firstStart;
});

test("cleans up and reports an initialization failure", async () => {
  const stopped = [];
  const host = createHost(
    createLauncher(stopped, {
      initialize() {
        throw new Error("entrypoint failed");
      },
    }),
  );
  const events = host.events[Symbol.asyncIterator]();

  await assert.rejects(() => host.start(descriptor), /closed before reporting readiness/);
  assert.equal(host.activeSessions.length, 0);
  assert.deepEqual(stopped, ["Extension startup failed"]);
  assert.equal((await events.next()).value.type, "extension.starting");
  assert.equal((await events.next()).value.type, "extension.process-exited");
  assert.equal((await events.next()).value.type, "extension.start-failed");
});

test("removes a session when its process exits unexpectedly", async () => {
  const completion = createDeferred();
  const launcher = createLauncher([]);
  const originalLaunch = launcher.launch;
  launcher.launch = async (...args) => ({ ...(await originalLaunch(...args)), completion: completion.promise });
  const host = createHost(launcher);
  const events = host.events[Symbol.asyncIterator]();

  await host.start(descriptor);
  await events.next();
  await events.next();
  completion.resolve({ code: 9 });
  const exitEvent = (await events.next()).value;

  assert.equal(exitEvent.type, "extension.process-exited");
  assert.equal(exitEvent.exit.code, 9);
  assert.equal(host.activeSessions.length, 0);
});

test("closing the host stops sessions and closes its event stream", async () => {
  const stopped = [];
  const host = createHost(createLauncher(stopped));
  const events = host.events[Symbol.asyncIterator]();
  await host.start(descriptor);

  await host.close("core shutdown");
  const remaining = [];
  for await (const event of { [Symbol.asyncIterator]: () => events }) {
    remaining.push(event.type);
  }

  assert.deepEqual(stopped, ["core shutdown"]);
  assert.deepEqual(remaining, [
    "extension.starting",
    "extension.started",
    "extension.stopping",
    "extension.process-exited",
    "extension.stopped",
  ]);
  await assert.rejects(() => host.start(descriptor), /host is closed/);
});
