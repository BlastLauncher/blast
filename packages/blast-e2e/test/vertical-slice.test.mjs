import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { CapabilityBroker, createGrantListPolicy, createInMemoryLocalStorageProvider } from "@blastlauncher/capability";
import { BlastCore, relaySessionTraffic } from "@blastlauncher/core";
import { FilesystemExtensionCatalog } from "@blastlauncher/core-node";
import { ExtensionHost } from "@blastlauncher/extension-host";
import { NodeExtensionProcessLauncher } from "@blastlauncher/extension-host-node";
import { SceneStateBuffer } from "@blastlauncher/scene";

const catalogRoot = fileURLToPath(new URL("./fixtures/catalog", import.meta.url));
const bootstrapPath = fileURLToPath(new URL("./fixtures/bootstrap.mjs", import.meta.url));

const sceneIdentity = { extensionId: "e2e.scene", commandName: "index" };
const crashIdentity = { extensionId: "e2e.crash", commandName: "index" };
const compatIdentity = { extensionId: "e2e.compat", commandName: "index" };
const tsxIdentity = { extensionId: "e2e.tsx", commandName: "index" };
const launchBoundariesIdentity = { extensionId: "e2e.launch-boundaries", commandName: "index" };
const desktopDiscoveryIdentity = { extensionId: "e2e.desktop-discovery", commandName: "index" };
const finderBoundariesIdentity = { extensionId: "e2e.finder-boundaries", commandName: "index" };
const runtimeBoundariesIdentity = { extensionId: "e2e.runtime-boundaries", commandName: "index" };
const hostBoundariesIdentity = { extensionId: "e2e.host-boundaries", commandName: "index" };
const coverageNextIdentity = { extensionId: "e2e.coverage-next", commandName: "index" };
const coverageFollowupIdentity = { extensionId: "e2e.coverage-followup", commandName: "index" };

function createCore() {
  const catalog = new FilesystemExtensionCatalog({ root: catalogRoot });
  const launcher = new NodeExtensionProcessLauncher({ bootstrapPath, environment: process.env });
  let hostMessageId = 0;
  let sessionId = 0;
  const host = new ExtensionHost({
    launcher,
    implementation: { name: "e2e-host", version: "0.0.0" },
    createMessageId: () => `host-${++hostMessageId}`,
    createSessionId: () => `session-${++sessionId}`,
  });
  const clipboardWrites = [];
  const boundaryRequests = [];
  const localStorageProvider = createInMemoryLocalStorageProvider();
  const broker = new CapabilityBroker({
    policy: createGrantListPolicy([
      { extensionId: "e2e.scene", capability: "clipboard", operation: "write" },
      { extensionId: "e2e.compat", capability: "clipboard", operation: "write" },
      { extensionId: "e2e.tsx", capability: "clipboard", operation: "write" },
      { extensionId: "e2e.launch-boundaries", capability: "window", operation: "close" },
      { extensionId: "e2e.launch-boundaries", capability: "navigation", operation: "popToRoot" },
      { extensionId: "e2e.launch-boundaries", capability: "preferences", operation: "openExtension" },
      { extensionId: "e2e.launch-boundaries", capability: "command", operation: "launch" },
      { extensionId: "e2e.desktop-discovery", capability: "selection", operation: "read" },
      { extensionId: "e2e.desktop-discovery", capability: "application", operation: "list" },
      { extensionId: "e2e.desktop-discovery", capability: "preferences", operation: "openCommand" },
      { extensionId: "e2e.finder-boundaries", capability: "finder", operation: "selectedItems" },
      { extensionId: "e2e.finder-boundaries", capability: "application", operation: "frontmost" },
      { extensionId: "e2e.finder-boundaries", capability: "finder", operation: "show" },
      { extensionId: "e2e.runtime-boundaries", capability: "ai", operation: "ask" },
      { extensionId: "e2e.runtime-boundaries", capability: "command", operation: "updateMetadata" },
      { extensionId: "e2e.runtime-boundaries", capability: "oauth", operation: "getTokens" },
      { extensionId: "e2e.runtime-boundaries", capability: "oauth", operation: "authorizationRequest" },
      { extensionId: "e2e.runtime-boundaries", capability: "oauth", operation: "authorize" },
      { extensionId: "e2e.runtime-boundaries", capability: "oauth", operation: "setTokens" },
      { extensionId: "e2e.runtime-boundaries", capability: "oauth", operation: "removeTokens" },
      { extensionId: "e2e.host-boundaries", capability: "browser-extension", operation: "getTabs" },
      { extensionId: "e2e.host-boundaries", capability: "browser-extension", operation: "getContent" },
      { extensionId: "e2e.host-boundaries", capability: "navigation", operation: "clearSearchBar" },
      { extensionId: "e2e.host-boundaries", capability: "filesystem", operation: "trash" },
      { extensionId: "e2e.coverage-next", capability: "application", operation: "default" },
      { extensionId: "e2e.coverage-next", capability: "telemetry", operation: "captureException" },
      { extensionId: "e2e.coverage-next", capability: "open", operation: "open" },
      { extensionId: "e2e.coverage-next", capability: "clipboard", operation: "write" },
      { extensionId: "e2e.coverage-followup", capability: "local-storage", operation: "get" },
      { extensionId: "e2e.coverage-followup", capability: "local-storage", operation: "set" },
    ]),
    providers: {
      clipboard: {
        async perform(request) {
          clipboardWrites.push(request);
          return null;
        },
      },
      window: {
        async perform(request) {
          boundaryRequests.push(request);
          return undefined;
        },
      },
      navigation: {
        async perform(request) {
          boundaryRequests.push(request);
          return undefined;
        },
      },
      "local-storage": {
        async perform(request) {
          boundaryRequests.push(request);
          return localStorageProvider.perform(request);
        },
      },
      preferences: {
        async perform(request) {
          boundaryRequests.push(request);
          if (request.operation === "openExtension" || request.operation === "openCommand") {
            return undefined;
          }
          throw new Error(`Unknown preferences operation ${JSON.stringify(request.operation)}`);
        },
      },
      selection: {
        async perform(request) {
          boundaryRequests.push(request);
          if (request.operation === "read") {
            return "selected from fixture";
          }
          throw new Error(`Unknown selection operation ${JSON.stringify(request.operation)}`);
        },
      },
      application: {
        async perform(request) {
          boundaryRequests.push(request);
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
          boundaryRequests.push(request);
          if (request.operation === "selectedItems") {
            return JSON.stringify([{ path: "/tmp/example.txt" }, { path: "/tmp/second-example.txt" }]);
          }
          if (request.operation === "show") {
            return undefined;
          }
          throw new Error(`Unknown Finder operation ${JSON.stringify(request.operation)}`);
        },
      },
      "browser-extension": {
        async perform(request) {
          boundaryRequests.push(request);
          if (request.operation === "getTabs") {
            return JSON.stringify([{ id: 1, url: "https://example.com", title: "Example", active: true }]);
          }
          if (request.operation === "getContent") {
            return "Fixture browser content";
          }
          throw new Error(`Unknown browser operation ${JSON.stringify(request.operation)}`);
        },
      },
      filesystem: {
        async perform(request) {
          boundaryRequests.push(request);
          if (request.operation === "trash") {
            return undefined;
          }
          throw new Error(`Unknown filesystem operation ${JSON.stringify(request.operation)}`);
        },
      },
      open: {
        async perform(request) {
          boundaryRequests.push(request);
          if (request.operation === "open") {
            return undefined;
          }
          throw new Error(`Unknown open operation ${JSON.stringify(request.operation)}`);
        },
      },
      command: {
        async perform(request) {
          boundaryRequests.push(request);
          return undefined;
        },
      },
      ai: {
        async perform(request) {
          boundaryRequests.push(request);
          if (request.operation === "ask") {
            return "fixture answer";
          }
          throw new Error(`Unknown AI operation ${JSON.stringify(request.operation)}`);
        },
      },
      oauth: {
        async perform(request) {
          boundaryRequests.push(request);
          if (request.operation === "authorizationRequest") {
            return JSON.stringify({
              clientId: request.arguments.clientId,
              codeChallenge: "fixture-code-challenge",
              codeVerifier: "fixture-code-verifier",
              state: "fixture-state",
              redirectURI: "https://raycast.com/redirect?packageName=fixture",
            });
          }
          if (request.operation === "authorize") {
            return JSON.stringify({ authorizationCode: "fixture-authorization-code" });
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
      telemetry: {
        async perform(request) {
          boundaryRequests.push(request);
          if (request.operation === "captureException") {
            return undefined;
          }
          throw new Error(`Unknown telemetry operation ${JSON.stringify(request.operation)}`);
        },
      },
    },
  });
  const core = new BlastCore({ catalog, extensionHost: host });
  return { core, broker, clipboardWrites, boundaryRequests };
}

function createSceneSink(buffer, transactions) {
  return {
    publish(payload) {
      transactions.push(payload);
      buffer.apply(payload);
    },
  };
}

async function waitFor(predicate, description, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${description}`);
}

test("runs the vertical slice: manifest, launch, scene, action, and brokered clipboard", async () => {
  const { core, broker, clipboardWrites } = createCore();
  const buffer = new SceneStateBuffer();
  const transactions = [];

  const session = await core.runCommand(sceneIdentity);
  assert.equal(session.descriptor.extensionId, "e2e.scene");
  assert.match(session.descriptor.entrypoint, /scene-extension\/src\/index\.mjs$/);
  assert.equal(session.protocol.remotePeer.implementation.name, "e2e-runtime");

  const relay = relaySessionTraffic(session, {
    sceneSink: createSceneSink(buffer, transactions),
    capabilityBroker: broker,
  });

  await waitFor(() => buffer.has("action-1"), "the fixture list snapshot");
  assert.deepEqual(buffer.toJSON(), {
    id: "root",
    type: "list",
    props: { navigationTitle: "E2E" },
    children: [
      {
        id: "item-1",
        type: "list-item",
        props: { title: "Hello" },
        children: [
          { id: "action-1", type: "action", props: { title: "Run", onAction: "event-action-1" }, children: [] },
        ],
      },
    ],
  });

  const action = buffer.childrenOf("root")[0].children.find((child) => child.type === "action");
  await relay.sendSceneEvent(action.props.onAction);

  await waitFor(() => buffer.get("item-1")?.props.subtitle === "succeeded:denied", "the action update");
  assert.equal(buffer.get("item-1").props.title, "Ran:event-action-1");
  assert.deepEqual(
    transactions.map((payload) => payload.transactionId),
    ["e2e-snapshot", "e2e-update"],
  );

  assert.equal(clipboardWrites.length, 1);
  assert.equal(clipboardWrites[0].extensionId, "e2e.scene");
  assert.equal(clipboardWrites[0].commandName, "index");
  assert.equal(clipboardWrites[0].capability, "clipboard");
  assert.equal(clipboardWrites[0].operation, "write");
  assert.deepEqual(clipboardWrites[0].arguments, { text: "from-e2e" });

  await core.stopCommand(sceneIdentity, "slice complete");
  await relay.done;
  await core.close();
  assert.equal(core.state, "closed");
  assert.equal(core.activeExtensions.length, 0);
});

test("survives a deliberate runtime crash while the core keeps serving", async () => {
  const { core, broker } = createCore();
  const events = [];
  const collector = (async () => {
    for await (const event of core.extensionEvents) {
      events.push(event);
    }
  })();

  const session = await core.runCommand(crashIdentity);
  const relay = relaySessionTraffic(session, { sceneSink: createSceneSink(new SceneStateBuffer(), []) });

  await waitFor(
    () => events.some((event) => event.type === "extension.process-exited" && event.exit.code === 43),
    "the deliberate crash exit code",
  );
  await waitFor(() => core.activeExtensions.length === 0, "the crashed session to be removed");
  await relay.done;

  const started = events.filter((event) => event.type === "extension.started");
  assert.equal(started.length, 1);

  const nextSession = await core.runCommand(sceneIdentity);
  assert.equal(nextSession.descriptor.extensionId, "e2e.scene");
  const nextRelay = relaySessionTraffic(nextSession, { capabilityBroker: broker });
  await core.stopCommand(sceneIdentity, "cleanup after crash");
  await nextRelay.done;

  await core.close();
  assert.equal(core.state, "closed");
  await collector;
});

test("runs a Raycast-style compat extension with brokered clipboard end to end", async () => {
  const { core, broker, clipboardWrites } = createCore();
  const buffer = new SceneStateBuffer();
  const transactions = [];

  const session = await core.runCommand(compatIdentity);
  assert.equal(session.protocol.remotePeer.implementation.name, "e2e-runtime");
  const relay = relaySessionTraffic(session, {
    sceneSink: createSceneSink(buffer, transactions),
    capabilityBroker: broker,
  });

  await waitFor(() => buffer.rootId !== undefined, "the compat list snapshot");
  const rootId = buffer.rootId;
  const itemId = buffer.childrenOf(rootId)[0].id;
  const groupId = buffer.childrenOf(itemId)[0].id;
  const [actionId, pushId] = buffer.childrenOf(groupId).map((child) => child.id);
  assert.deepEqual(buffer.toJSON(), {
    id: rootId,
    type: "list",
    props: { navigationTitle: "Compat" },
    children: [
      {
        id: itemId,
        type: "list-item",
        props: { title: "Hello", subtitle: "World", icon: "circle" },
        children: [
          {
            id: groupId,
            type: "action-group",
            props: {},
            children: [
              {
                id: actionId,
                type: "action",
                props: { title: "Copy", icon: "clipboard", onAction: "event-1" },
                children: [],
              },
              {
                id: pushId,
                type: "action",
                props: { title: "Push", onAction: "event-2" },
                children: [],
              },
            ],
          },
        ],
      },
    ],
  });

  const actions = buffer.childrenOf(groupId);
  await relay.sendSceneEvent(actions[0].props.onAction);
  await waitFor(() => clipboardWrites.length === 1, "the brokered clipboard write");

  assert.deepEqual(clipboardWrites[0].arguments, { text: "from-compat" });
  assert.equal(clipboardWrites[0].extensionId, "e2e.compat");

  await relay.sendSceneEvent(actions[1].props.onAction);
  await waitFor(
    () => buffer.rootId !== undefined && buffer.get(buffer.rootId).type === "detail",
    "the pushed detail view",
  );
  assert.deepEqual(buffer.get(buffer.rootId).props, { markdown: "pushed-view" });

  await core.stopCommand(compatIdentity, "compat slice complete");
  await relay.done;
  await core.close();
  assert.equal(core.state, "closed");
});

test("runs a bundled TSX extension with literal @raycast/api imports end to end", async () => {
  const { core, broker, clipboardWrites } = createCore();
  const buffer = new SceneStateBuffer();
  const transactions = [];

  const session = await core.runCommand(tsxIdentity);
  assert.equal(session.protocol.remotePeer.implementation.name, "e2e-runtime");
  const relay = relaySessionTraffic(session, {
    sceneSink: createSceneSink(buffer, transactions),
    capabilityBroker: broker,
  });

  await waitFor(() => buffer.rootId !== undefined, "the bundled TSX list snapshot");
  const rootId = buffer.rootId;
  const itemId = buffer.childrenOf(rootId)[0].id;
  assert.equal(buffer.get(rootId).props.navigationTitle, "Compat TSX");
  assert.deepEqual(buffer.get(itemId).props, { title: "Hello", subtitle: "World", icon: "circle" });
  const group = buffer.childrenOf(itemId)[0];
  assert.equal(group.type, "action-group");
  const action = buffer.childrenOf(group.id)[0];
  assert.deepEqual(action.props, { title: "Copy", icon: "clipboard", onAction: "event-1" });

  await relay.sendSceneEvent(action.props.onAction);
  await waitFor(() => clipboardWrites.length === 1, "the brokered clipboard write");
  assert.deepEqual(clipboardWrites[0].arguments, { text: "from-tsx" });
  assert.equal(clipboardWrites[0].extensionId, "e2e.tsx");

  await core.stopCommand(tsxIdentity, "tsx slice complete");
  await relay.done;
  await core.close();
  assert.equal(core.state, "closed");
});

test("injects launch props and relays desktop boundary helpers", async () => {
  const { core, broker, boundaryRequests } = createCore();
  const buffer = new SceneStateBuffer();
  const session = await core.runCommand(launchBoundariesIdentity);
  const relay = relaySessionTraffic(session, {
    sceneSink: createSceneSink(buffer, []),
    capabilityBroker: broker,
  });

  await waitFor(() => buffer.rootId !== undefined, "the launch-boundaries snapshot");
  await waitFor(() => boundaryRequests.length === 4, "the desktop boundary requests");

  assert.equal(buffer.get(buffer.rootId).props.navigationTitle, "userInitiated:userInitiated");
  assert.deepEqual(buffer.childrenOf(buffer.rootId)[0].props, { title: "empty", icon: "launch.png" });
  assert.deepEqual(
    boundaryRequests.map(({ capability, operation, arguments: args }) => ({ capability, operation, arguments: args })),
    [
      { capability: "window", operation: "close", arguments: { clearRootSearch: true } },
      { capability: "navigation", operation: "popToRoot", arguments: { clearSearchBar: true } },
      { capability: "preferences", operation: "openExtension", arguments: {} },
      {
        capability: "command",
        operation: "launch",
        arguments: {
          name: "details",
          type: "background",
          argumentsJSON: '{"query":"raycast"}',
          contextJSON: '{"source":"fixture"}',
          fallbackText: "open details",
        },
      },
    ],
  );

  await core.stopCommand(launchBoundariesIdentity, "launch boundary slice complete");
  await relay.done;
  await core.close();
});

test("routes browser, search, trash, toast style, and tool contracts end to end", async () => {
  const { core, broker, boundaryRequests } = createCore();
  const buffer = new SceneStateBuffer();
  const session = await core.runCommand(hostBoundariesIdentity);
  const relay = relaySessionTraffic(session, {
    sceneSink: createSceneSink(buffer, []),
    capabilityBroker: broker,
  });

  await waitFor(
    () =>
      buffer.rootId !== undefined &&
      buffer.get(buffer.rootId).props.navigationTitle === "Host:1:Fixture browser content:SUCCESS",
    "the host-boundaries snapshot",
  );
  assert.deepEqual(
    buffer.childrenOf(buffer.rootId).map(({ props }) => props.title),
    ["Host boundaries"],
  );
  assert.deepEqual(
    boundaryRequests.map(({ capability, operation, arguments: args }) => ({ capability, operation, arguments: args })),
    [
      { capability: "browser-extension", operation: "getTabs", arguments: {} },
      {
        capability: "browser-extension",
        operation: "getContent",
        arguments: { format: "text", tabId: 1 },
      },
      { capability: "navigation", operation: "clearSearchBar", arguments: { forceScrollToTop: true } },
      {
        capability: "filesystem",
        operation: "trash",
        arguments: { pathsJSON: '["/tmp/fixture-one","/tmp/fixture-two"]' },
      },
    ],
  );

  await core.stopCommand(hostBoundariesIdentity, "host boundary slice complete");
  await relay.done;
  await core.close();
});

test("runs the next measured action, telemetry, application, and preference boundaries end to end", async () => {
  const { core, broker, boundaryRequests, clipboardWrites } = createCore();
  const buffer = new SceneStateBuffer();
  const session = await core.runCommand(coverageNextIdentity);
  const relay = relaySessionTraffic(session, {
    sceneSink: createSceneSink(buffer, []),
    capabilityBroker: broker,
  });

  await waitFor(
    () => buffer.rootId !== undefined && buffer.get(buffer.rootId).props.navigationTitle === "Next:TextEdit:0",
    "the next-coverage snapshot",
  );
  await waitFor(
    () =>
      boundaryRequests.some(
        ({ capability, operation }) => capability === "telemetry" && operation === "captureException",
      ),
    "the captured fixture exception",
  );

  const item = buffer.childrenOf(buffer.rootId)[0];
  const group = item.children[0];
  assert.deepEqual(
    group.children.map(({ props }) => ({ title: props.title, icon: props.icon })),
    [
      { title: "Open in Browser", icon: "globe" },
      { title: "Open modern", icon: "globe" },
      { title: "Copy to Clipboard", icon: "clipboard" },
      { title: "Copy modern", icon: "clipboard" },
    ],
  );

  for (const action of group.children) {
    await relay.sendSceneEvent(action.props.onAction);
  }
  await waitFor(
    () =>
      boundaryRequests.filter(({ capability, operation }) => capability === "open" && operation === "open").length ===
        2 && clipboardWrites.length === 2,
    "the next action boundary events",
  );

  assert.deepEqual(
    boundaryRequests
      .filter(({ capability }) => capability === "application" || capability === "open")
      .map(({ capability, operation, arguments: args }) => ({ capability, operation, arguments: args })),
    [
      { capability: "application", operation: "default", arguments: { path: "/tmp/fixture.txt" } },
      { capability: "open", operation: "open", arguments: { target: "https://example.com/legacy" } },
      { capability: "open", operation: "open", arguments: { target: "https://example.com/modern" } },
    ],
  );
  const telemetryRequest = boundaryRequests.find(
    ({ capability, operation }) => capability === "telemetry" && operation === "captureException",
  );
  assert.notEqual(telemetryRequest, undefined);
  assert.deepEqual(JSON.parse(telemetryRequest.arguments.exceptionJSON), {
    name: "Error",
    message: "coverage fixture telemetry",
    stack: JSON.parse(telemetryRequest.arguments.exceptionJSON).stack,
  });
  assert.deepEqual(
    clipboardWrites.map(({ arguments: args }) => args),
    [{ text: "next value" }, { text: "modern value" }],
  );

  await core.stopCommand(coverageNextIdentity, "next coverage slice complete");
  await relay.done;
  await core.close();
});

test("runs legacy form, storage, image, and push aliases end to end", async () => {
  const { core, broker, boundaryRequests } = createCore();
  const buffer = new SceneStateBuffer();
  const session = await core.runCommand(coverageFollowupIdentity);
  const relay = relaySessionTraffic(session, {
    sceneSink: createSceneSink(buffer, []),
    capabilityBroker: broker,
  });

  await waitFor(
    () => buffer.rootId !== undefined && buffer.get(buffer.rootId).props.navigationTitle === "Follow-up:none:ready",
    "the legacy-alias follow-up snapshot",
  );
  const root = buffer.get(buffer.rootId);
  assert.equal(root.type, "form");
  const actions = root.children.find((child) => child.type === "action-group");
  const dropdown = root.children.find((child) => child.type === "form-dropdown");
  assert.deepEqual(
    actions.children.map(({ props }) => props.title),
    ["Submit legacy", "Push legacy"],
  );
  assert.deepEqual(dropdown.children[0].props, { value: "one", title: "One", icon: "option.png" });

  await relay.sendSceneEvent(actions.children[0].props.onAction, { choice: "one" });
  await waitFor(
    () =>
      boundaryRequests.some(
        ({ capability, operation, arguments: args }) =>
          capability === "local-storage" && operation === "set" && args.key === "submitted",
      ),
    "the legacy submit storage write",
  );

  await relay.sendSceneEvent(actions.children[1].props.onAction);
  await waitFor(() => buffer.get(buffer.rootId).type === "list", "the legacy push target");
  assert.equal(buffer.get(buffer.rootId).props.navigationTitle, "Follow-up:Pushed");
  await waitFor(
    () =>
      boundaryRequests.some(
        ({ capability, operation, arguments: args }) =>
          capability === "local-storage" && operation === "set" && args.key === "pushed",
      ),
    "the legacy push callback storage write",
  );

  const pushed = buffer.get(buffer.rootId);
  await relay.sendSceneEvent(pushed.children[0].children[0].children[0].props.onAction);
  await waitFor(() => buffer.get(buffer.rootId).type === "form", "the popped form target");
  await waitFor(
    () =>
      boundaryRequests.some(
        ({ capability, operation, arguments: args }) =>
          capability === "local-storage" && operation === "set" && args.key === "popped",
      ),
    "the legacy pop callback storage write",
  );

  assert.deepEqual(
    boundaryRequests
      .filter(({ capability }) => capability === "local-storage")
      .map(({ operation, arguments: args }) => ({ operation, arguments: args })),
    [
      { operation: "get", arguments: { key: "alias" } },
      { operation: "set", arguments: { key: "alias", value: "ready" } },
      { operation: "set", arguments: { key: "submitted", value: "yes" } },
      { operation: "set", arguments: { key: "pushed", value: "yes" } },
      { operation: "set", arguments: { key: "popped", value: "yes" } },
      { operation: "get", arguments: { key: "alias" } },
      { operation: "set", arguments: { key: "alias", value: "ready" } },
    ],
  );

  await core.stopCommand(coverageFollowupIdentity, "legacy alias slice complete");
  await relay.done;
  await core.close();
});

test("routes selected text, application discovery, and command preferences end to end", async () => {
  const { core, broker, boundaryRequests } = createCore();
  const buffer = new SceneStateBuffer();
  const session = await core.runCommand(desktopDiscoveryIdentity);
  const relay = relaySessionTraffic(session, {
    sceneSink: createSceneSink(buffer, []),
    capabilityBroker: broker,
  });

  await waitFor(
    () =>
      buffer.rootId !== undefined &&
      buffer.get(buffer.rootId).props.navigationTitle === "Discovery:selected from fixture",
    "the desktop-discovery snapshot",
  );
  assert.deepEqual(
    buffer.childrenOf(buffer.rootId).map(({ props }) => ({ title: props.title, subtitle: props.subtitle })),
    [
      { title: "Raycast", subtitle: "Raycast" },
      { title: "Terminal", subtitle: "Terminal" },
    ],
  );
  assert.deepEqual(
    boundaryRequests.map(({ capability, operation, arguments: args }) => ({ capability, operation, arguments: args })),
    [
      { capability: "selection", operation: "read", arguments: {} },
      { capability: "application", operation: "list", arguments: { path: "/tmp/example.txt" } },
      { capability: "preferences", operation: "openCommand", arguments: {} },
    ],
  );

  await core.stopCommand(desktopDiscoveryIdentity, "desktop discovery slice complete");
  await relay.done;
  await core.close();
});

test("routes Finder selection, reveal, and frontmost application end to end", async () => {
  const { core, broker, boundaryRequests } = createCore();
  const buffer = new SceneStateBuffer();
  const session = await core.runCommand(finderBoundariesIdentity);
  const relay = relaySessionTraffic(session, {
    sceneSink: createSceneSink(buffer, []),
    capabilityBroker: broker,
  });

  await waitFor(
    () => buffer.rootId !== undefined && buffer.get(buffer.rootId).props.navigationTitle === "Finder:Finder",
    "the Finder-boundaries snapshot",
  );
  assert.deepEqual(
    buffer.childrenOf(buffer.rootId).map(({ props }) => props.title),
    ["/tmp/example.txt", "/tmp/second-example.txt"],
  );
  assert.deepEqual(
    boundaryRequests.map(({ capability, operation, arguments: args }) => ({ capability, operation, arguments: args })),
    [
      { capability: "finder", operation: "selectedItems", arguments: {} },
      { capability: "application", operation: "frontmost", arguments: {} },
      { capability: "finder", operation: "show", arguments: { path: "/tmp/example.txt" } },
    ],
  );

  await core.stopCommand(finderBoundariesIdentity, "Finder boundary slice complete");
  await relay.done;
  await core.close();
});

test("routes AI, command metadata, and OAuth token lookup end to end", async () => {
  const { core, broker, boundaryRequests } = createCore();
  const buffer = new SceneStateBuffer();
  const session = await core.runCommand(runtimeBoundariesIdentity);
  const relay = relaySessionTraffic(session, {
    sceneSink: createSceneSink(buffer, []),
    capabilityBroker: broker,
  });

  await waitFor(
    () =>
      buffer.rootId !== undefined &&
      buffer.get(buffer.rootId).props.navigationTitle === "Runtime:fixture answer:signed-out",
    "the runtime-boundaries snapshot",
  );
  assert.deepEqual(
    buffer.childrenOf(buffer.rootId).map(({ props }) => props.title),
    ["AI and OAuth"],
  );
  assert.deepEqual(
    boundaryRequests.map(({ capability, operation, arguments: args }) => ({ capability, operation, arguments: args })),
    [
      {
        capability: "ai",
        operation: "ask",
        arguments: { prompt: "fixture prompt", creativity: "low", model: "openai-gpt-4o-mini" },
      },
      { capability: "command", operation: "updateMetadata", arguments: { subtitle: "AI ready" } },
      { capability: "oauth", operation: "getTokens", arguments: { providerId: "fixture-oauth" } },
    ],
  );

  await core.stopCommand(runtimeBoundariesIdentity, "runtime boundary slice complete");
  await relay.done;
  await core.close();
});
