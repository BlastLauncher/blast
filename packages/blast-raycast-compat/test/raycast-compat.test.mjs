import assert from "node:assert/strict";
import test from "node:test";

import { createInMemoryLocalStorageProvider } from "@blastlauncher/capability";
import {
  Action,
  ActionPanel,
  Clipboard,
  Color,
  CompatibilityError,
  Detail,
  Icon,
  List,
  LocalStorage,
  Toast,
  configureRaycastCompat,
  environment,
  getPreferenceValues,
  renderCommand,
  showToast,
} from "../dist/index.js";
import { createElement } from "react";

function onAction() {}

function createContext({ grantClipboard = true, storageProvider = null } = {}) {
  const transactions = [];
  const capabilityRequests = [];
  const eventHandlers = [];
  const toasts = [];
  return {
    transactions,
    capabilityRequests,
    toasts,
    grantClipboard,
    context: {
      descriptor: {
        extensionId: "fixture.extension",
        commandName: "index",
        preferences: { token: "secret", enabled: true },
      },
      platform: "linux",
      publish: (transaction) => {
        transactions.push(transaction);
        return Promise.resolve();
      },
      onEvent: (handler) => {
        eventHandlers.push(handler);
      },
      showToast: async (payload) => {
        toasts.push(payload);
      },
      requestCapability: (request) => {
        capabilityRequests.push(request);
        const granted = grantClipboard || request.capability !== "clipboard";
        if (!granted) {
          return Promise.resolve({ outcome: "denied", code: "capability_denied" });
        }
        if (storageProvider !== null && request.capability === "local-storage") {
          return storageProvider
            .perform({
              requestId: "test",
              extensionId: "fixture.extension",
              commandName: "index",
              capability: request.capability,
              operation: request.operation,
              arguments: request.arguments ?? {},
            })
            .then((value) => (value === undefined ? { outcome: "succeeded" } : { outcome: "succeeded", value }));
        }
        return Promise.resolve(
          request.capability === "clipboard"
            ? { outcome: "succeeded", value: "clipboard-text" }
            : { outcome: "succeeded" },
        );
      },
    },
    dispatch(eventId) {
      for (const handler of eventHandlers) {
        handler({ eventId });
      }
    },
  };
}

test("renders a Raycast-style list through the compatibility surface", async () => {
  const probe = createContext();

  const renderer = renderCommand(probe.context, () =>
    createElement(
      List,
      { navigationTitle: "Tasks" },
      createElement(
        List.Item,
        { title: "First", subtitle: "Sub", icon: Icon.Circle },
        createElement(ActionPanel, null, createElement(Action, { title: "Run", onAction })),
      ),
      createElement(List.Item, { title: "Second" }),
    ),
  );
  await renderer.flush();

  assert.equal(probe.transactions.length, 1);
  const root = probe.transactions[0].operations[0].root;
  assert.deepEqual(root, {
    id: root.id,
    type: "list",
    props: { navigationTitle: "Tasks" },
    children: [
      {
        id: root.children[0].id,
        type: "list-item",
        props: { title: "First", subtitle: "Sub", icon: "circle" },
        children: [
          {
            id: root.children[0].children[0].id,
            type: "action-group",
            props: {},
            children: [
              {
                id: root.children[0].children[0].children[0].id,
                type: "action",
                props: {
                  title: "Run",
                  onAction: root.children[0].children[0].children[0].props.onAction,
                },
                children: [],
              },
            ],
          },
        ],
      },
      {
        id: root.children[1].id,
        type: "list-item",
        props: { title: "Second" },
        children: [],
      },
    ],
  });
});

test("routes Action callbacks through scene events", async () => {
  const probe = createContext();
  const calls = [];

  const renderer = renderCommand(probe.context, () =>
    createElement(
      List,
      null,
      createElement(
        List.Item,
        { title: "First" },
        createElement(ActionPanel, null, createElement(Action, { title: "Run", onAction: () => calls.push("run") })),
      ),
    ),
  );
  await renderer.flush();

  const eventId = probe.transactions[0].operations[0].root.children[0].children[0].children[0].props.onAction;
  probe.dispatch(eventId);
  assert.deepEqual(calls, ["run"]);
});

test("copies text through the clipboard capability broker", async () => {
  const probe = createContext();
  const copies = [];

  const renderer = renderCommand(probe.context, () =>
    createElement(
      List,
      null,
      createElement(
        List.Item,
        { title: "First" },
        createElement(
          ActionPanel,
          null,
          createElement(Action.CopyToClipboard, {
            title: "Copy",
            content: "from-compat",
            onCopy: () => copies.push("copied"),
          }),
        ),
      ),
    ),
  );
  await renderer.flush();

  const eventId = probe.transactions[0].operations[0].root.children[0].children[0].children[0].props.onAction;
  probe.dispatch(eventId);
  await new Promise((resolve) => setTimeout(resolve, 5));

  assert.deepEqual(probe.capabilityRequests, [
    { capability: "clipboard", operation: "write", arguments: { text: "from-compat" } },
  ]);
  assert.deepEqual(copies, ["copied"]);
});

test("Clipboard singletons use the configured context", async () => {
  const probe = createContext();
  configureRaycastCompat(probe.context);

  await Clipboard.copy("hello");
  const text = await Clipboard.read();

  assert.deepEqual(probe.capabilityRequests, [
    { capability: "clipboard", operation: "write", arguments: { text: "hello" } },
    { capability: "clipboard", operation: "read" },
  ]);
  assert.equal(text, "clipboard-text");
});

test("denied clipboard writes raise structured compatibility errors", async () => {
  const probe = createContext({ grantClipboard: false });
  configureRaycastCompat(probe.context);

  await assert.rejects(
    () => Clipboard.copy("hello"),
    (error) => error instanceof CompatibilityError,
  );
  assert.equal(probe.capabilityRequests.length, 1);
});

test("renders a Detail root", async () => {
  const probe = createContext();

  const renderer = renderCommand(probe.context, () =>
    createElement(Detail, { markdown: "# Notes", navigationTitle: "Notes" }),
  );
  await renderer.flush();

  const root = probe.transactions[0].operations[0].root;
  assert.equal(root.type, "detail");
  assert.deepEqual(root.props, { markdown: "# Notes", navigationTitle: "Notes" });
});

test("rejects unmeasured API surface with structured errors", (context) => {
  const probe = createContext();

  context.test("Action shortcut prop", () => {
    assert.throws(
      () =>
        renderCommand(probe.context, () =>
          createElement(
            List,
            null,
            createElement(
              List.Item,
              { title: "First" },
              createElement(
                ActionPanel,
                null,
                createElement(Action, { title: "Run", shortcut: { modifiers: ["cmd"] } }),
              ),
            ),
          ),
        ),
      (error) => error instanceof CompatibilityError && /Action shortcut/.test(error.message),
    );
  });

  context.test("non-action List.Item children", () => {
    assert.throws(
      () =>
        renderCommand(probe.context, () =>
          createElement(List, null, createElement(List.Item, { title: "First" }, createElement("div", null, "nope"))),
        ),
      (error) => error instanceof CompatibilityError && /not an action/.test(error.message),
    );
  });

  context.test("unconfigured Clipboard", async () => {
    configureRaycastCompat(undefined);
    await assert.rejects(
      () => Clipboard.copy("hello"),
      (error) => error instanceof CompatibilityError,
    );
  });
});

test("shows toasts through the configured context", async () => {
  const probe = createContext();
  configureRaycastCompat(probe.context);

  const toast = await showToast({ title: "Saved", message: "All done", style: Toast.Style.Success });
  await toast.show();
  await assert.rejects(
    () => toast.hide(),
    (error) => error instanceof CompatibilityError,
  );

  assert.deepEqual(probe.toasts, [
    { title: "Saved", message: "All done", style: "success" },
    { title: "Saved", message: "All done", style: "success" },
  ]);
  assert.equal(toast.title, "Saved");
  assert.equal(toast.message, "All done");
  assert.equal(toast.style, "success");
});

test("shows string toasts with neutral style", async () => {
  const probe = createContext();
  configureRaycastCompat(probe.context);

  await showToast("Working...");
  const constructed = new Toast({ title: "From constructor", style: "weird" });
  await constructed.show();

  assert.deepEqual(probe.toasts, [
    { title: "Working...", style: "neutral" },
    { title: "From constructor", style: "neutral" },
  ]);
});

test("returns manifest preference defaults", () => {
  const probe = createContext();
  configureRaycastCompat(probe.context);

  const preferences = getPreferenceValues();
  assert.deepEqual(preferences, { token: "secret", enabled: true });
});

test("Action.Push activation pushes the target scene root", async () => {
  const probe = createContext();

  const renderer = renderCommand(probe.context, () =>
    createElement(
      List,
      { navigationTitle: "Home" },
      createElement(
        List.Item,
        { title: "Open" },
        createElement(
          ActionPanel,
          null,
          createElement(Action.Push, { title: "Push", target: createElement(Detail, { markdown: "pushed" }) }),
        ),
      ),
    ),
  );
  await renderer.flush();
  assert.equal(probe.transactions[0].operations[0].root.type, "list");

  const eventId = probe.transactions[0].operations[0].root.children[0].children[0].children[0].props.onAction;
  probe.dispatch(eventId);
  await renderer.flush();

  const lastSnapshot = probe.transactions.filter((t) => t.operations[0].type === "snapshot").at(-1);
  assert.equal(lastSnapshot.operations[0].root.type, "detail");
  assert.deepEqual(lastSnapshot.operations[0].root.props, { markdown: "pushed" });
});

test("LocalStorage routes through the capability broker", async () => {
  const probe = createContext({ storageProvider: createInMemoryLocalStorageProvider() });
  configureRaycastCompat(probe.context);

  assert.equal(await LocalStorage.getItem("missing"), undefined);
  await LocalStorage.setItem("token", "secret");
  assert.equal(await LocalStorage.getItem("token"), "secret");
  await LocalStorage.setItem("flag", true);
  assert.equal(await LocalStorage.getItem("flag"), true);
  await LocalStorage.removeItem("token");
  assert.equal(await LocalStorage.getItem("token"), undefined);
  await LocalStorage.clear();
  assert.equal(await LocalStorage.getItem("flag"), undefined);

  assert.deepEqual(
    probe.capabilityRequests.map((request) => request.operation),
    ["get", "set", "get", "set", "get", "remove", "get", "clear", "get"],
  );
});

test("environment reports the runtime platform and command identity", () => {
  const probe = createContext();
  probe.context.platform = "darwin";
  configureRaycastCompat(probe.context);

  const info = environment();
  assert.deepEqual(info.os, ["macOS"]);
  assert.equal(info.launchType, "initial-launch");
  assert.equal(info.commandName, "index");
  assert.equal(info.extensionName, "fixture.extension");
  assert.equal(typeof info.raycastVersion, "string");
});

test("renders titled action panels, submenus, List actions, and tinted icons", async () => {
  const environment = createContext();

  const renderer = renderCommand(environment.context, () =>
    createElement(
      List,
      {
        navigationTitle: "Tasks",
        actions: createElement(
          ActionPanel,
          { title: "Global" },
          createElement(Action, { title: "Root Action", onAction: () => {} }),
        ),
      },
      createElement(
        List.Item,
        {
          title: "First",
          icon: { source: Icon.Circle, tintColor: Color.Red },
        },
        createElement(
          ActionPanel,
          { title: "Item Actions" },
          createElement(Action, { title: "Run", onAction: () => {} }),
          createElement(
            ActionPanel.Submenu,
            { title: "More" },
            createElement(Action, { title: "Extra", onAction: () => {} }),
          ),
        ),
      ),
    ),
  );
  await renderer.flush();

  const root = environment.transactions[0].operations[0].root;
  const item = root.children[0];
  assert.deepEqual(item.props, { title: "First", icon: "circle", iconTintColor: "red" });

  const itemGroup = item.children[0];
  assert.equal(itemGroup.type, "action-group");
  assert.deepEqual(itemGroup.props, { title: "Item Actions" });
  assert.equal(itemGroup.children[0].type, "action");
  const submenu = itemGroup.children[1];
  assert.equal(submenu.type, "action-group");
  assert.deepEqual(submenu.props, { title: "More" });
  assert.equal(submenu.children[0].type, "action");

  const listGroup = root.children[1];
  assert.equal(listGroup.type, "action-group");
  assert.deepEqual(listGroup.props, { title: "Global" });
  assert.equal(listGroup.children[0].type, "action");
});
