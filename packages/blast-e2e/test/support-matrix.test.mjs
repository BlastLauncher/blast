import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { CapabilityBroker, createGrantListPolicy, createInMemoryLocalStorageProvider } from "@blastlauncher/capability";
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
    ...(expectation.apis?.some(
      (api) => api === "Clipboard" || api === "CopyToClipboardAction" || api === "copyTextToClipboard",
    )
      ? [{ extensionId: expectation.extensionId, capability: "clipboard", operation: "write" }]
      : []),
    ...(expectation.apis?.some((api) => api === "PasteAction" || api === "pasteText")
      ? [{ extensionId: expectation.extensionId, capability: "clipboard", operation: "paste" }]
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
    ...(expectation.apis?.includes("getDefaultApplication")
      ? [{ extensionId: expectation.extensionId, capability: "application", operation: "default" }]
      : []),
    ...(expectation.apis?.includes("getLocalStorageItem")
      ? [{ extensionId: expectation.extensionId, capability: "local-storage", operation: "get" }]
      : []),
    ...(expectation.apis?.includes("setLocalStorageItem")
      ? [{ extensionId: expectation.extensionId, capability: "local-storage", operation: "set" }]
      : []),
    ...(expectation.apis?.includes("removeLocalStorageItem")
      ? [{ extensionId: expectation.extensionId, capability: "local-storage", operation: "remove" }]
      : []),
    ...(expectation.apis?.includes("clearLocalStorage")
      ? [{ extensionId: expectation.extensionId, capability: "local-storage", operation: "clear" }]
      : []),
    ...(expectation.apis?.includes("allLocalStorageItems")
      ? [{ extensionId: expectation.extensionId, capability: "local-storage", operation: "getAll" }]
      : []),
    ...(expectation.apis?.includes("AI")
      ? [{ extensionId: expectation.extensionId, capability: "ai", operation: "ask" }]
      : []),
    ...(expectation.apis?.includes("BrowserExtension")
      ? [
          { extensionId: expectation.extensionId, capability: "browser-extension", operation: "getTabs" },
          { extensionId: expectation.extensionId, capability: "browser-extension", operation: "getContent" },
        ]
      : []),
    ...(expectation.apis?.includes("clearSearchBar")
      ? [{ extensionId: expectation.extensionId, capability: "navigation", operation: "clearSearchBar" }]
      : []),
    ...(expectation.apis?.includes("trash")
      ? [{ extensionId: expectation.extensionId, capability: "filesystem", operation: "trash" }]
      : []),
    ...(expectation.apis?.some(
      (api) => api === "OpenInBrowserAction" || api === "OpenAction" || api === "OpenWithAction",
    )
      ? [{ extensionId: expectation.extensionId, capability: "open", operation: "open" }]
      : []),
    ...(expectation.apis?.includes("captureException")
      ? [{ extensionId: expectation.extensionId, capability: "telemetry", operation: "captureException" }]
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
    ...(expectation.apis?.includes("WindowManagement")
      ? [
          { extensionId: expectation.extensionId, capability: "window-management", operation: "getActiveWindow" },
          {
            extensionId: expectation.extensionId,
            capability: "window-management",
            operation: "getWindowsOnActiveDesktop",
          },
          { extensionId: expectation.extensionId, capability: "window-management", operation: "getDesktops" },
          { extensionId: expectation.extensionId, capability: "window-management", operation: "setWindowBounds" },
        ]
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
      "browser-extension": {
        async perform(request) {
          if (request.operation === "getTabs") {
            return JSON.stringify([{ id: 1, url: "https://example.com", title: "Example", active: true }]);
          }
          if (request.operation === "getContent") {
            return "Fixture browser content";
          }
          throw new Error(`Unknown browser-extension operation ${JSON.stringify(request.operation)}`);
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
          if (request.operation === "default") {
            return JSON.stringify({
              name: "TextEdit",
              localizedName: "TextEdit",
              path: "/System/Applications/TextEdit.app",
              bundleId: "com.apple.TextEdit",
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
      filesystem: {
        async perform(request) {
          if (request.operation === "trash") {
            return undefined;
          }
          throw new Error(`Unknown filesystem operation ${JSON.stringify(request.operation)}`);
        },
      },
      open: {
        async perform(request) {
          if (request.operation === "open") {
            return undefined;
          }
          throw new Error(`Unknown open operation ${JSON.stringify(request.operation)}`);
        },
      },
      navigation: {
        async perform(request) {
          if (request.operation === "clearSearchBar") {
            return undefined;
          }
          throw new Error(`Unknown navigation operation ${JSON.stringify(request.operation)}`);
        },
      },
      "local-storage": createInMemoryLocalStorageProvider(),
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
      telemetry: {
        async perform(request) {
          if (request.operation === "captureException") {
            return undefined;
          }
          throw new Error(`Unknown telemetry operation ${JSON.stringify(request.operation)}`);
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
      "window-management": {
        async perform(request) {
          if (request.operation === "getActiveWindow") {
            return JSON.stringify(createMatrixWindow(true));
          }
          if (request.operation === "getWindowsOnActiveDesktop") {
            return JSON.stringify([createMatrixWindow(true), createMatrixWindow(false)]);
          }
          if (request.operation === "getDesktops") {
            return JSON.stringify([
              {
                size: { width: 1920, height: 1080 },
                id: "desktop-1",
                screenId: "screen-1",
                active: true,
                type: "User",
              },
            ]);
          }
          if (request.operation === "setWindowBounds") {
            return undefined;
          }
          throw new Error(`Unknown window-management operation ${JSON.stringify(request.operation)}`);
        },
      },
    },
  });
  const core = new BlastCore({ catalog, extensionHost: host });
  return { core, broker };
}

function createMatrixWindow(active) {
  return {
    id: active ? "window-1" : "window-2",
    application: {
      name: active ? "Terminal" : "Raycast",
      localizedName: active ? "Terminal" : "Raycast",
      path: active ? "/System/Applications/Utilities/Terminal.app" : "/Applications/Raycast.app",
      bundleId: active ? "com.apple.Terminal" : "com.raycast.macos",
    },
    bounds: {
      position: { x: active ? 0 : 960, y: 0 },
      size: { width: 960, height: 1080 },
    },
    desktopId: "desktop-1",
    fullScreenSettable: true,
    resizable: true,
    positionable: true,
    active,
  };
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
