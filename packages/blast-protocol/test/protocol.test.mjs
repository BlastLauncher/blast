import assert from "node:assert/strict";
import test from "node:test";

import {
  BLAST_PROTOCOL_VERSION,
  createMessage,
  negotiateProtocolVersion,
  validateHandshakeMessage,
  validateProtocolEnvelope,
  validateShutdownMessage,
} from "../dist/index.js";

test("createMessage adds the current protocol version", () => {
  const message = createMessage("message-1", "hello", {
    role: "client",
    protocolVersions: [BLAST_PROTOCOL_VERSION],
    implementation: { name: "test-client", version: "0.0.0" },
  });

  assert.deepEqual(message, {
    protocolVersion: 1,
    id: "message-1",
    type: "hello",
    payload: {
      role: "client",
      protocolVersions: [1],
      implementation: { name: "test-client", version: "0.0.0" },
    },
  });
});

test("negotiates the highest shared protocol version", () => {
  assert.equal(negotiateProtocolVersion([1, 3, 2], [2, 1]), 2);
  assert.equal(negotiateProtocolVersion([1], [2]), undefined);
});

test("validates a hello message at the wire boundary", () => {
  const message = createMessage("hello-1", "hello", {
    role: "extension-host",
    protocolVersions: [1],
    implementation: { name: "test-host", version: "0.0.0" },
  });

  assert.deepEqual(validateHandshakeMessage(message), { ok: true, value: message });
});

test("reports paths for malformed envelopes and payloads", () => {
  const envelopeResult = validateProtocolEnvelope({ protocolVersion: 0, id: "", type: "hello" });
  assert.equal(envelopeResult.ok, false);
  assert.deepEqual(
    envelopeResult.issues.map((issue) => issue.path),
    ["$.protocolVersion", "$.id", "$.payload"],
  );

  const helloResult = validateHandshakeMessage(
    createMessage("hello-1", "hello", {
      role: "unknown",
      protocolVersions: [],
      implementation: { name: "", version: 1 },
    }),
  );
  assert.equal(helloResult.ok, false);
  assert.deepEqual(helloResult.issues.map((issue) => issue.path).toSorted(), [
    "$.payload.implementation.name",
    "$.payload.implementation.version",
    "$.payload.protocolVersions",
    "$.payload.role",
  ]);
});

test("validates shutdown messages separately from the handshake", () => {
  const shutdown = createMessage("shutdown-1", "shutdown", { reason: "complete" });
  assert.deepEqual(validateShutdownMessage(shutdown), { ok: true, value: shutdown });
  assert.equal(validateHandshakeMessage(shutdown).ok, false);
});
