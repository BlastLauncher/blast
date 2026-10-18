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
  extensionName: "Example Extension",
  ownerOrAuthorName: "example-owner",
  entryPointMode: "menu-bar",
  environment: {
    raycastVersion: "1.80.0",
    entryPointType: "command",
    isDevelopment: false,
    appearance: "light",
    textSize: "large",
  },
  preferenceMetadata: {
    region: {
      name: "region",
      type: "dropdown",
      required: true,
      title: "Region",
      description: "Choose a region",
      default: "us",
      data: [
        { title: "United States", value: "us" },
        { title: "Europe", value: "eu" },
      ],
    },
  },
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

  const invalidEnvironment = validateExtensionInitializeMessage(
    createMessage("initialize-1", EXTENSION_INITIALIZE_MESSAGE, {
      descriptor: { ...descriptor, environment: { appearance: "sepia" } },
    }),
  );
  assert.equal(invalidEnvironment.ok, false);
  assert.deepEqual(invalidEnvironment.issues, [
    { path: "$.payload.descriptor.environment.appearance", message: "Expected a valid appearance" },
  ]);

  const invalidPreferenceMetadata = validateExtensionInitializeMessage(
    createMessage("initialize-1", EXTENSION_INITIALIZE_MESSAGE, {
      descriptor: {
        ...descriptor,
        preferenceMetadata: {
          region: {
            ...descriptor.preferenceMetadata.region,
            data: [{ title: "United States", value: 7 }],
          },
        },
      },
    }),
  );
  assert.equal(invalidPreferenceMetadata.ok, false);
  assert.deepEqual(invalidPreferenceMetadata.issues, [
    { path: "$.payload.descriptor.preferenceMetadata.region.data[0].value", message: "Expected a string" },
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
