import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { ExtensionHost } from "@blastlauncher/extension-host";

import { NodeExtensionProcessLauncher } from "../dist/index.js";

const bootstrapPath = fileURLToPath(new URL("./fixtures/runtime.mjs", import.meta.url));
const crashBootstrapPath = fileURLToPath(new URL("./fixtures/crash-runtime.mjs", import.meta.url));
const stubbornBootstrapPath = fileURLToPath(new URL("./fixtures/stubborn-runtime.mjs", import.meta.url));
const descriptor = {
  extensionId: "example.extension",
  commandName: "index",
  entrypoint: bootstrapPath,
  rootDirectory: process.cwd(),
};

function idFactory(prefix) {
  let value = 0;
  return () => `${prefix}-${++value}`;
}

test("runs the complete host/runtime lifecycle across a child process", async () => {
  const stderr = [];
  const launcher = new NodeExtensionProcessLauncher({
    bootstrapPath,
    environment: process.env,
    onStderr: (_descriptor, chunk) => stderr.push(chunk),
  });
  const host = new ExtensionHost({
    launcher,
    implementation: { name: "node-test-host", version: "0.0.0" },
    createMessageId: idFactory("host"),
    createSessionId: idFactory("session"),
  });

  const session = await host.start(descriptor);
  assert.equal(session.protocol.remotePeer.implementation.name, "node-test-runtime");
  assert.equal(typeof session.process.processId, "number");
  assert.match(stderr.join(""), /initialized:example\.extension:index/);

  await host.stop(descriptor.extensionId, descriptor.commandName, "test complete");
  const exit = await session.process.completion;
  assert.equal(exit.code, 0);
  assert.equal(host.activeSessions.length, 0);
});

test("requires an absolute bootstrap path", () => {
  assert.throws(
    () => new NodeExtensionProcessLauncher({ bootstrapPath: "runtime.mjs", environment: {} }),
    /must be absolute/,
  );
});

test("cancels before spawning a process", async () => {
  const controller = new AbortController();
  controller.abort("test cancellation");
  const launcher = new NodeExtensionProcessLauncher({ bootstrapPath, environment: process.env });

  await assert.rejects(() => launcher.launch(descriptor, controller.signal), /test cancellation/);
});

test("reports a runtime that crashes before negotiation", async () => {
  const launcher = new NodeExtensionProcessLauncher({
    bootstrapPath: crashBootstrapPath,
    environment: process.env,
  });
  const host = new ExtensionHost({
    launcher,
    implementation: { name: "node-test-host", version: "0.0.0" },
    createMessageId: idFactory("host"),
    createSessionId: idFactory("session"),
  });
  const events = host.events[Symbol.asyncIterator]();

  await assert.rejects(
    () => host.start(descriptor),
    (error) => error.code === "transport_closed",
  );
  const observed = [(await events.next()).value, (await events.next()).value, (await events.next()).value];

  assert.deepEqual(
    observed.map((event) => event.type),
    ["extension.starting", "extension.process-exited", "extension.start-failed"],
  );
  assert.equal(observed[1].exit.code, 17);
  assert.equal(host.activeSessions.length, 0);
});

test("force kills a child that ignores graceful and SIGTERM shutdown", async () => {
  let reportReady;
  const ready = new Promise((resolve) => {
    reportReady = resolve;
  });
  const launcher = new NodeExtensionProcessLauncher({
    bootstrapPath: stubbornBootstrapPath,
    environment: process.env,
    gracefulShutdownMilliseconds: 20,
    onStderr(_descriptor, chunk) {
      if (chunk.includes("stubborn-ready")) {
        reportReady();
      }
    },
  });
  const extensionProcess = await launcher.launch(descriptor);
  await ready;

  await extensionProcess.stop("forced shutdown test");
  const exit = await extensionProcess.completion;
  assert.equal(exit.signal, "SIGKILL");
});
