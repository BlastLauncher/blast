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
  Form,
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

function stripToastId(payload) {
  const withoutId = { ...payload };
  delete withoutId.toastId;
  return withoutId;
}

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
    dispatch(eventId, values) {
      for (const handler of eventHandlers) {
        handler(values === undefined ? { eventId } : { eventId, values });
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

test("renders measured form controls and submits client-provided values", async () => {
  const probe = createContext();
  const submitted = [];
  const changed = [];

  const renderer = renderCommand(probe.context, () =>
    createElement(
      Form,
      {
        navigationTitle: "Profile",
        enableDrafts: true,
        actions: createElement(
          ActionPanel,
          { title: "Form actions" },
          createElement(
            ActionPanel.Section,
            { title: "Save" },
            createElement(Action.SubmitForm, {
              title: "Save profile",
              onSubmit: (values) => submitted.push(values),
            }),
          ),
        ),
      },
      createElement(Form.TextField, {
        id: "name",
        title: "Name",
        defaultValue: "Ada",
        onChange: (value) => changed.push(["name", value]),
      }),
      createElement(Form.TextArea, { id: "bio", title: "Bio", placeholder: "About you" }),
      createElement(Form.PasswordField, { id: "password", title: "Password" }),
      createElement(Form.Checkbox, { id: "enabled", label: "Enabled", defaultValue: true }),
      createElement(
        Form.Dropdown,
        { id: "role", title: "Role", defaultValue: "admin" },
        createElement(
          Form.Dropdown.Section,
          { title: "Roles" },
          createElement(Form.Dropdown.Item, { value: "admin", title: "Administrator" }),
        ),
      ),
      createElement(Form.Description, { title: "Info", text: "Profile details" }),
      createElement(Form.Separator),
    ),
  );
  await renderer.flush();

  const root = probe.transactions[0].operations[0].root;
  assert.equal(root.type, "form");
  assert.deepEqual(root.props, { navigationTitle: "Profile", enableDrafts: true });
  const actionGroup = root.children[0];
  assert.equal(actionGroup.type, "action-group");
  assert.deepEqual(actionGroup.props, { title: "Form actions" });
  assert.equal(actionGroup.children[0].type, "action-group");
  assert.deepEqual(actionGroup.children[0].props, { title: "Save" });

  const fields = new Map(root.children.slice(1).map((child) => [child.props.id, child]));
  assert.deepEqual(fields.get("name").props, {
    id: "name",
    title: "Name",
    defaultValue: "Ada",
    onChange: fields.get("name").props.onChange,
  });
  assert.deepEqual(fields.get("enabled").props, {
    id: "enabled",
    label: "Enabled",
    defaultValue: true,
    onChange: fields.get("enabled").props.onChange,
  });
  assert.equal(fields.get("role").children[0].type, "form-dropdown-section");
  assert.equal(fields.get("role").children[0].children[0].props.value, "admin");

  probe.dispatch(fields.get("name").props.onChange, { name: "Grace" });
  assert.deepEqual(changed, [["name", "Grace"]]);

  const submitEventId = actionGroup.children[0].children[0].props.onAction;
  probe.dispatch(submitEventId, {
    name: "Grace",
    bio: "Builder",
    enabled: false,
    role: "user",
    ignored: "not a form field",
  });
  assert.deepEqual(submitted, [{ name: "Grace", bio: "Builder", enabled: false, role: "user" }]);
});

test("renders richer form controls and restores native values on events and submit", async () => {
  const probe = createContext();
  const changed = [];
  const submitted = [];
  const dueDefault = new Date("2026-08-28T00:00:00.000Z");
  const dueMin = new Date("2026-08-01T00:00:00.000Z");
  const dueMax = new Date("2026-09-30T00:00:00.000Z");

  const renderer = renderCommand(probe.context, () =>
    createElement(
      Form,
      {
        actions: createElement(
          ActionPanel,
          null,
          createElement(Action.SubmitForm, { title: "Save", onSubmit: (values) => submitted.push(values) }),
        ),
      },
      createElement(Form.DatePicker, {
        id: "due",
        title: "Due",
        type: Form.DatePicker.Type.Date,
        min: dueMin,
        max: dueMax,
        defaultValue: dueDefault,
        onChange: (value) => changed.push(["due", value]),
      }),
      createElement(
        Form.TagPicker,
        {
          id: "tags",
          title: "Tags",
          placeholder: "Choose tags",
          defaultValue: ["v2"],
          onChange: (value) => changed.push(["tags", value]),
        },
        createElement(Form.TagPicker.Item, { value: "v2", title: "V2", icon: Icon.Circle }),
        createElement(Form.TagPicker.Item, { value: "docs", title: "Docs" }),
      ),
      createElement(Form.FilePicker, {
        id: "files",
        title: "Files",
        canChooseFiles: true,
        canChooseDirectories: false,
        showHiddenFiles: true,
        allowMultipleSelection: true,
        onChange: (value) => changed.push(["files", value]),
      }),
    ),
  );
  await renderer.flush();

  assert.equal(Form.DatePicker.isFullDay(dueDefault), true);
  assert.equal(Form.DatePicker.isFullDay(new Date("2026-08-28T12:30:00.000Z")), false);

  const root = probe.transactions[0].operations[0].root;
  const fields = new Map(root.children.slice(1).map((child) => [child.props.id, child]));
  assert.deepEqual(fields.get("due").props, {
    id: "due",
    title: "Due",
    type: "date",
    min: "2026-08-01T00:00:00.000Z",
    max: "2026-09-30T00:00:00.000Z",
    defaultValue: "2026-08-28T00:00:00.000Z",
    onChange: fields.get("due").props.onChange,
  });
  assert.deepEqual(fields.get("tags").props, {
    id: "tags",
    title: "Tags",
    placeholder: "Choose tags",
    defaultValue: ["v2"],
    onChange: fields.get("tags").props.onChange,
  });
  assert.deepEqual(
    fields.get("tags").children.map((child) => child.props),
    [
      { value: "v2", title: "V2", icon: "circle" },
      { value: "docs", title: "Docs" },
    ],
  );
  assert.deepEqual(fields.get("files").props, {
    id: "files",
    title: "Files",
    defaultValue: [],
    onChange: fields.get("files").props.onChange,
    canChooseFiles: true,
    canChooseDirectories: false,
    showHiddenFiles: true,
    allowMultipleSelection: true,
  });

  probe.dispatch(fields.get("due").props.onChange, { due: "2026-09-01T12:30:00.000Z" });
  probe.dispatch(fields.get("tags").props.onChange, { tags: ["docs", "v2"] });
  probe.dispatch(fields.get("files").props.onChange, { files: ["/tmp/example.txt"] });
  probe.dispatch(fields.get("due").props.onChange, { due: null });
  assert.equal(changed[0][0], "due");
  assert.equal(changed[0][1] instanceof Date, true);
  assert.equal(changed[0][1].toISOString(), "2026-09-01T12:30:00.000Z");
  assert.deepEqual(changed.slice(1, 3), [
    ["tags", ["docs", "v2"]],
    ["files", ["/tmp/example.txt"]],
  ]);
  assert.deepEqual(changed[3], ["due", null]);
  assert.throws(
    () => probe.dispatch(fields.get("due").props.onChange, { due: "not-a-date" }),
    (error) => error instanceof CompatibilityError && /Form.DatePicker/.test(error.message),
  );

  const submitEventId = root.children[0].children[0].props.onAction;
  probe.dispatch(submitEventId, {
    due: "2026-09-01T12:30:00.000Z",
    tags: ["docs", "v2"],
    files: ["/tmp/example.txt"],
  });
  assert.equal(submitted.length, 1);
  assert.equal(submitted[0].due instanceof Date, true);
  assert.equal(submitted[0].due.toISOString(), "2026-09-01T12:30:00.000Z");
  assert.deepEqual(submitted[0].tags, ["docs", "v2"]);
  assert.deepEqual(submitted[0].files, ["/tmp/example.txt"]);
});

test("rejects form submit values with a mismatched field type", async () => {
  const probe = createContext();
  const renderer = renderCommand(probe.context, () =>
    createElement(
      Form,
      {
        actions: createElement(ActionPanel, null, createElement(Action.SubmitForm, { title: "Save" })),
      },
      createElement(Form.TextField, { id: "name", defaultValue: "Ada" }),
    ),
  );
  await renderer.flush();

  const root = probe.transactions[0].operations[0].root;
  const submitEventId = root.children[0].children[0].props.onAction;
  assert.throws(
    () => probe.dispatch(submitEventId, { name: false }),
    (error) => error instanceof CompatibilityError && /wrong type/.test(error.message),
  );
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

  context.test("unsupported Form controls", () => {
    assert.throws(
      () =>
        renderCommand(probe.context, () =>
          createElement(Form, null, createElement(Form.TextField, { id: "when", title: "When", onFocus: () => {} })),
        ),
      (error) => error instanceof CompatibilityError && /Form.TextField onFocus/.test(error.message),
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
  toast.style = Toast.Style.Animated;
  await new Promise((resolve) => setTimeout(resolve, 5));
  await toast.hide();
  await toast.hide();

  assert.deepEqual(probe.toasts.map(stripToastId), [
    { operation: "show", title: "Saved", message: "All done", style: "success" },
    { operation: "update", title: "Saved", message: "All done", style: "success" },
    { operation: "update", title: "Saved", message: "All done", style: "animated" },
    { operation: "hide" },
  ]);
  assert.equal(typeof probe.toasts[0].toastId, "string");
  assert.equal(new Set(probe.toasts.map(({ toastId }) => toastId)).size, 1);
  assert.equal(toast.title, "Saved");
  assert.equal(toast.message, "All done");
  assert.equal(toast.style, "animated");
});

test("supports the legacy toast overload and animated style", async () => {
  const probe = createContext();
  configureRaycastCompat(probe.context);

  await showToast(Toast.Style.Failure, "Failed", "Try again");

  assert.deepEqual(probe.toasts.map(stripToastId), [
    { operation: "show", title: "Failed", message: "Try again", style: "failure" },
  ]);
});

test("routes toast actions and releases them on hide", async () => {
  const probe = createContext();
  const calls = [];
  renderCommand(probe.context, () => createElement(List, null));

  const toast = await showToast({
    title: "Ready",
    primaryAction: {
      title: "Retry",
      onAction: (receivedToast) => calls.push(receivedToast),
    },
  });
  const eventId = probe.toasts[0].primaryAction.eventId;
  probe.dispatch(eventId);
  assert.deepEqual(calls, [toast]);

  await toast.hide();
  assert.throws(
    () => probe.dispatch(eventId),
    (error) => error instanceof Error && /No scene callback/.test(error.message),
  );
});

test("rejects toast action shortcuts as unmeasured surface", () => {
  const probe = createContext();
  configureRaycastCompat(probe.context);

  assert.throws(
    () =>
      showToast({
        title: "Ready",
        primaryAction: {
          title: "Retry",
          shortcut: { modifiers: ["cmd"], key: "r" },
          onAction,
        },
      }),
    (error) => error instanceof CompatibilityError && /Toast.primaryAction shortcut/.test(error.message),
  );
});

test("updates mutable toast fields while shown", async () => {
  const probe = createContext();
  configureRaycastCompat(probe.context);

  const toast = await showToast({ title: "Working" });
  toast.title = "Done";
  toast.message = "Finished";
  await new Promise((resolve) => setTimeout(resolve, 5));

  assert.deepEqual(probe.toasts.map(stripToastId), [
    { operation: "show", title: "Working", style: "neutral" },
    { operation: "update", title: "Done", style: "neutral" },
    { operation: "update", title: "Done", message: "Finished", style: "neutral" },
  ]);
  await toast.hide();
});

test("shows string toasts with neutral style", async () => {
  const probe = createContext();
  configureRaycastCompat(probe.context);

  await showToast("Working...");
  const constructed = new Toast({ title: "From constructor", style: "weird" });
  await constructed.show();

  assert.deepEqual(probe.toasts.map(stripToastId), [
    { operation: "show", title: "Working...", style: "neutral" },
    { operation: "show", title: "From constructor", style: "neutral" },
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
