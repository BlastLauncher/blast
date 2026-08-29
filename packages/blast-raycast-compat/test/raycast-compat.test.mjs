import assert from "node:assert/strict";
import test from "node:test";

import { createInMemoryLocalStorageProvider } from "@blastlauncher/capability";
import {
  Action,
  ActionPanel,
  ActionStyle,
  Alert,
  Cache,
  Clipboard,
  Color,
  CompatibilityError,
  Detail,
  Form,
  getApplications,
  getFrontmostApplication,
  getSelectedFinderItems,
  getSelectedText,
  Grid,
  Icon,
  Image,
  Keyboard,
  LaunchType,
  List,
  LocalStorage,
  MenuBarExtra,
  PopToRootType,
  Toast,
  configureRaycastCompat,
  confirmAlert,
  closeMainWindow,
  environment,
  getPreferenceValues,
  open,
  openCommandPreferences,
  openExtensionPreferences,
  popToRoot,
  launchCommand,
  renderCommand,
  showHUD,
  showInFinder,
  showToast,
} from "../dist/index.js";
import { createElement } from "react";

function onAction() {}

function stripToastId(payload) {
  const withoutId = { ...payload };
  delete withoutId.toastId;
  return withoutId;
}

function createContext({ grantClipboard = true, storageProvider = null, capabilityValues = {} } = {}) {
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
        const capabilityKey = `${request.capability}.${request.operation}`;
        if (Object.hasOwn(capabilityValues, capabilityKey)) {
          return Promise.resolve({ outcome: "succeeded", value: capabilityValues[capabilityKey] });
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

test("renders a Grid with sections, dropdowns, content, and empty state", async () => {
  const probe = createContext();

  const renderer = renderCommand(probe.context, () =>
    createElement(
      Grid,
      {
        navigationTitle: "Gallery",
        columns: 4,
        fit: Grid.Fit.Fill,
        inset: Grid.Inset.Small,
        searchBarAccessory: createElement(
          Grid.Dropdown,
          { tooltip: "Filter", defaultValue: "all" },
          createElement(
            Grid.Dropdown.Section,
            { title: "Kinds" },
            createElement(Grid.Dropdown.Item, { value: "all", title: "All", icon: Icon.Star }),
          ),
        ),
      },
      createElement(
        Grid.Section,
        { title: "Items" },
        createElement(
          Grid.Item,
          {
            id: "one",
            content: { source: "one.png", tintColor: "red" },
            title: "One",
            subtitle: "First",
            keywords: ["primary"],
            accessory: { icon: Icon.Star, tooltip: "Favorite" },
          },
          createElement(ActionPanel, null, createElement(Action, { title: "Open" })),
        ),
      ),
      createElement(Grid.EmptyView, { title: "Empty", description: "Nothing here" }),
    ),
  );
  await renderer.flush();

  const root = probe.transactions[0].operations[0].root;
  assert.equal(root.type, "grid");
  assert.deepEqual(root.props, { navigationTitle: "Gallery", columns: 4, fit: "fill", inset: "sm" });
  assert.deepEqual(
    root.children.map((child) => child.type),
    ["grid-dropdown", "grid-section", "grid-empty-view"],
  );
  assert.deepEqual(root.children[0].props, { tooltip: "Filter", defaultValue: "all" });
  assert.deepEqual(root.children[1].children[0].props, {
    id: "one",
    content: "one.png",
    contentTintColor: "red",
    title: "One",
    subtitle: "First",
    keywords: ["primary"],
    accessoryIcon: "star",
    accessoryTooltip: "Favorite",
  });
});

test("renders MenuBarExtra roots and routes item action events", async () => {
  const probe = createContext();
  const calls = [];

  const renderer = renderCommand(probe.context, () =>
    createElement(
      MenuBarExtra,
      { title: "Blast", tooltip: "Blast menu", icon: Icon.Circle, isLoading: true },
      createElement(
        MenuBarExtra.Section,
        { title: "Actions" },
        createElement(MenuBarExtra.Item, {
          title: "Refresh",
          onAction: (event) => calls.push(event.type),
        }),
        createElement(MenuBarExtra.Submenu, { title: "More" }, createElement(MenuBarExtra.Item, { title: "Settings" })),
      ),
      createElement(MenuBarExtra.Separator),
    ),
  );
  await renderer.flush();

  const root = probe.transactions[0].operations[0].root;
  assert.equal(root.type, "menu-bar-extra");
  assert.deepEqual(root.props, { title: "Blast", tooltip: "Blast menu", icon: "circle", isLoading: true });
  assert.deepEqual(
    root.children.map((child) => child.type),
    ["menu-bar-section", "menu-bar-separator"],
  );
  const refresh = root.children[0].children[0];
  assert.equal(refresh.props.title, "Refresh");
  probe.dispatch(refresh.props.onAction);
  assert.deepEqual(calls, ["left-click"]);
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

test("renders structured shortcuts and action styles", async () => {
  const probe = createContext();

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
          createElement(Action, {
            title: "Run",
            shortcut: Keyboard.Shortcut.Common.Copy,
            style: ActionStyle.Destructive,
            autoFocus: true,
          }),
        ),
      ),
    ),
  );
  await renderer.flush();

  const action = probe.transactions[0].operations[0].root.children[0].children[0].children[0];
  assert.deepEqual(action.props.shortcut, { modifiers: ["cmd"], key: "c" });
  assert.equal(action.props.style, "destructive");
  assert.equal(action.props.autoFocus, true);
});

test("serializes platform-specific shortcuts for the active platform", async () => {
  const probe = createContext();
  probe.context.platform = "darwin";

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
          createElement(Action, {
            title: "Run",
            shortcut: {
              macOS: { modifiers: ["cmd"], key: "m" },
              Windows: { modifiers: ["ctrl"], key: "m" },
            },
          }),
        ),
      ),
    ),
  );
  await renderer.flush();

  const action = probe.transactions[0].operations[0].root.children[0].children[0].children[0];
  assert.deepEqual(action.props.shortcut, { modifiers: ["cmd"], key: "m" });
});

test("passes launch props to command components and exposes image masks", async () => {
  const probe = createContext();
  const launchProps = {
    launchType: "background",
    arguments: { query: "Blast" },
    draftValues: { query: "draft" },
    launchContext: { source: "test" },
    fallbackText: "fallback",
  };

  const renderer = renderCommand(
    probe.context,
    (props) => {
      const info = environment();
      return createElement(
        List,
        { navigationTitle: `${props.launchType}:${props.arguments.query}:${info.launchType}` },
        createElement(List.Item, {
          title: props.launchContext.source,
          icon: { source: "avatar.png", mask: Image.Mask.Circle },
        }),
      );
    },
    launchProps,
  );
  await renderer.flush();

  const root = probe.transactions[0].operations[0].root;
  assert.equal(root.props.navigationTitle, "background:Blast:background");
  assert.deepEqual(root.children[0].props, { title: "test", icon: "avatar.png" });
  assert.deepEqual(LaunchType, { UserInitiated: "userInitiated", Background: "background" });
});

test("routes HUD, open, and alert APIs through capabilities", async () => {
  const probe = createContext({ capabilityValues: { "alert.confirm": true } });
  configureRaycastCompat(probe.context);
  const calls = [];

  await showHUD("Saved", { clearRootSearch: true, popToRootType: PopToRootType.Immediate });
  await open("https://example.com", { bundleId: "com.example.Browser" });
  const confirmed = await confirmAlert({
    title: "Delete item?",
    message: "This cannot be undone.",
    icon: Icon.Trash,
    rememberUserChoice: true,
    primaryAction: {
      title: "Delete",
      style: Alert.ActionStyle.Destructive,
      onAction: () => calls.push("primary"),
    },
    dismissAction: {
      title: "Cancel",
      style: Alert.ActionStyle.Cancel,
      onAction: () => calls.push("dismiss"),
    },
  });

  assert.equal(confirmed, true);
  assert.deepEqual(calls, ["primary"]);
  assert.deepEqual(probe.capabilityRequests, [
    {
      capability: "hud",
      operation: "show",
      arguments: { title: "Saved", clearRootSearch: true, popToRootType: "immediate" },
    },
    {
      capability: "open",
      operation: "open",
      arguments: { target: "https://example.com", application: "com.example.Browser" },
    },
    {
      capability: "alert",
      operation: "confirm",
      arguments: {
        title: "Delete item?",
        message: "This cannot be undone.",
        icon: "trash",
        rememberUserChoice: true,
        primaryTitle: "Delete",
        primaryStyle: "destructive",
        dismissTitle: "Cancel",
        dismissStyle: "cancel",
      },
    },
  ]);
});

test("routes window, navigation, and extension-preference helpers through capabilities", async () => {
  const probe = createContext();
  configureRaycastCompat(probe.context);

  await closeMainWindow({ clearRootSearch: true, popToRootType: PopToRootType.Suspended });
  await popToRoot({ clearSearchBar: true });
  await openExtensionPreferences();

  assert.deepEqual(probe.capabilityRequests, [
    {
      capability: "window",
      operation: "close",
      arguments: { clearRootSearch: true, popToRootType: "suspended" },
    },
    {
      capability: "navigation",
      operation: "popToRoot",
      arguments: { clearSearchBar: true },
    },
    { capability: "preferences", operation: "openExtension" },
  ]);
});

test("routes selected text, application discovery, and command preferences through capabilities", async () => {
  const applications = [
    {
      name: "Raycast",
      localizedName: "Raycast",
      path: "/Applications/Raycast.app",
      bundleId: "com.raycast.macos",
    },
  ];
  const probe = createContext({
    capabilityValues: {
      "selection.read": "selected from test",
      "application.list": JSON.stringify(applications),
    },
  });
  configureRaycastCompat(probe.context);

  assert.equal(await getSelectedText(), "selected from test");
  assert.deepEqual(await getApplications("/tmp/example.txt"), applications);
  await openCommandPreferences();

  assert.deepEqual(probe.capabilityRequests, [
    { capability: "selection", operation: "read" },
    { capability: "application", operation: "list", arguments: { path: "/tmp/example.txt" } },
    { capability: "preferences", operation: "openCommand" },
  ]);
});

test("routes Finder selection, reveal, and frontmost application through capabilities", async () => {
  const application = {
    name: "Terminal",
    localizedName: "Terminal",
    path: "/System/Applications/Utilities/Terminal.app",
    bundleId: "com.apple.Terminal",
  };
  const items = [{ path: "/tmp/example.txt" }, { path: "/tmp/second-example.txt" }];
  const probe = createContext({
    capabilityValues: {
      "finder.selectedItems": JSON.stringify(items),
      "finder.show": undefined,
      "application.frontmost": JSON.stringify(application),
    },
  });
  configureRaycastCompat(probe.context);

  assert.deepEqual(await getSelectedFinderItems(), items);
  assert.deepEqual(await getFrontmostApplication(), application);
  await showInFinder("/tmp/example.txt");

  assert.deepEqual(probe.capabilityRequests, [
    { capability: "finder", operation: "selectedItems" },
    { capability: "application", operation: "frontmost" },
    { capability: "finder", operation: "show", arguments: { path: "/tmp/example.txt" } },
  ]);
});

test("rejects malformed application and selected-text capability responses", async () => {
  const probe = createContext({
    capabilityValues: {
      "selection.read": null,
      "application.list": JSON.stringify([{ name: "Missing path" }]),
    },
  });
  configureRaycastCompat(probe.context);

  await assert.rejects(
    () => getSelectedText(),
    (error) => error instanceof CompatibilityError,
  );
  await assert.rejects(
    () => getApplications(),
    (error) => error instanceof CompatibilityError,
  );
});

test("rejects malformed Finder and frontmost application capability responses", async () => {
  const probe = createContext({
    capabilityValues: {
      "finder.selectedItems": JSON.stringify([{ path: "" }]),
      "application.frontmost": JSON.stringify({ name: "Terminal" }),
    },
  });
  configureRaycastCompat(probe.context);

  await assert.rejects(
    () => getSelectedFinderItems(),
    (error) => error instanceof CompatibilityError,
  );
  await assert.rejects(
    () => getFrontmostApplication(),
    (error) => error instanceof CompatibilityError,
  );
});

test("routes launchCommand options through the command capability", async () => {
  const probe = createContext();
  configureRaycastCompat(probe.context);

  await launchCommand({
    ownerOrAuthorName: "blast",
    extensionName: "target",
    name: "details",
    type: LaunchType.Background,
    arguments: { query: "raycast" },
    context: { source: "test" },
    fallbackText: "open details",
  });

  assert.deepEqual(probe.capabilityRequests, [
    {
      capability: "command",
      operation: "launch",
      arguments: {
        name: "details",
        type: "background",
        ownerOrAuthorName: "blast",
        extensionName: "target",
        fallbackText: "open details",
        argumentsJSON: '{"query":"raycast"}',
        contextJSON: '{"source":"test"}',
      },
    },
  ]);
});

test("provides a session-local namespaced LRU Cache", () => {
  const probe = createContext();
  configureRaycastCompat(probe.context);
  const cache = new Cache({ namespace: "cache-test", capacity: 5 });
  cache.clear({ notifySubscribers: false });
  const events = [];
  const unsubscribe = cache.subscribe((key, data) => events.push([key, data]));

  cache.set("a", "123");
  cache.set("b", "12");
  assert.equal(cache.get("a"), "123");
  cache.set("c", "1");

  assert.equal(cache.has("a"), true);
  assert.equal(cache.has("b"), false);
  assert.equal(cache.get("c"), "1");
  assert.equal(cache.isEmpty, false);
  assert.deepEqual(events, [
    ["a", "123"],
    ["b", "12"],
    ["b", undefined],
    ["c", "1"],
  ]);

  const sameNamespace = new Cache({ namespace: "cache-test" });
  assert.equal(sameNamespace.get("a"), "123");
  assert.equal(sameNamespace.storageDirectory, "memory://blast-cache/fixture.extension/cache-test");
  assert.equal(cache.remove("a"), true);
  assert.equal(cache.remove("missing"), false);
  unsubscribe();
  cache.clear();
  assert.equal(cache.isEmpty, true);
  assert.equal(Cache.STORAGE_DIRECTORY_NAME, "cache");
  assert.equal(Cache.DEFAULT_CAPACITY, 10 * 1024 * 1024);
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

test("serializes toast action shortcuts", async () => {
  const probe = createContext();
  configureRaycastCompat(probe.context);

  await showToast({
    title: "Ready",
    primaryAction: {
      title: "Retry",
      shortcut: { modifiers: ["cmd"], key: "r" },
      onAction,
    },
  });

  assert.deepEqual(probe.toasts[0].primaryAction.shortcut, { modifiers: ["cmd"], key: "r" });
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
  assert.equal(info.launchType, "userInitiated");
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
