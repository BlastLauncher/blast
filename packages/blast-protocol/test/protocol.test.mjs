import assert from "node:assert/strict";
import test from "node:test";

import { BLAST_PROTOCOL_VERSION, createMessage } from "../dist/index.js";

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
