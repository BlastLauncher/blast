import assert from "node:assert/strict";
import test from "node:test";

import { createMessage } from "@blastlauncher/protocol";

import {
  EXTENSION_INITIALIZE_MESSAGE,
  EXTENSION_READY_MESSAGE,
  extensionIdentityMatches,
  validateExtensionInitializeMessage,
  validateExtensionReadyMessage,
} from "../dist/index.js";

const descriptor = {
  extensionId: "example.extension",
  commandName: "index",
  entrypoint: "/extensions/example/index.js",
  rootDirectory: "/extensions/example",
  entryPointMode: "menu-bar",
};

test("validates extension initialization messages", () => {
  const message = createMessage("initialize-1", EXTENSION_INITIALIZE_MESSAGE, { descriptor });
  assert.deepEqual(validateExtensionInitializeMessage(message), { ok: true, value: message });
});

test("reports invalid extension descriptor fields", () => {
  const result = validateExtensionInitializeMessage(
    createMessage("initialize-1", EXTENSION_INITIALIZE_MESSAGE, { descriptor: { ...descriptor, entrypoint: "" } }),
  );

  assert.equal(result.ok, false);
  assert.deepEqual(result.issues, [
    { path: "$.payload.descriptor.entrypoint", message: "Expected a non-empty string" },
  ]);

  const invalidMode = validateExtensionInitializeMessage(
    createMessage("initialize-1", EXTENSION_INITIALIZE_MESSAGE, {
      descriptor: { ...descriptor, entryPointMode: "invalid" },
    }),
  );
  assert.equal(invalidMode.ok, false);
  assert.deepEqual(invalidMode.issues, [
    { path: "$.payload.descriptor.entryPointMode", message: "Expected a valid entrypoint mode" },
  ]);
});

test("validates ready messages and compares command identities", () => {
  const message = createMessage("ready-1", EXTENSION_READY_MESSAGE, {
    extensionId: descriptor.extensionId,
    commandName: descriptor.commandName,
  });
  const result = validateExtensionReadyMessage(message);

  assert.equal(result.ok, true);
  assert.equal(extensionIdentityMatches(descriptor, result.value.payload), true);
  assert.equal(extensionIdentityMatches(descriptor, { ...result.value.payload, commandName: "other" }), false);
});
