import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { ExtensionHost } from "@blastlauncher/extension-host";

import { NodeExtensionProcessLauncher } from "../dist/index.js";

const bootstrapPath = fileURLToPath(new URL("./fixtures/runtime.mjs", import.meta.url));
const crashBootstrapPath = fileURLToPath(new URL("./fixtures/crash-runtime.mjs", import.meta.url));
const stubbornBootstrapPath = fileURLToPath(new URL("./fixtures/stubborn-runtime.mjs", import.meta.url));
const entrypointBootstrapPath = fileURLToPath(new URL("./fixtures/bootstrap.mjs", import.meta.url));
const entrypointPath = fileURLToPath(new URL("./fixtures/entrypoints/example-command.mjs", import.meta.url));
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

test("loads the descriptor entrypoint through the fixed bootstrap", async () => {
  const stderr = [];
  const launcher = new NodeExtensionProcessLauncher({
    bootstrapPath: entrypointBootstrapPath,
    environment: process.env,
    onStderr: (_descriptor, chunk) => stderr.push(chunk),
  });
  const host = new ExtensionHost({
    launcher,
    implementation: { name: "node-test-host", version: "0.0.0" },
    createMessageId: idFactory("host"),
    createSessionId: idFactory("session"),
  });
  const entrypointDescriptor = { ...descriptor, entrypoint: entrypointPath };

  const session = await host.start(entrypointDescriptor);
  assert.equal(session.descriptor, entrypointDescriptor);
  assert.match(stderr.join(""), /loaded:example\.extension:index:entrypoint-loaded/);

  await host.stop(entrypointDescriptor.extensionId, entrypointDescriptor.commandName, "test complete");
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

test("provisions manifest dependencies into an isolated view before spawning", async (t) => {
  const storeRoot = await mkdtemp(path.join(tmpdir(), "blast-launcher-deps-"));
  t.after(() => rm(storeRoot, { recursive: true, force: true }));
  const provisionedRoot = fileURLToPath(new URL("./fixtures/provisioned-extension", import.meta.url));
  const stderr = [];
  const launcher = new NodeExtensionProcessLauncher({
    bootstrapPath,
    environment: process.env,
    dependencies: { storeRoot },
    onStderr: (_descriptor, chunk) => stderr.push(chunk),
  });
  const host = new ExtensionHost({
    launcher,
    implementation: { name: "node-test-host", version: "0.0.0" },
    createMessageId: idFactory("host"),
    createSessionId: idFactory("session"),
  });
  t.after(() => host.close("test complete").catch(() => {}));
  const provisionedDescriptor = {
    extensionId: "provisioned.fixture",
    commandName: "index",
    entrypoint: bootstrapPath,
    rootDirectory: provisionedRoot,
  };

  const session = await host.start(provisionedDescriptor);
  const views = [];
  for (const entry of await readdir(storeRoot)) {
    const depManifestPath = path.join(storeRoot, entry, "node_modules", "fixture-dep", "package.json");
    try {
      views.push(JSON.parse(await readFile(depManifestPath, "utf8")));
    } catch {
      // Lock scaffolding and unrelated entries are not views.
    }
  }
  assert.equal(views.length, 1);
  assert.equal(views[0].version, "1.0.0");

  const vendorLine = stderr
    .join("")
    .split("\n")
    .find((line) => line.startsWith("vendor-roots:"));
  assert.ok(vendorLine !== undefined && vendorLine.length > "vendor-roots:".length, "expected an isolated vendor root");

  await host.stop(provisionedDescriptor.extensionId, provisionedDescriptor.commandName, "test complete");
  const exit = await session.process.completion;
  assert.equal(exit.code, 0);
});

test("surfaces dependency install failures with a structured code", async (t) => {
  const storeRoot = await mkdtemp(path.join(tmpdir(), "blast-launcher-deps-"));
  t.after(() => rm(storeRoot, { recursive: true, force: true }));
  const brokenRoot = fileURLToPath(new URL("./fixtures/broken-extension", import.meta.url));
  const launcher = new NodeExtensionProcessLauncher({
    bootstrapPath,
    environment: process.env,
    dependencies: { storeRoot },
  });
  const host = new ExtensionHost({
    launcher,
    implementation: { name: "node-test-host", version: "0.0.0" },
    createMessageId: idFactory("host"),
    createSessionId: idFactory("session"),
  });
  t.after(() => host.close("test complete").catch(() => {}));

  await assert.rejects(
    () =>
      host.start({
        extensionId: "broken.fixture",
        commandName: "index",
        entrypoint: bootstrapPath,
        rootDirectory: brokenRoot,
      }),
    (error) => error.code === "dependency_install_failed",
  );
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
