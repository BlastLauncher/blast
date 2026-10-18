import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { once } from "node:events";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { connectCoreClient } from "@blastlauncher/core";
import { createNodeCoreDaemon } from "@blastlauncher/core-node";
import { SceneStateBuffer } from "@blastlauncher/scene";
import { createJsonLineTransport } from "@blastlauncher/transport-node";

const catalogRoot = fileURLToPath(new URL("./fixtures/catalog", import.meta.url));
const bootstrapPath = fileURLToPath(new URL("../../blast-raycast-runtime-node/dist/v2-bootstrap.cjs", import.meta.url));
const workspaceVendorRoot = fileURLToPath(new URL("../../../node_modules", import.meta.url));
const identity = { extensionId: "e2e.tsx", commandName: "index" };

test("runs a Raycast TSX fixture through the packaged V2 bootstrap resource", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "blast-packaged-bootstrap-"));
  const socketPath = path.join(directory, "core.sock");
  let stderr = "";
  const daemon = createNodeCoreDaemon({
    catalogRoot,
    bootstrapPath,
    environment: { ...process.env, BLAST_V2_VENDOR_ROOTS: workspaceVendorRoot },
    socketPath,
    onStderr: (_descriptor, chunk) => {
      stderr += chunk;
    },
  });
  let client;
  try {
    await daemon.start();
    const socket = createConnection(socketPath);
    socket.on("error", () => {});
    await once(socket, "connect");
    client = await connectCoreClient(createJsonLineTransport({ readable: socket, writable: socket }), {
      implementation: { name: "packaged-bootstrap-test", version: "0.0.0" },
      createMessageId: createIdFactory("client"),
    });

    await client.runCommand(identity);
    assert.deepEqual((await client.receive()).payload, identity, stderr);

    const transaction = await client.receive();
    assert.equal(transaction.type, "scene.transaction");
    const buffer = new SceneStateBuffer();
    buffer.apply(transaction.payload);
    const scene = buffer.toJSON();
    assert.equal(scene?.props.navigationTitle, "Compat TSX");
    assert.equal(scene?.children[0]?.props.title, "Hello");

    await client.stopCommand(identity, "packaged bootstrap test complete");
    assert.equal((await client.receive()).type, "core.command.stopped");
  } finally {
    await client?.close().catch(() => {});
    await daemon.close().catch(() => {});
    await assert.rejects(() => stat(socketPath), { code: "ENOENT" });
    await rm(directory, { recursive: true, force: true });
  }
});

function createIdFactory(prefix) {
  let value = 0;
  return () => `${prefix}-${++value}`;
}
