import assert from "node:assert/strict";
import test from "node:test";

import { BlastCore } from "../dist/index.js";

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
