import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { CapabilityBroker, createGrantListPolicy } from "@blastlauncher/capability";
import { BlastCore, relaySessionTraffic } from "@blastlauncher/core";
import { FilesystemExtensionCatalog } from "@blastlauncher/core-node";
import { ExtensionHost } from "@blastlauncher/extension-host";
import { NodeExtensionProcessLauncher } from "@blastlauncher/extension-host-node";
import { SceneStateBuffer } from "@blastlauncher/scene";

const realRoot = fileURLToPath(new URL("./fixtures/real", import.meta.url));
const bootstrapPath = fileURLToPath(new URL("./fixtures/bootstrap.mjs", import.meta.url));
const expectations = JSON.parse(fs.readFileSync(path.join(realRoot, "expectations.json"), "utf8"));

function createCore() {
  const catalog = new FilesystemExtensionCatalog({ root: realRoot });
  const launcher = new NodeExtensionProcessLauncher({ bootstrapPath, environment: process.env });
  let hostMessageId = 0;
  let sessionId = 0;
  const host = new ExtensionHost({
    launcher,
    implementation: { name: "matrix-host", version: "0.0.0" },
    createMessageId: () => `host-${++hostMessageId}`,
    createSessionId: () => `session-${++sessionId}`,
  });
  const grants = expectations.flatMap((expectation) => [
    ...(expectation.apis?.includes("Clipboard")
      ? [{ extensionId: expectation.extensionId, capability: "clipboard", operation: "write" }]
      : []),
    ...(expectation.apis?.includes("getApplications")
      ? [{ extensionId: expectation.extensionId, capability: "application", operation: "list" }]
      : []),
    ...(expectation.apis?.includes("getSelectedText")
      ? [{ extensionId: expectation.extensionId, capability: "selection", operation: "read" }]
      : []),
    ...(expectation.apis?.includes("openCommandPreferences")
      ? [{ extensionId: expectation.extensionId, capability: "preferences", operation: "openCommand" }]
      : []),
    ...(expectation.apis?.includes("getSelectedFinderItems")
      ? [{ extensionId: expectation.extensionId, capability: "finder", operation: "selectedItems" }]
      : []),
    ...(expectation.apis?.includes("showInFinder")
      ? [{ extensionId: expectation.extensionId, capability: "finder", operation: "show" }]
      : []),
    ...(expectation.apis?.includes("getFrontmostApplication")
      ? [{ extensionId: expectation.extensionId, capability: "application", operation: "frontmost" }]
      : []),
    ...(expectation.apis?.includes("AI")
      ? [{ extensionId: expectation.extensionId, capability: "ai", operation: "ask" }]
      : []),
    ...(expectation.apis?.includes("OAuth")
      ? [
          { extensionId: expectation.extensionId, capability: "oauth", operation: "getTokens" },
          { extensionId: expectation.extensionId, capability: "oauth", operation: "authorizationRequest" },
          { extensionId: expectation.extensionId, capability: "oauth", operation: "authorize" },
          { extensionId: expectation.extensionId, capability: "oauth", operation: "setTokens" },
          { extensionId: expectation.extensionId, capability: "oauth", operation: "removeTokens" },
        ]
      : []),
    ...(expectation.apis?.includes("updateCommandMetadata")
      ? [{ extensionId: expectation.extensionId, capability: "command", operation: "updateMetadata" }]
      : []),
  ]);
  const broker = new CapabilityBroker({
    policy: createGrantListPolicy(grants),
    providers: {
      clipboard: {
        async perform() {
          return null;
        },
      },
      ai: {
        async perform(request) {
          if (request.operation === "ask") {
            return "probe answer";
          }
          throw new Error(`Unknown AI operation ${JSON.stringify(request.operation)}`);
        },
      },
      command: {
        async perform(request) {
          if (request.operation === "updateMetadata") {
            return undefined;
          }
          throw new Error(`Unknown command operation ${JSON.stringify(request.operation)}`);
        },
      },
      application: {
        async perform(request) {
          if (request.operation === "list") {
            return JSON.stringify([
              {
                name: "Raycast",
                localizedName: "Raycast",
                path: "/Applications/Raycast.app",
                bundleId: "com.raycast.macos",
              },
              {
                name: "Terminal",
                localizedName: "Terminal",
                path: "/System/Applications/Utilities/Terminal.app",
                bundleId: "com.apple.Terminal",
              },
            ]);
          }
          if (request.operation === "frontmost") {
            return JSON.stringify({
              name: "Finder",
              localizedName: "Finder",
              path: "/System/Library/CoreServices/Finder.app",
              bundleId: "com.apple.finder",
            });
          }
          throw new Error(`Unknown application operation ${JSON.stringify(request.operation)}`);
        },
      },
      finder: {
        async perform(request) {
          if (request.operation === "selectedItems") {
            return JSON.stringify([{ path: "/tmp/example.txt" }, { path: "/tmp/second-example.txt" }]);
          }
          if (request.operation === "show") {
            return undefined;
          }
          throw new Error(`Unknown Finder operation ${JSON.stringify(request.operation)}`);
        },
      },
      oauth: {
        async perform(request) {
          if (request.operation === "authorizationRequest") {
            return JSON.stringify({
              clientId: request.arguments.clientId,
              codeChallenge: "probe-code-challenge",
              codeVerifier: "probe-code-verifier",
              state: "probe-state",
              redirectURI: "https://raycast.com/redirect?packageName=probe",
            });
          }
          if (request.operation === "authorize") {
            return JSON.stringify({ authorizationCode: "probe-authorization-code" });
          }
          if (
            request.operation === "getTokens" ||
            request.operation === "removeTokens" ||
            request.operation === "setTokens"
          ) {
            return undefined;
          }
          throw new Error(`Unknown OAuth operation ${JSON.stringify(request.operation)}`);
        },
      },
      preferences: {
        async perform(request) {
          if (request.operation === "openCommand") {
            return undefined;
          }
          throw new Error(`Unknown preferences operation ${JSON.stringify(request.operation)}`);
        },
      },
      selection: {
        async perform(request) {
          if (request.operation === "read") {
            return "selected from matrix";
          }
          throw new Error(`Unknown selection operation ${JSON.stringify(request.operation)}`);
        },
      },
    },
  });
  const core = new BlastCore({ catalog, extensionHost: host });
  return { core, broker };
}

async function waitFor(predicate, description, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for ${description}`);
}

for (const expectation of expectations) {
  test(`matrix: ${expectation.id} (${expectation.outcome})`, async () => {
    const { core, broker } = createCore();
    const buffer = new SceneStateBuffer();
    const transactions = [];

    const session = await core.runCommand({
      extensionId: expectation.extensionId,
      commandName: expectation.commandName,
    });
    const relay = relaySessionTraffic(session, {
      sceneSink: {
        publish(payload) {
          transactions.push(payload);
          buffer.apply(payload);
        },
      },
      capabilityBroker: broker,
    });

    if (expectation.outcome === "renders") {
      await waitFor(
        () =>
          buffer.rootId !== undefined &&
          (expectation.readyNavigationTitle === undefined ||
            buffer.get(buffer.rootId).props.navigationTitle === expectation.readyNavigationTitle),
        `${expectation.id} scene`,
      );
      assert.equal(buffer.get(buffer.rootId).type, expectation.rootType);
      if (expectation.minItems > 0) {
        assert.equal(buffer.childrenOf(buffer.rootId).length >= expectation.minItems, true);
      }
      await core.stopCommand(
        { extensionId: expectation.extensionId, commandName: expectation.commandName },
        "matrix complete",
      );
      await relay.done;
    } else {
      let exit;
      try {
        exit = await session.process.completion;
      } catch (error) {
        exit = { code: "rejected", error };
      }
      assert.notEqual(exit.code, 0);
      assert.equal(transactions.length, 0);
      await relay.done.catch(() => {});
    }

    await core.close();
  });
}

test("matrix form fixture round-trips field values through a submit action", async () => {
  const { core } = createCore();
  const buffer = new SceneStateBuffer();
  const session = await core.runCommand({ extensionId: "form-submission", commandName: "index" });
  const relay = relaySessionTraffic(session, {
    sceneSink: {
      publish(payload) {
        buffer.apply(payload);
      },
    },
  });

  await waitFor(() => buffer.rootId !== undefined, "the form fixture scene");
  const root = buffer.get(buffer.rootId);
  const name = root.children.find((child) => child.type === "form-text-field");
  const due = root.children.find((child) => child.type === "form-date-picker");
  const tags = root.children.find((child) => child.type === "form-tag-picker");
  const files = root.children.find((child) => child.type === "form-file-picker");
  const actions = root.children.find((child) => child.type === "action-group");
  const submit = actions.children[0].children[0];

  await relay.sendSceneEvent(name.props.onChange, { name: "Grace" });
  await relay.sendSceneEvent(due.props.onChange, { due: "2026-09-01T12:30:00.000Z" });
  await relay.sendSceneEvent(tags.props.onChange, { tags: ["docs", "v2"] });
  await relay.sendSceneEvent(files.props.onChange, { files: ["/tmp/example.txt"] });
  await relay.sendSceneEvent(submit.props.onAction, {
    name: "Grace",
    enabled: false,
    role: "user",
    due: "2026-09-01T12:30:00.000Z",
    tags: ["docs", "v2"],
    files: ["/tmp/example.txt"],
  });
  await waitFor(
    () => buffer.get(buffer.rootId).children.some((child) => child.type === "form-description"),
    "the submitted form description",
  );

  const description = buffer.get(buffer.rootId).children.find((child) => child.type === "form-description");
  assert.deepEqual(description.props, {
    title: "Submitted",
    text: "Grace|false|user|2026-09-01|docs,v2|/tmp/example.txt",
  });

  await core.stopCommand({ extensionId: "form-submission", commandName: "index" }, "form matrix complete");
  await relay.done;
  await core.close();
});
