import assert from "node:assert/strict";
import test from "node:test";

import { EXTENSION_INITIALIZE_MESSAGE, validateExtensionReadyMessage } from "@blastlauncher/extension-contract";
import { acceptProtocolSession } from "@blastlauncher/session";
import { createInMemoryTransportPair } from "@blastlauncher/transport";

import { initializeExtensionRuntime } from "../dist/index.js";

const descriptor = {
  extensionId: "example.extension",
  commandName: "index",
  entrypoint: "/extensions/example/index.js",
  rootDirectory: "/extensions/example",
};

function idFactory(prefix) {
  let value = 0;
  return () => `${prefix}-${++value}`;
}

async function acceptHost(transport, role = "extension-host") {
  return acceptProtocolSession(transport, {
    role,
    implementation: { name: "test-host", version: "0.0.0" },
    createMessageId: idFactory("host"),
    createSessionId: () => "session-1",
  });
}

test("initializes a command and reports extension readiness", async () => {
  const [runtimeTransport, hostTransport] = createInMemoryTransportPair();
  const initialized = [];
  const runtimePromise = initializeExtensionRuntime(runtimeTransport, {
    implementation: { name: "test-runtime", version: "0.0.0" },
    createMessageId: idFactory("runtime"),
    initialize(descriptorValue) {
      initialized.push(descriptorValue);
    },
  });
  const host = await acceptHost(hostTransport);

  await host.send(EXTENSION_INITIALIZE_MESSAGE, { descriptor });
  const ready = validateExtensionReadyMessage(await host.receive());
  const runtime = await runtimePromise;

  assert.equal(ready.ok, true);
  assert.deepEqual(initialized, [descriptor]);
  assert.deepEqual(runtime.descriptor, descriptor);
  assert.equal(runtime.session.remotePeer.role, "extension-host");
});

test("rejects a peer that is not an extension host", async () => {
  const [runtimeTransport, coreTransport] = createInMemoryTransportPair();
  const runtimePromise = initializeExtensionRuntime(runtimeTransport, {
    implementation: { name: "test-runtime", version: "0.0.0" },
    createMessageId: idFactory("runtime"),
  });

  await acceptHost(coreTransport, "core");
  await assert.rejects(runtimePromise, (error) => error.code === "unexpected_peer_role");
});

test("does not report readiness when runtime initialization fails", async () => {
  const [runtimeTransport, hostTransport] = createInMemoryTransportPair();
  const runtimePromise = initializeExtensionRuntime(runtimeTransport, {
    implementation: { name: "test-runtime", version: "0.0.0" },
    createMessageId: idFactory("runtime"),
    initialize() {
      throw new Error("entrypoint failed");
    },
  });
  const host = await acceptHost(hostTransport);

  await host.send(EXTENSION_INITIALIZE_MESSAGE, { descriptor });
  await assert.rejects(runtimePromise, /entrypoint failed/);
  const shutdown = await host.receive();
  assert.equal(shutdown.type, "shutdown");
});
