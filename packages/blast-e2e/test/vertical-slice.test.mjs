import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { CapabilityBroker, createGrantListPolicy } from "@blastlauncher/capability";
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
  const broker = new CapabilityBroker({
    policy: createGrantListPolicy([
      { extensionId: "e2e.scene", capability: "clipboard", operation: "write" },
      { extensionId: "e2e.compat", capability: "clipboard", operation: "write" },
      { extensionId: "e2e.tsx", capability: "clipboard", operation: "write" },
      { extensionId: "e2e.launch-boundaries", capability: "window", operation: "close" },
      { extensionId: "e2e.launch-boundaries", capability: "navigation", operation: "popToRoot" },
      { extensionId: "e2e.launch-boundaries", capability: "preferences", operation: "openExtension" },
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
      preferences: {
        async perform(request) {
          boundaryRequests.push(request);
          return undefined;
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
                props: { title: "Copy", onAction: "event-1" },
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
  assert.deepEqual(action.props, { title: "Copy", onAction: "event-1" });

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
  await waitFor(() => boundaryRequests.length === 3, "the desktop boundary requests");

  assert.equal(buffer.get(buffer.rootId).props.navigationTitle, "userInitiated:userInitiated");
  assert.deepEqual(buffer.childrenOf(buffer.rootId)[0].props, { title: "empty", icon: "launch.png" });
  assert.deepEqual(
    boundaryRequests.map(({ capability, operation, arguments: args }) => ({ capability, operation, arguments: args })),
    [
      { capability: "window", operation: "close", arguments: { clearRootSearch: true } },
      { capability: "navigation", operation: "popToRoot", arguments: { clearSearchBar: true } },
      { capability: "preferences", operation: "openExtension", arguments: {} },
    ],
  );

  await core.stopCommand(launchBoundariesIdentity, "launch boundary slice complete");
  await relay.done;
  await core.close();
});
