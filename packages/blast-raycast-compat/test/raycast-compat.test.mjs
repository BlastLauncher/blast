import assert from "node:assert/strict";
import test from "node:test";

import { createInMemoryLocalStorageProvider } from "@blastlauncher/capability";
import {
  Action,
  ActionPanelItem,
  ActionPanel,
  ActionPanelSection,
  ActionPanelSubmenu,
  ActionStyle,
  AI,
  Alert,
  AlertActionStyle,
  allLocalStorageItems,
  BrowserExtension,
  Cache,
  Clipboard,
  Color,
  CompatibilityError,
  CopyToClipboardAction,
  OpenAction,
  PasteAction,
  Detail,
  Form,
  FormCheckbox,
  FormDatePicker,
  FormDropdown,
  FormDropdownItem,
  FormDropdownSection,
  FormSeparator,
  FormTagPicker,
  FormTagPickerItem,
  FormTextArea,
  FormTextField,
  getApplications,
  getDefaultApplication,
  getFrontmostApplication,
  getSelectedFinderItems,
  getSelectedText,
  Grid,
  Icon,
  Image,
  ImageMask,
  Keyboard,
  LaunchType,
  List,
  ListSection,
  LocalStorage,
  MenuBarExtra,
  OAuth,
  PopToRootType,
  PushAction,
  SubmitFormAction,
  Toast,
  configureRaycastCompat,
  captureException,
  captureMemorySnapshot,
  clearLocalStorage,
  confirmAlert,
  closeMainWindow,
  clearSearchBar,
  copyTextToClipboard,
  environment,
  getLocalStorageItem,
  getPreferenceValues,
  open,
  OpenInBrowserAction,
  OpenWithAction,
  ShowInFinderAction,
  openCommandPreferences,
  openExtensionPreferences,
  popToRoot,
  pasteText,
  preferences,
  randomId,
  removeLocalStorageItem,
  render,
  launchCommand,
  renderCommand,
  showHUD,
  showInFinder,
  showToast,
  setLocalStorageItem,
  specialKeys,
  ToastStyle,
  TrashAction,
  trash,
  unstable_AI,
  updateCommandMetadata,
  useActionPanel,
  useId,
  useNavigation,
  useUnstableAI,
  WindowManagement,
} from "../dist/index.js";
import { Fragment, createContext as createReactContext, createElement, memo } from "react";

function onAction() {}

function PushTarget() {
  const navigation = useNavigation();
  return createElement(
    List,
    { navigationTitle: "Pushed" },
    createElement(
      List.Item,
      { title: "Pushed" },
      createElement(ActionPanel, null, createElement(Action, { title: "Pop", onAction: navigation.pop })),
    ),
  );
}

function stripToastId(payload) {
  const withoutId = { ...payload };
  delete withoutId.toastId;
  return withoutId;
}

function createContext({ grantClipboard = true, storageProvider = null, capabilityValues = {}, canAccess } = {}) {
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
      canAccess,
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

test("publishes the official deprecated component aliases", () => {
  assert.equal(ActionPanelSection, ActionPanel.Section);
  assert.equal(ActionPanelSubmenu, ActionPanel.Submenu);
  assert.equal(FormCheckbox, Form.Checkbox);
  assert.equal(FormDatePicker, Form.DatePicker);
  assert.equal(FormDropdown, Form.Dropdown);
  assert.equal(FormDropdownItem, Form.Dropdown.Item);
  assert.equal(FormDropdownSection, Form.Dropdown.Section);
  assert.equal(FormSeparator, Form.Separator);
  assert.equal(FormTagPicker, Form.TagPicker);
  assert.equal(FormTagPickerItem, Form.TagPicker.Item);
  assert.equal(FormDatePicker.Type, Form.DatePicker.Type);
  assert.equal(FormDatePicker.isFullDay, Form.DatePicker.isFullDay);
  assert.equal(FormDropdown.Item, Form.Dropdown.Item);
  assert.equal(FormDropdown.Section, Form.Dropdown.Section);
  assert.equal(FormTagPicker.Item, Form.TagPicker.Item);
  assert.equal(FormTextArea, Form.TextArea);
  assert.equal(FormTextField, Form.TextField);
  assert.equal(FormDatePicker.Date, Form.DatePicker.Type.Date);
  assert.equal(FormDatePicker.DateTime, Form.DatePicker.Type.DateTime);
  assert.equal(Form.DatePicker.Date, Form.DatePicker.Type.Date);
  assert.equal(Form.DatePicker.DateTime, Form.DatePicker.Type.DateTime);
});

test("publishes the remaining declaration-backed compatibility aliases", () => {
  assert.equal(unstable_AI, AI);
  assert.equal(typeof useId, "function");
  assert.equal(useUnstableAI(), undefined);
  assert.deepEqual(specialKeys, {
    return: "return",
    delete: "delete",
    deleteForward: "deleteForward",
    tab: "tab",
    arrowUp: "arrowUp",
    arrowDown: "arrowDown",
    arrowLeft: "arrowLeft",
    arrowRight: "arrowRight",
    pageUp: "pageUp",
    pageDown: "pageDown",
    home: "home",
    end: "end",
    space: "space",
    escape: "escape",
    enter: "enter",
    backspace: "backspace",
  });
  const actionPanel = useActionPanel();
  assert.equal(typeof actionPanel.update, "function");
  assert.throws(
    () => actionPanel.update(null),
    (error) => {
      assert.equal(error instanceof CompatibilityError, true);
      assert.equal(error.code, "unsupported_api");
      return true;
    },
  );
});

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
        props: { title: "First", subtitle: "Sub", icon: "circle-16" },
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

test("renders List empty views, search dropdowns, item metadata, and pagination", async () => {
  const probe = createContext();
  const selections = [];
  const searches = [];
  const dropdownValues = [];
  const dropdownSearches = [];
  let loadMore = 0;
  const renderer = renderCommand(probe.context, () =>
    createElement(
      List,
      {
        searchText: "initial",
        filtering: { keepSectionOrder: true },
        throttle: true,
        selectedItemId: "one",
        onSelectionChange: (id) => selections.push(id),
        onSearchTextChange: (text) => searches.push(text),
        pagination: { pageSize: 25, hasMore: true, onLoadMore: () => loadMore++ },
        searchBarAccessory: createElement(
          List.Dropdown,
          {
            id: "kind",
            tooltip: "Filter by kind",
            isLoading: true,
            filtering: false,
            onChange: (value) => dropdownValues.push(value),
            onSearchTextChange: (text) => dropdownSearches.push(text),
          },
          createElement(
            List.Dropdown.Section,
            { title: "Kinds" },
            createElement(List.Dropdown.Item, { value: "all", title: "All", icon: Icon.Folder, keywords: ["any"] }),
          ),
        ),
      },
      createElement(List.Item, {
        id: "one",
        title: "One",
        keywords: ["primary"],
        accessoryIcon: Icon.Star,
        accessoryTitle: "Favorite",
        accessories: [{ text: "Ready", icon: Icon.Checkmark, tooltip: "Status" }],
      }),
      createElement(List.EmptyView, { icon: Icon.MagnifyingGlass, title: "No results", description: "Try again" }),
    ),
  );
  await renderer.flush();

  const root = probe.transactions[0].operations[0].root;
  assert.deepEqual(root.props, {
    searchText: "initial",
    filtering: true,
    filteringKeepSectionOrder: true,
    throttle: true,
    selectedItemId: "one",
    onSelectionChange: root.props.onSelectionChange,
    onSearchTextChange: root.props.onSearchTextChange,
    paginationPageSize: 25,
    paginationHasMore: true,
    onLoadMore: root.props.onLoadMore,
  });
  assert.deepEqual(
    root.children.map((child) => child.type),
    ["list-dropdown", "list-item", "list-empty-view"],
  );
  assert.deepEqual(root.children[0].props, {
    id: "kind",
    tooltip: "Filter by kind",
    isLoading: true,
    filtering: false,
    onChange: root.children[0].props.onChange,
    onSearchTextChange: root.children[0].props.onSearchTextChange,
  });
  assert.deepEqual(root.children[0].children[0].children[0].props, {
    value: "all",
    title: "All",
    icon: "folder-16",
    keywords: ["any"],
  });
  assert.deepEqual(root.children[1].props, {
    id: "one",
    title: "One",
    keywords: ["primary"],
    accessories: '[{"text":"Ready","icon":"checkmark-16","tooltip":"Status"}]',
    accessoryIcon: "star-16",
    accessoryTitle: "Favorite",
  });
  assert.deepEqual(root.children[2].props, {
    icon: "magnifying-glass-16",
    title: "No results",
    description: "Try again",
  });

  probe.dispatch(root.props.onSelectionChange, { selectedItemId: null });
  probe.dispatch(root.props.onSearchTextChange, { searchText: "next" });
  probe.dispatch(root.children[0].props.onChange, { kind: "all" });
  probe.dispatch(root.children[0].props.onSearchTextChange, { searchText: "ki" });
  probe.dispatch(root.props.onLoadMore);
  assert.deepEqual(selections, [null]);
  assert.deepEqual(searches, ["next"]);
  assert.deepEqual(dropdownValues, ["all"]);
  assert.deepEqual(dropdownSearches, ["ki"]);
  assert.equal(loadMore, 1);
});

test("preserves zero pagination page sizes from async hooks", async () => {
  const probe = createContext();
  let loadMore = 0;
  const renderer = renderCommand(probe.context, () =>
    createElement(
      List,
      { pagination: { pageSize: 0, hasMore: false, onLoadMore: () => loadMore++ } },
      createElement(List.Item, { title: "Loading" }),
    ),
  );
  await renderer.flush();

  const root = probe.transactions[0].operations[0].root;
  assert.equal(root.props.paginationPageSize, 0);
  assert.equal(root.props.paginationHasMore, false);
  probe.dispatch(root.props.onLoadMore);
  assert.equal(loadMore, 1);

  const gridProbe = createContext();
  const gridRenderer = renderCommand(gridProbe.context, () =>
    createElement(
      Grid,
      { pagination: { pageSize: 0, hasMore: false, onLoadMore: () => {} } },
      createElement(Grid.Item, { content: "Loading", title: "Loading" }),
    ),
  );
  await gridRenderer.flush();
  assert.equal(gridProbe.transactions[0].operations[0].root.props.paginationPageSize, 0);
});

test("exposes the complete declaration-backed icon enum without an implicit fallback", () => {
  assert.ok(Object.keys(Icon).length >= 478);
  assert.equal(Icon.AppWindowList, "app-window-list-16");
  assert.equal(Icon.CheckCircle, "check-circle-16");
  assert.equal(Icon.CircleProgress, "circle-progress-16");
  assert.equal(Icon.CircleFilled, "circle-filled-16");
  assert.equal(Icon.Livestream, "livestream-01-16");
  assert.equal(Icon.Number07, "number-07-16");
  assert.equal(Icon.RotateClockwise, "rotate-clockwise-16");
  assert.equal(Icon.Wand, "wand-16");
  assert.equal(Icon.XMarkCircle, "x-mark-circle-16");
  assert.equal(Icon.AirplaneFilled, "airplane-filled-16");
  assert.equal(Icon.CircleProgress75, "circle-progress-75-16");
  assert.equal(Icon.XMarkTopRightSquare, "x-mark-top-right-square-16");
  assert.equal(Icon.NotMeasured, undefined);
});

test("accepts the shared List and Grid dropdown search accessory implementations", async () => {
  const listProbe = createContext();
  const listRenderer = renderCommand(listProbe.context, () =>
    createElement(
      List,
      { searchBarAccessory: createElement(Grid.Dropdown, { tooltip: "Filter" }) },
      createElement(List.Item, { title: "List item" }),
    ),
  );
  await listRenderer.flush();
  assert.equal(listProbe.transactions[0].operations[0].root.children[0].type, "grid-dropdown");

  const gridProbe = createContext();
  const gridRenderer = renderCommand(gridProbe.context, () =>
    createElement(
      Grid,
      { searchBarAccessory: createElement(List.Dropdown, { tooltip: "Filter" }) },
      createElement(Grid.Item, { content: "item", title: "Grid item" }),
    ),
  );
  await gridRenderer.flush();
  assert.equal(gridProbe.transactions[0].operations[0].root.children[0].type, "list-dropdown");
});

test("renders List item icon descriptors with tooltips", async () => {
  const probe = createContext();
  const renderer = renderCommand(probe.context, () =>
    createElement(
      List,
      null,
      createElement(List.Item, {
        title: "Profile",
        icon: { value: Icon.AddPerson, tooltip: "Add a profile" },
      }),
    ),
  );
  await renderer.flush();

  assert.deepEqual(probe.transactions[0].operations[0].root.children[0].props, {
    title: "Profile",
    icon: "add-person-16",
    iconTooltip: "Add a profile",
  });
});

test("accepts composite children in action groups and form collections", async () => {
  const probe = createContext();
  function Actions() {
    return createElement(Fragment, null, createElement(Action, { title: "Wrapped action" }));
  }
  function Fields() {
    return createElement(
      Fragment,
      null,
      createElement(Form.TextField, { id: "name", title: "Name" }),
      createElement(
        Form.Dropdown,
        { id: "role", title: "Role" },
        createElement(Form.Dropdown.Item, { value: "admin", title: "Administrator" }),
      ),
    );
  }
  const MemoizedActions = memo(Actions);

  const renderer = renderCommand(probe.context, () =>
    createElement(
      Form,
      { actions: createElement(ActionPanel, null, createElement(MemoizedActions)) },
      createElement(Fields),
    ),
  );
  await renderer.flush();

  const root = probe.transactions[0].operations[0].root;
  assert.deepEqual(
    root.children.map((child) => child.type),
    ["action-group", "form-text-field", "form-dropdown"],
  );
  assert.equal(root.children[0].children[0].props.title, "Wrapped action");
  assert.equal(root.children[2].children[0].props.value, "admin");
});

test("accepts React context providers around measured collections", async () => {
  const probe = createContext();
  const CollectionContext = createReactContext("default");
  const renderer = renderCommand(probe.context, () =>
    createElement(
      List,
      null,
      createElement(
        CollectionContext.Provider,
        { value: "provided" },
        createElement(List.Item, { title: "Context item" }),
      ),
    ),
  );
  await renderer.flush();

  const root = probe.transactions[0].operations[0].root;
  assert.deepEqual(
    root.children.map((child) => child.type),
    ["list-item"],
  );
  assert.equal(root.children[0].props.title, "Context item");
});

test("ignores whitespace-only children in measured collections", async () => {
  const probe = createContext();
  const renderer = renderCommand(probe.context, () =>
    createElement(
      List,
      null,
      createElement(
        List.Section,
        { title: "Items" },
        "\n    ",
        0,
        createElement(
          List.Item,
          { title: "First" },
          createElement(ActionPanel, null, "\n      ", createElement(Action, { title: "Run" }), "\n    "),
        ),
        "\n  ",
      ),
    ),
  );
  await renderer.flush();

  const listRoot = probe.transactions[0].operations[0].root;
  assert.deepEqual(
    listRoot.children.map((child) => child.type),
    ["list-section"],
  );
  assert.deepEqual(
    listRoot.children[0].children.map((child) => child.type),
    ["list-item"],
  );
  assert.deepEqual(
    listRoot.children[0].children[0].children[0].children.map((child) => child.type),
    ["action"],
  );

  const formProbe = createContext();
  const formRenderer = renderCommand(formProbe.context, () =>
    createElement(
      Form,
      { actions: createElement(ActionPanel, null, "\n", createElement(Action, { title: "Save" }), "\n") },
      "\n",
      createElement(Form.TextField, { id: "name", title: "Name" }),
      "\n",
    ),
  );
  await formRenderer.flush();
  const formRoot = formProbe.transactions[0].operations[0].root;
  assert.deepEqual(
    formRoot.children.map((child) => child.type),
    ["action-group", "form-text-field"],
  );
});

test("renders Form.LinkAccessory and routes its open capability", async () => {
  const probe = createContext();
  const renderer = renderCommand(probe.context, () =>
    createElement(
      Form,
      {
        searchBarAccessory: createElement(Form.LinkAccessory, {
          target: "https://example.com/help",
          text: "Help",
        }),
      },
      createElement(Form.TextField, { id: "name", title: "Name" }),
    ),
  );
  await renderer.flush();

  const root = probe.transactions[0].operations[0].root;
  assert.equal(root.children[0].type, "form-link-accessory");
  assert.deepEqual(root.children[0].props, {
    target: "https://example.com/help",
    text: "Help",
    onOpen: root.children[0].props.onOpen,
  });

  probe.dispatch(root.children[0].props.onOpen);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(probe.capabilityRequests, [
    { capability: "open", operation: "open", arguments: { target: "https://example.com/help" } },
  ]);
});

test("renders measured action creators and routes their host operations", async () => {
  const probe = createContext({ capabilityValues: { "date-picker.pick": "2026-08-29T12:00:00.000Z" } });
  const picked = [];
  const image = {
    source: { light: "image-light.png", dark: "image-dark.png" },
    fallback: "image-fallback.png",
    mask: Image.Mask.Circle,
    tintColor: { light: "#111111", dark: "#eeeeee", adjustContrast: true },
  };
  const renderer = renderCommand(probe.context, () =>
    createElement(
      List,
      null,
      createElement(List.Item, {
        title: "Actions",
        actions: createElement(
          ActionPanel,
          null,
          createElement(Action.CreateQuicklink, {
            quicklink: { link: "raycast://extensions/example", name: "Example", icon: image },
          }),
          createElement(Action.CreateSnippet, {
            snippet: { text: 'console.log("example")', name: "Example", keyword: "ex" },
          }),
          createElement(Action.ToggleQuickLook),
          createElement(Action.PickDate, {
            title: "Pick date",
            type: Action.PickDate.Type.Date,
            icon: image,
            onChange: (date) => picked.push(date),
          }),
        ),
      }),
    ),
  );
  await renderer.flush();

  const actions = probe.transactions[0].operations[0].root.children[0].children[0].children;
  assert.deepEqual(
    actions.map(({ props }) => ({ title: props.title, icon: props.icon })),
    [
      { title: "Create Quicklink", icon: "link" },
      { title: "Create Snippet", icon: "snippets-16" },
      { title: "Quick Look", icon: "eye" },
      { title: "Pick date", icon: "image-light.png" },
    ],
  );

  probe.dispatch(actions[0].props.onAction);
  probe.dispatch(actions[1].props.onAction);
  probe.dispatch(actions[2].props.onAction);
  probe.dispatch(actions[3].props.onAction);
  await new Promise((resolve) => setTimeout(resolve, 5));

  assert.deepEqual(
    probe.capabilityRequests.map(({ capability, operation, arguments: args }) => ({
      capability,
      operation,
      arguments: args,
    })),
    [
      {
        capability: "quicklink",
        operation: "create",
        arguments: {
          quicklinkJSON:
            '{"link":"raycast://extensions/example","name":"Example","icon":"image-light.png","iconDark":"image-dark.png","iconFallback":"image-fallback.png","iconMask":"circle","iconTintColor":"#111111","iconTintColorDark":"#eeeeee","iconTintColorAdjustContrast":true}',
        },
      },
      {
        capability: "snippet",
        operation: "create",
        arguments: { snippetJSON: '{"text":"console.log(\\"example\\")","name":"Example","keyword":"ex"}' },
      },
      {
        capability: "quick-look",
        operation: "toggle",
        arguments: undefined,
      },
      {
        capability: "date-picker",
        operation: "pick",
        arguments: {
          title: "Pick date",
          type: "date",
          icon: "image-light.png",
          iconDark: "image-dark.png",
          iconFallback: "image-fallback.png",
          iconMask: "circle",
          iconTintColor: "#111111",
          iconTintColorDark: "#eeeeee",
          iconTintColorAdjustContrast: true,
        },
      },
    ],
  );
  assert.deepEqual(picked, [new Date("2026-08-29T12:00:00.000Z")]);
});

test("renders and routes Action.InstallMCPServer", async () => {
  const probe = createContext();
  const renderer = renderCommand(probe.context, () =>
    createElement(
      List,
      null,
      createElement(
        List.Item,
        { title: "MCP" },
        createElement(
          ActionPanel,
          null,
          createElement(Action.InstallMCPServer, {
            title: "Install Thinking",
            server: {
              name: "Sequential Thinking",
              description: "A test server",
              transport: "stdio",
              command: "npx",
              args: ["-y", "server"],
              env: { MODE: "test" },
            },
          }),
        ),
      ),
    ),
  );
  await renderer.flush();

  const action = probe.transactions[0].operations[0].root.children[0].children[0].children[0];
  assert.equal(action.props.title, "Install Thinking");
  probe.dispatch(action.props.onAction);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(probe.capabilityRequests, [
    {
      capability: "mcp-server",
      operation: "install",
      arguments: {
        serverJSON:
          '{"name":"Sequential Thinking","transport":"stdio","description":"A test server","command":"npx","args":["-y","server"],"env":{"MODE":"test"}}',
      },
    },
  ]);
});

test("serializes Quick Look metadata for list and grid items", async () => {
  const listProbe = createContext();
  const listRenderer = renderCommand(listProbe.context, () =>
    createElement(
      List,
      null,
      createElement(List.Item, {
        title: "List file",
        quickLook: { path: new URL("file:///tmp/list.txt"), name: null },
      }),
    ),
  );
  await listRenderer.flush();

  const gridProbe = createContext();
  const gridRenderer = renderCommand(gridProbe.context, () =>
    createElement(
      Grid,
      null,
      createElement(Grid.Item, {
        content: Icon.Document,
        title: "Grid file",
        quickLook: { path: new Uint8Array(Buffer.from("/tmp/grid.txt")), name: "Grid file" },
      }),
    ),
  );
  await gridRenderer.flush();

  const listRoot = listProbe.transactions[0].operations[0].root;
  assert.deepEqual(listRoot.children[0].props, { title: "List file", quickLookPath: "file:///tmp/list.txt" });
  const gridRoot = gridProbe.transactions[0].operations[0].root;
  assert.deepEqual(gridRoot.children[0].props, {
    content: "blank-document-16",
    title: "Grid file",
    quickLookPath: "/tmp/grid.txt",
    quickLookName: "Grid file",
  });
});

test("renders Finder and trash actions and routes their host operations", async () => {
  const probe = createContext();
  const shown = [];
  const trashed = [];
  const paths = ["/tmp/one", "/tmp/two"];
  const renderer = renderCommand(probe.context, () =>
    createElement(
      List,
      null,
      createElement(List.Item, {
        title: "Files",
        actions: createElement(
          ActionPanel,
          null,
          createElement(Action.ShowInFinder, {
            path: "/tmp/file",
            onShow: (path) => shown.push(path),
          }),
          createElement(Action.Trash, {
            paths,
            onTrash: (received) => trashed.push(received),
          }),
        ),
      }),
    ),
  );
  await renderer.flush();

  const actions = probe.transactions[0].operations[0].root.children[0].children[0].children;
  assert.deepEqual(
    actions.map(({ props }) => ({ title: props.title, icon: props.icon })),
    [
      { title: "Show in Finder", icon: "finder" },
      { title: "Move to Trash", icon: "trash" },
    ],
  );

  probe.dispatch(actions[0].props.onAction);
  probe.dispatch(actions[1].props.onAction);
  await new Promise((resolve) => setTimeout(resolve, 5));

  assert.deepEqual(
    probe.capabilityRequests.map(({ capability, operation, arguments: args }) => ({
      capability,
      operation,
      arguments: args,
    })),
    [
      { capability: "finder", operation: "show", arguments: { path: "/tmp/file" } },
      {
        capability: "filesystem",
        operation: "trash",
        arguments: { pathsJSON: '["/tmp/one","/tmp/two"]' },
      },
    ],
  );
  assert.deepEqual(shown, ["/tmp/file"]);
  assert.deepEqual(trashed, [paths]);
  assert.equal(ShowInFinderAction, Action.ShowInFinder);
  assert.equal(TrashAction, Action.Trash);
});

test("supports deprecated Form dropdown member aliases", async () => {
  const probe = createContext();
  const renderer = renderCommand(probe.context, () =>
    createElement(
      Form,
      null,
      createElement(
        Form.Dropdown,
        { id: "choice", title: "Choice" },
        createElement(Form.DropdownItem, { value: "one", title: "One" }),
        createElement(
          Form.DropdownSection,
          { title: "More" },
          createElement(Form.DropdownItem, { value: "two", title: "Two" }),
        ),
      ),
    ),
  );
  await renderer.flush();

  const dropdown = probe.transactions[0].operations[0].root.children[0];
  assert.equal(dropdown.type, "form-dropdown");
  assert.deepEqual(
    dropdown.children.map(({ type, props }) => ({ type, props })),
    [
      { type: "form-dropdown-item", props: { value: "one", title: "One" } },
      { type: "form-dropdown-section", props: { title: "More" } },
    ],
  );
  assert.deepEqual(dropdown.children[1].children[0].props, { value: "two", title: "Two" });
});

test("renders legacy list and action aliases, including OpenWithAction", async () => {
  const probe = createContext();
  const opened = [];
  const renderer = renderCommand(probe.context, () =>
    createElement(
      List,
      null,
      createElement(
        ListSection,
        { id: "files", title: "Files", subtitle: "Choose an application" },
        createElement(
          List.Item,
          { title: "Example" },
          createElement(
            ActionPanel,
            null,
            createElement(ActionPanelItem, { title: "Legacy item", onAction: onAction }),
            createElement(ActionPanel.Item, { title: "Panel item", onAction: onAction }),
            createElement(OpenWithAction, { path: "/tmp/example.txt", onOpen: (path) => opened.push(path) }),
          ),
        ),
      ),
    ),
  );
  await renderer.flush();

  const root = probe.transactions[0].operations[0].root;
  assert.deepEqual(root.children[0].props, { id: "files", title: "Files", subtitle: "Choose an application" });
  const actions = root.children[0].children[0].children[0].children;
  assert.deepEqual(
    actions.map(({ props }) => ({ title: props.title, icon: props.icon })),
    [
      { title: "Legacy item", icon: undefined },
      { title: "Panel item", icon: undefined },
      { title: "Open With", icon: "upload" },
    ],
  );

  probe.dispatch(actions[2].props.onAction);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(probe.capabilityRequests, [
    { capability: "open", operation: "open", arguments: { target: "/tmp/example.txt", openWith: true } },
  ]);
  assert.deepEqual(opened, ["/tmp/example.txt"]);
  assert.deepEqual(AlertActionStyle, { Default: "default", Cancel: "cancel", Destructive: "destructive" });
  assert.equal(Action.OpenWith, OpenWithAction);
});

test("bridges legacy render calls into the active scene renderer", async () => {
  const probe = createContext();
  function LegacyCommand() {
    render(createElement(Detail, { markdown: "Legacy render" }));
    return null;
  }

  const renderer = renderCommand(probe.context, () => createElement(LegacyCommand));
  await renderer.flush();

  const root = probe.transactions[0].operations[0].root;
  assert.equal(root.type, "detail");
  assert.deepEqual(root.props, { markdown: "Legacy render" });
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

test("renders modern and deprecated browser and clipboard actions", async () => {
  const probe = createContext();
  const opened = [];
  const copied = [];

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
          createElement(OpenInBrowserAction, { url: "https://example.com", onOpen: (url) => opened.push(url) }),
          createElement(Action.OpenInBrowser, {
            title: "Open docs",
            url: "https://docs.example.com",
            onOpen: (url) => opened.push(url),
          }),
          createElement(CopyToClipboardAction, { content: "copied value", onCopy: (content) => copied.push(content) }),
        ),
      ),
    ),
  );
  await renderer.flush();

  const actions = probe.transactions[0].operations[0].root.children[0].children[0].children;
  assert.deepEqual(
    actions.map(({ props }) => ({ title: props.title, icon: props.icon })),
    [
      { title: "Open in Browser", icon: "globe" },
      { title: "Open docs", icon: "globe" },
      { title: "Copy to Clipboard", icon: "clipboard" },
    ],
  );

  for (const action of actions) {
    probe.dispatch(action.props.onAction);
  }
  await new Promise((resolve) => setTimeout(resolve, 5));

  assert.deepEqual(
    probe.capabilityRequests.map(({ capability, operation, arguments: args }) => ({
      capability,
      operation,
      arguments: args,
    })),
    [
      { capability: "open", operation: "open", arguments: { target: "https://example.com" } },
      { capability: "open", operation: "open", arguments: { target: "https://docs.example.com" } },
      { capability: "clipboard", operation: "write", arguments: { text: "copied value" } },
    ],
  );
  assert.deepEqual(opened, ["https://example.com", "https://docs.example.com"]);
  assert.deepEqual(copied, ["copied value"]);
});

test("keeps OpenInBrowser actions with empty declaration-valid URLs renderable", async () => {
  const probe = createContext();
  const renderer = renderCommand(probe.context, () =>
    createElement(
      List,
      null,
      createElement(
        List.Item,
        { title: "Loading" },
        createElement(
          ActionPanel,
          null,
          createElement(Action.OpenInBrowser, { title: "Open when ready", url: "" }),
          createElement(Action.OpenInBrowser, { title: "Not ready" }),
        ),
      ),
    ),
  );
  await renderer.flush();

  const action = probe.transactions[0].operations[0].root.children[0].children[0].children[0];
  assert.deepEqual(action.props, { title: "Open when ready", icon: "globe", onAction: action.props.onAction });
});

test("renders open and paste aliases and routes clipboard helper aliases", async () => {
  const probe = createContext({ storageProvider: createInMemoryLocalStorageProvider() });
  const opened = [];
  const pasted = [];
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
          createElement(OpenAction, {
            title: "Open legacy",
            target: "https://example.com/legacy",
            application: "Browser",
            onOpen: (target) => opened.push(target),
          }),
          createElement(Action.Open, {
            title: "Open modern",
            target: "https://example.com/modern",
            onOpen: (target) => opened.push(target),
          }),
          createElement(PasteAction, { content: "legacy paste", onPaste: (content) => pasted.push(content) }),
          createElement(Action.Paste, {
            title: "Paste modern",
            content: { text: "modern paste" },
            onPaste: (content) => pasted.push(content),
          }),
        ),
      ),
    ),
  );
  await renderer.flush();

  const actions = probe.transactions[0].operations[0].root.children[0].children[0].children;
  assert.deepEqual(
    actions.map(({ props }) => ({ title: props.title, icon: props.icon })),
    [
      { title: "Open legacy", icon: "finder" },
      { title: "Open modern", icon: "finder" },
      { title: "Paste in Active App", icon: "clipboard" },
      { title: "Paste modern", icon: "clipboard" },
    ],
  );

  for (const action of actions) {
    probe.dispatch(action.props.onAction);
  }
  await new Promise((resolve) => setTimeout(resolve, 5));

  assert.deepEqual(
    probe.capabilityRequests.map(({ capability, operation, arguments: args }) => ({
      capability,
      operation,
      arguments: args,
    })),
    [
      {
        capability: "open",
        operation: "open",
        arguments: { target: "https://example.com/legacy", application: "Browser" },
      },
      { capability: "open", operation: "open", arguments: { target: "https://example.com/modern" } },
      { capability: "clipboard", operation: "paste", arguments: { text: "legacy paste" } },
      {
        capability: "clipboard",
        operation: "paste",
        arguments: { contentJSON: JSON.stringify({ text: "modern paste" }) },
      },
    ],
  );
  assert.deepEqual(opened, ["https://example.com/legacy", "https://example.com/modern"]);
  assert.deepEqual(pasted, ["legacy paste", { text: "modern paste" }]);

  await copyTextToClipboard("helper copy");
  await pasteText("helper paste");
  await setLocalStorageItem("helper", "stored");
  await removeLocalStorageItem("helper");
  await clearLocalStorage();

  assert.deepEqual(
    probe.capabilityRequests
      .slice(4)
      .map(({ capability, operation, arguments: args }) => ({ capability, operation, arguments: args })),
    [
      { capability: "clipboard", operation: "write", arguments: { text: "helper copy" } },
      { capability: "clipboard", operation: "paste", arguments: { text: "helper paste" } },
      { capability: "local-storage", operation: "set", arguments: { key: "helper", value: "stored" } },
      { capability: "local-storage", operation: "remove", arguments: { key: "helper" } },
      { capability: "local-storage", operation: "clear", arguments: undefined },
    ],
  );
});

test("routes structured clipboard content and default application discovery", async () => {
  const application = {
    name: "TextEdit",
    localizedName: "TextEdit",
    path: "/System/Applications/TextEdit.app",
    bundleId: "com.apple.TextEdit",
  };
  const probe = createContext({
    capabilityValues: {
      "application.default": JSON.stringify(application),
    },
  });
  configureRaycastCompat(probe.context);

  assert.deepEqual(await getDefaultApplication(new URL("file:///tmp/example.txt")), application);
  await Clipboard.copy({ html: "<strong>Hello</strong>", text: "Hello" }, { concealed: true });
  captureException(new Error("fixture failure"));
  captureMemorySnapshot("fixture heap");
  await new Promise((resolve) => setTimeout(resolve, 5));

  const requests = probe.capabilityRequests.map(({ capability, operation, arguments: args }) => ({
    capability,
    operation,
    arguments: args,
  }));
  assert.deepEqual(requests.slice(0, 2), [
    { capability: "application", operation: "default", arguments: { path: "file:///tmp/example.txt" } },
    {
      capability: "clipboard",
      operation: "write",
      arguments: { contentJSON: '{"html":"<strong>Hello</strong>","text":"Hello"}', concealed: true },
    },
  ]);
  assert.equal(requests[2].capability, "telemetry");
  assert.equal(requests[2].operation, "captureException");
  assert.deepEqual(JSON.parse(requests[2].arguments.exceptionJSON), {
    name: "Error",
    message: "fixture failure",
    stack: JSON.parse(requests[2].arguments.exceptionJSON).stack,
  });
  assert.deepEqual(requests[3], {
    capability: "telemetry",
    operation: "captureMemorySnapshot",
    arguments: { label: "fixture heap" },
  });
});

test("Clipboard singletons use the configured context", async () => {
  const probe = createContext();
  configureRaycastCompat(probe.context);

  await Clipboard.copy("hello");
  const content = await Clipboard.read();
  const text = await Clipboard.readText({ offset: 2 });
  await Clipboard.clear();

  assert.deepEqual(probe.capabilityRequests, [
    { capability: "clipboard", operation: "write", arguments: { text: "hello" } },
    { capability: "clipboard", operation: "read" },
    { capability: "clipboard", operation: "read", arguments: { offset: 2 } },
    { capability: "clipboard", operation: "clear" },
  ]);
  assert.deepEqual(content, { text: "clipboard-text" });
  assert.equal(text, "clipboard-text");
});

test("decodes structured Clipboard.read content", async () => {
  const probe = createContext({
    capabilityValues: {
      "clipboard.read": JSON.stringify({ text: "hello", file: "/tmp/hello.txt", html: "<p>hello</p>" }),
    },
  });
  configureRaycastCompat(probe.context);

  assert.deepEqual(await Clipboard.read(), {
    text: "hello",
    file: "/tmp/hello.txt",
    html: "<p>hello</p>",
  });
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
    createElement(Detail, {
      markdown: "# Notes",
      navigationTitle: "Notes",
      isLoading: true,
      metadata: createElement(
        Detail.Metadata,
        null,
        createElement(Detail.Metadata.Label, {
          title: "Owner",
          icon: Icon.Person,
          text: { value: "Ada", color: Color.Green },
        }),
        createElement(Detail.Metadata.Separator),
        createElement(Detail.Metadata.Link, {
          title: "Docs",
          target: "https://example.com/docs",
          text: "Open docs",
        }),
        createElement(
          Detail.Metadata.TagList,
          { title: "Tags" },
          createElement(Detail.Metadata.TagList.Item, {
            text: "stable",
            color: Color.Blue,
          }),
        ),
      ),
    }),
  );
  await renderer.flush();

  const root = probe.transactions[0].operations[0].root;
  assert.equal(root.type, "detail");
  assert.deepEqual(root.props, { markdown: "# Notes", navigationTitle: "Notes", isLoading: true });
  assert.deepEqual(
    root.children.map((child) => child.type),
    ["detail-metadata"],
  );
  assert.deepEqual(
    root.children[0].children.map((child) => child.type),
    ["detail-metadata-label", "detail-metadata-separator", "detail-metadata-link", "detail-metadata-tag-list"],
  );
  assert.deepEqual(root.children[0].children[0].props, {
    title: "Owner",
    icon: "person-16",
    text: "Ada",
    textColor: "raycast-green",
  });
  assert.deepEqual(root.children[0].children[2].props, {
    title: "Docs",
    target: "https://example.com/docs",
    text: "Open docs",
  });
  assert.deepEqual(root.children[0].children[3].children[0].props, {
    text: "stable",
    color: "raycast-blue",
  });
});

test("allows SubmitForm as a generic action outside Form", async () => {
  const probe = createContext();
  const submitted = [];

  const renderer = renderCommand(probe.context, () =>
    createElement(Detail, {
      markdown: "# Simon",
      actions: createElement(
        ActionPanel,
        null,
        createElement(Action.SubmitForm, {
          title: "Start game",
          onSubmit: (values) => submitted.push(values),
        }),
      ),
    }),
  );
  await renderer.flush();

  const action = probe.transactions[0].operations[0].root.children[0].children[0];
  assert.equal(action.type, "action");
  probe.dispatch(action.props.onAction);
  assert.deepEqual(submitted, [{}]);
});

test("renders List.Item.Detail with title and subtitle descriptors", async () => {
  const probe = createContext();
  const tagActions = [];

  const renderer = renderCommand(probe.context, () =>
    createElement(
      List,
      { isShowingDetail: true },
      createElement(List.Item, {
        title: { value: "Pikachu", tooltip: "Electric type" },
        subtitle: { value: null, tooltip: "No subtitle" },
        detail: createElement(List.Item.Detail, {
          markdown: "# Pikachu",
          metadata: createElement(
            List.Item.Detail.Metadata,
            null,
            createElement(
              List.Item.Detail.Metadata.TagList,
              { title: "Types" },
              createElement(List.Item.Detail.Metadata.TagList.Item, {
                text: "Electric",
                onAction: () => tagActions.push("Electric"),
              }),
            ),
          ),
        }),
      }),
    ),
  );
  await renderer.flush();

  const root = probe.transactions[0].operations[0].root;
  assert.deepEqual(root.props, { isShowingDetail: true });
  const item = root.children[0];
  assert.deepEqual(item.props, {
    title: "Pikachu",
    titleTooltip: "Electric type",
    subtitleTooltip: "No subtitle",
  });
  const detail = item.children[0];
  assert.equal(detail.type, "detail");
  assert.deepEqual(detail.props, { markdown: "# Pikachu" });
  const tagItem = detail.children[0].children[0].children[0];
  assert.equal(tagItem.props.text, "Electric");
  assert.equal(typeof tagItem.props.onAction, "string");

  probe.dispatch(tagItem.props.onAction);
  assert.deepEqual(tagActions, ["Electric"]);
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
    accessoryIcon: "star-16",
    accessoryTooltip: "Favorite",
  });
});

test("accepts measured Grid columns and empty content tooltips", async () => {
  const probe = createContext();
  const renderer = renderCommand(probe.context, () =>
    createElement(
      Grid,
      { columns: 8 },
      createElement(
        Grid.Section,
        { columns: 1 },
        createElement(Grid.Item, {
          content: { value: Icon.Circle, tooltip: "" },
          title: "Circle",
        }),
      ),
    ),
  );
  await renderer.flush();

  const root = probe.transactions[0].operations[0].root;
  assert.equal(root.props.columns, 8);
  assert.equal(root.children[0].props.columns, 1);
  assert.deepEqual(root.children[0].children[0].props, {
    content: "circle-16",
    contentTooltip: "",
    title: "Circle",
  });
});

test("rejects Grid columns outside Raycast's one-through-eight range", () => {
  const probe = createContext();
  for (const columns of [0, 9, 1.5, Number.NaN]) {
    assert.throws(
      () => renderCommand(probe.context, () => createElement(Grid, { columns })),
      (error) => error instanceof CompatibilityError && /between 1 and 8/.test(error.message),
    );
  }
  assert.throws(
    () => renderCommand(probe.context, () => createElement(Grid, null, createElement(Grid.Section, { columns: 9 }))),
    (error) => error instanceof CompatibilityError && /between 1 and 8/.test(error.message),
  );
});

test("routes Grid and dropdown search and pagination events", async () => {
  const probe = createContext();
  const selections = [];
  const searches = [];
  const dropdownValues = [];
  const dropdownSearches = [];
  let loadMore = 0;
  const renderer = renderCommand(probe.context, () =>
    createElement(
      Grid,
      {
        enableFiltering: true,
        selectedItemId: "one",
        onSelectionChange: (id) => selections.push(id),
        onSearchTextChange: (text) => searches.push(text),
        pagination: { pageSize: 25, hasMore: true, onLoadMore: () => loadMore++ },
        searchBarAccessory: createElement(
          Grid.Dropdown,
          {
            tooltip: "Filter",
            isLoading: true,
            filtering: { keepSectionOrder: true },
            throttle: true,
            onChange: (value) => dropdownValues.push(value),
            onSearchTextChange: (text) => dropdownSearches.push(text),
          },
          createElement(Grid.Dropdown.Item, { value: "all", title: "All" }),
        ),
      },
      createElement(Grid.Item, { id: "one", content: "one", title: "One" }),
    ),
  );
  await renderer.flush();

  const root = probe.transactions[0].operations[0].root;
  assert.deepEqual(root.props, {
    filtering: true,
    selectedItemId: "one",
    onSelectionChange: root.props.onSelectionChange,
    onSearchTextChange: root.props.onSearchTextChange,
    paginationPageSize: 25,
    paginationHasMore: true,
    onLoadMore: root.props.onLoadMore,
  });
  const dropdown = root.children[0];
  assert.deepEqual(dropdown.props, {
    tooltip: "Filter",
    isLoading: true,
    filtering: true,
    filteringKeepSectionOrder: true,
    throttle: true,
    onChange: dropdown.props.onChange,
    onSearchTextChange: dropdown.props.onSearchTextChange,
  });

  probe.dispatch(root.props.onSelectionChange, { selectedItemId: null });
  probe.dispatch(root.props.onSearchTextChange, { searchText: "query" });
  probe.dispatch(root.props.onLoadMore);
  probe.dispatch(dropdown.props.onChange, { value: "all" });
  probe.dispatch(dropdown.props.onSearchTextChange, { searchText: "filter" });

  assert.deepEqual(selections, [null]);
  assert.deepEqual(searches, ["query"]);
  assert.equal(loadMore, 1);
  assert.deepEqual(dropdownValues, ["all"]);
  assert.deepEqual(dropdownSearches, ["filter"]);
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
  assert.deepEqual(root.props, { title: "Blast", tooltip: "Blast menu", icon: "circle-16", isLoading: true });
  assert.deepEqual(
    root.children.map((child) => child.type),
    ["menu-bar-section", "menu-bar-separator"],
  );
  const refresh = root.children[0].children[0];
  assert.equal(refresh.props.title, "Refresh");
  probe.dispatch(refresh.props.onAction);
  assert.deepEqual(calls, ["left-click"]);
});

test("renders MenuBarExtra.Item alternates and routes right-click events", async () => {
  const probe = createContext();
  const calls = [];

  const renderer = renderCommand(probe.context, () =>
    createElement(
      MenuBarExtra,
      { title: "Blast" },
      createElement(MenuBarExtra.Item, {
        title: "Open",
        onAction: (event) => calls.push(`main:${event.type}`),
        alternate: createElement(MenuBarExtra.Item, {
          title: "Open alternate",
          onAction: (event) => calls.push(`alternate:${event.type}`),
        }),
      }),
    ),
  );
  await renderer.flush();

  const item = probe.transactions[0].operations[0].root.children[0];
  const alternate = item.children[0];
  assert.equal(alternate.props.isAlternate, true);
  assert.equal(alternate.props.title, "Open alternate");
  probe.dispatch(item.props.onAction);
  probe.dispatch(alternate.props.onAction);
  assert.deepEqual(calls, ["main:left-click", "alternate:right-click"]);
});

test("preserves alternate semantics through a custom item component", async () => {
  const probe = createContext();
  const calls = [];
  function AlternateItem() {
    return createElement(MenuBarExtra.Item, {
      title: "Custom alternate",
      onAction: (event) => calls.push(event.type),
    });
  }

  const renderer = renderCommand(probe.context, () =>
    createElement(
      MenuBarExtra,
      { title: "Blast" },
      createElement(MenuBarExtra.Item, {
        title: "Open",
        alternate: createElement(AlternateItem),
      }),
    ),
  );
  await renderer.flush();

  const alternate = probe.transactions[0].operations[0].root.children[0].children[0];
  assert.equal(alternate.props.isAlternate, true);
  probe.dispatch(alternate.props.onAction);
  assert.deepEqual(calls, ["right-click"]);
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
      createElement(Form.TextArea, {
        id: "bio",
        title: "Bio",
        placeholder: "About you",
        enableMarkdown: true,
      }),
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
  assert.equal(fields.get("bio").props.enableMarkdown, true);
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

test("routes Form focus and blur callbacks with typed target values", async () => {
  const probe = createContext();
  const events = [];
  const renderer = renderCommand(probe.context, () =>
    createElement(
      Form,
      null,
      createElement(Form.TextField, {
        id: "name",
        defaultValue: "Ada",
        onFocus: (event) => events.push(event),
        onBlur: (event) => events.push(event),
      }),
    ),
  );
  await renderer.flush();

  const field = probe.transactions[0].operations[0].root.children[0];
  assert.equal(typeof field.props.onFocus, "string");
  assert.equal(typeof field.props.onBlur, "string");
  probe.dispatch(field.props.onFocus, { name: "Grace" });
  probe.dispatch(field.props.onBlur);

  assert.deepEqual(events, [
    { type: "focus", target: { id: "name", value: "Grace" } },
    { type: "blur", target: { id: "name", value: "Grace" } },
  ]);
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
        type: Form.DatePicker.Date,
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
      { value: "v2", title: "V2", icon: "circle-16" },
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

test("attaches declaration-shaped handles to Form fields", async () => {
  const probe = createContext();
  const refs = Array(8);
  const renderer = renderCommand(probe.context, () =>
    createElement(
      Form,
      null,
      createElement(Form.TextField, { id: "text", ref: (value) => (refs[0] = value) }),
      createElement(Form.TextArea, { id: "area", ref: (value) => (refs[1] = value) }),
      createElement(Form.PasswordField, { id: "password", ref: (value) => (refs[2] = value) }),
      createElement(Form.Checkbox, { id: "checkbox", label: "Ready", ref: (value) => (refs[3] = value) }),
      createElement(Form.Dropdown, { id: "dropdown", ref: (value) => (refs[4] = value) }),
      createElement(Form.DatePicker, { id: "date", ref: (value) => (refs[5] = value) }),
      createElement(Form.TagPicker, { id: "tags", ref: (value) => (refs[6] = value) }),
      createElement(Form.FilePicker, { id: "files", ref: (value) => (refs[7] = value) }),
    ),
  );
  await renderer.flush();

  assert.equal(
    refs.every((ref) => ref !== null && typeof ref?.focus === "function"),
    true,
  );
  assert.equal(
    refs.every((ref) => typeof ref?.reset === "function"),
    true,
  );
  for (const ref of refs) {
    ref.focus();
    ref.reset();
  }
});

test("treats nullable non-date form initial values as empty", async () => {
  const probe = createContext();
  const submitted = [];
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
      createElement(Form.TextField, { id: "name", value: null }),
      createElement(Form.TextArea, { id: "notes", defaultValue: null }),
      createElement(
        Form.Dropdown,
        { id: "role", value: null },
        createElement(Form.Dropdown.Item, {
          value: "admin",
          title: "Administrator",
        }),
      ),
      createElement(
        Form.TagPicker,
        { id: "tags", defaultValue: null },
        createElement(Form.TagPicker.Item, {
          value: "v2",
          title: "V2",
        }),
      ),
      createElement(Form.FilePicker, { id: "files", value: null }),
    ),
  );
  await renderer.flush();

  const root = probe.transactions[0].operations[0].root;
  const fields = root.children.slice(1);
  assert.deepEqual(
    fields.map((field) => field.props),
    [
      { id: "name", onChange: fields[0].props.onChange },
      { id: "notes", onChange: fields[1].props.onChange },
      { id: "role", onChange: fields[2].props.onChange },
      { id: "tags", onChange: fields[3].props.onChange },
      {
        id: "files",
        defaultValue: [],
        onChange: fields[4].props.onChange,
      },
    ],
  );

  const submitEventId = root.children[0].children[0].props.onAction;
  probe.dispatch(submitEventId);
  assert.deepEqual(submitted, [{}]);

  assert.throws(
    () =>
      renderCommand(probe.context, () =>
        createElement(Form, null, createElement(Form.FilePicker, { id: "invalid", defaultValue: [null] })),
      ),
    (error) => error instanceof CompatibilityError && /wrong type/.test(error.message),
  );
});

test("omits undefined entries from optional string-array form values", async () => {
  const probe = createContext();
  const renderer = renderCommand(probe.context, () =>
    createElement(
      Form,
      null,
      createElement(Form.FilePicker, {
        id: "files",
        defaultValue: [undefined, "/tmp/example.txt"],
      }),
    ),
  );
  await renderer.flush();

  assert.deepEqual(probe.transactions[0].operations[0].root.children[0].props, {
    id: "files",
    defaultValue: ["/tmp/example.txt"],
    onChange: probe.transactions[0].operations[0].root.children[0].props.onChange,
  });
});

test("accepts empty strings for string-valued form and grid options", async () => {
  const formProbe = createContext();
  const formRenderer = renderCommand(formProbe.context, () =>
    createElement(
      Form,
      null,
      createElement(Form.Checkbox, { id: "enabled", label: "" }),
      createElement(Form.Dropdown, { id: "role" }, createElement(Form.Dropdown.Item, { value: "", title: "" })),
      createElement(Form.TagPicker, { id: "tags" }, createElement(Form.TagPicker.Item, { value: "", title: "" })),
      createElement(Form.Description, { text: "" }),
    ),
  );
  await formRenderer.flush();

  const formRoot = formProbe.transactions[0].operations[0].root;
  assert.equal(formRoot.children[0].props.label, "");
  assert.equal(formRoot.children[1].children[0].props.value, "");
  assert.equal(formRoot.children[1].children[0].props.title, "");
  assert.equal(formRoot.children[2].children[0].props.value, "");
  assert.equal(formRoot.children[2].children[0].props.title, "");
  assert.equal(formRoot.children[3].props.text, "");

  const gridProbe = createContext();
  const gridRenderer = renderCommand(gridProbe.context, () =>
    createElement(
      Grid,
      {
        searchBarAccessory: createElement(
          Grid.Dropdown,
          { tooltip: "Filter" },
          createElement(Grid.Dropdown.Item, { value: "", title: "" }),
        ),
      },
      createElement(Grid.Item, { content: "item", title: "Item" }),
    ),
  );
  await gridRenderer.flush();

  const gridRoot = gridProbe.transactions[0].operations[0].root;
  assert.deepEqual(gridRoot.children[0].children[0].props, { value: "", title: "" });
});

test("supports the Form.Dropdown search-bar contract", async () => {
  const probe = createContext();
  const searches = [];
  const renderer = renderCommand(probe.context, () =>
    createElement(
      Form,
      null,
      createElement(
        Form.Dropdown,
        {
          id: "role",
          isLoading: true,
          filtering: { keepSectionOrder: true },
          throttle: true,
          onSearchTextChange: (text) => searches.push(text),
        },
        createElement(Form.Dropdown.Item, { value: "admin", title: "Administrator" }),
      ),
    ),
  );
  await renderer.flush();

  const field = probe.transactions[0].operations[0].root.children[0];
  assert.deepEqual(field.props, {
    id: "role",
    isLoading: true,
    filtering: true,
    filteringKeepSectionOrder: true,
    throttle: true,
    onChange: field.props.onChange,
    onSearchTextChange: field.props.onSearchTextChange,
  });
  probe.dispatch(field.props.onSearchTextChange, { searchText: "adm" });
  assert.deepEqual(searches, ["adm"]);
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

  context.test("rejects invalid Form callbacks", () => {
    assert.throws(
      () =>
        renderCommand(probe.context, () =>
          createElement(
            Form,
            null,
            createElement(Form.TextField, { id: "when", title: "When", onFocus: "not-a-function" }),
          ),
        ),
      (error) => error instanceof CompatibilityError && /Form.TextField onFocus must be a function/.test(error.message),
    );
  });

  context.test("rejects invalid image descriptor metadata", () => {
    assert.throws(
      () =>
        renderCommand(probe.context, () =>
          createElement(
            List,
            null,
            createElement(List.Item, {
              title: "Invalid image",
              icon: { source: "avatar.png", mask: "square" },
            }),
          ),
        ),
      (error) => error instanceof CompatibilityError && /image mask/.test(error.message),
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
          icon: {
            source: { light: "avatar-light.png", dark: "avatar-dark.png" },
            fallback: { light: "fallback-light.png", dark: "fallback-dark.png" },
            mask: Image.Mask.Circle,
            tintColor: { light: "#111111", dark: "#eeeeee", adjustContrast: true },
          },
        }),
      );
    },
    launchProps,
  );
  await renderer.flush();

  const root = probe.transactions[0].operations[0].root;
  assert.equal(root.props.navigationTitle, "background:Blast:background");
  assert.deepEqual(root.children[0].props, {
    title: "test",
    icon: "avatar-light.png",
    iconDark: "avatar-dark.png",
    iconFallback: "fallback-light.png",
    iconFallbackDark: "fallback-dark.png",
    iconMask: "circle",
    iconTintColor: "#111111",
    iconTintColorDark: "#eeeeee",
    iconTintColorAdjustContrast: true,
  });
  assert.deepEqual(LaunchType, { UserInitiated: "userInitiated", Background: "background" });
});

test("preserves image metadata on Grid content and accessory icons", async () => {
  const probe = createContext();
  const image = {
    source: { light: "content-light.png", dark: "content-dark.png" },
    fallback: "content-fallback.png",
    mask: Image.Mask.RoundedRectangle,
    tintColor: { light: "#123456", dark: "#abcdef", adjustContrast: false },
  };
  const renderer = renderCommand(probe.context, () =>
    createElement(
      Grid,
      null,
      createElement(
        Grid.Item,
        { content: image, accessory: { icon: image, tooltip: "Accessory" } },
        createElement(ActionPanel, null, createElement(Action, { title: "Run", icon: image })),
      ),
    ),
  );
  await renderer.flush();

  const item = probe.transactions[0].operations[0].root.children[0];
  assert.deepEqual(item.props, {
    content: "content-light.png",
    contentDark: "content-dark.png",
    contentFallback: "content-fallback.png",
    contentMask: "roundedRectangle",
    contentTintColor: "#123456",
    contentTintColorDark: "#abcdef",
    contentTintColorAdjustContrast: false,
    accessoryIcon: "content-light.png",
    accessoryIconDark: "content-dark.png",
    accessoryIconFallback: "content-fallback.png",
    accessoryIconMask: "roundedRectangle",
    accessoryIconTintColor: "#123456",
    accessoryIconTintColorDark: "#abcdef",
    accessoryIconTintColorAdjustContrast: false,
    accessoryTooltip: "Accessory",
  });
  assert.deepEqual(item.children[0].children[0].props, {
    title: "Run",
    icon: "content-light.png",
    iconDark: "content-dark.png",
    iconFallback: "content-fallback.png",
    iconMask: "roundedRectangle",
    iconTintColor: "#123456",
    iconTintColorDark: "#abcdef",
    iconTintColorAdjustContrast: false,
    onAction: item.children[0].children[0].props.onAction,
  });
});

test("treats null image fallback, mask, and tint as omitted", async () => {
  const probe = createContext();
  const renderer = renderCommand(probe.context, () =>
    createElement(
      List,
      null,
      createElement(List.Item, {
        title: "Nullable image",
        icon: { source: "avatar.png", fallback: null, mask: null, tintColor: null },
      }),
    ),
  );
  await renderer.flush();

  assert.deepEqual(probe.transactions[0].operations[0].root.children[0].props, {
    title: "Nullable image",
    icon: "avatar.png",
  });
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
    icon: {
      source: { light: "alert-light.png", dark: "alert-dark.png" },
      fallback: "alert-fallback.png",
      mask: Image.Mask.RoundedRectangle,
      tintColor: { light: "#220000", dark: "#ffcccc", adjustContrast: false },
    },
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
        icon: "alert-light.png",
        iconDark: "alert-dark.png",
        iconFallback: "alert-fallback.png",
        iconMask: "roundedRectangle",
        iconTintColor: "#220000",
        iconTintColorDark: "#ffcccc",
        iconTintColorAdjustContrast: false,
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

test("keeps Cache.subscribe bound when passed as a callback", () => {
  const probe = createContext();
  configureRaycastCompat(probe.context);
  const cache = new Cache({ namespace: "cache-subscribe-bound" });
  cache.clear({ notifySubscribers: false });
  const events = [];
  const subscribe = cache.subscribe;
  const unsubscribe = subscribe((key, data) => events.push([key, data]));
  cache.set("key", "value");
  unsubscribe();
  assert.deepEqual(events, [["key", "value"]]);
});

test("shows toasts through the configured context", async () => {
  const probe = createContext();
  configureRaycastCompat(probe.context);

  assert.equal(Toast.Style.Success, "SUCCESS");
  assert.equal(Toast.Style.Failure, "FAILURE");
  assert.equal(Toast.Style.Animated, "ANIMATED");
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

test("exposes legacy preference metadata and stable helper ids", () => {
  const probe = createContext();
  configureRaycastCompat(probe.context);

  assert.equal(preferences.token.value, "secret");
  assert.equal(preferences.enabled.value, true);
  assert.deepEqual(Object.keys(preferences), ["token", "enabled"]);
  assert.equal(preferences.missing, undefined);

  const first = randomId();
  const second = randomId();
  assert.match(first, /^blast-[0-9a-z]+$/);
  assert.notEqual(first, second);
});

test("preserves declared preference metadata and values without defaults", () => {
  const probe = createContext();
  probe.context.descriptor.preferenceMetadata = {
    region: {
      name: "region",
      type: "dropdown",
      required: true,
      title: "Region",
      description: "Choose a region",
      data: [
        { title: "United States", value: "us" },
        { title: "Europe", value: "eu" },
      ],
    },
  };
  configureRaycastCompat(probe.context);

  assert.deepEqual(preferences.region, {
    name: "region",
    type: "dropdown",
    required: true,
    title: "Region",
    description: "Choose a region",
    data: [
      { title: "United States", value: "us" },
      { title: "Europe", value: "eu" },
    ],
  });
  assert.deepEqual(Object.keys(preferences), ["region", "token", "enabled"]);
  assert.equal(preferences.token.value, "secret");
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

test("legacy aliases preserve form submission, storage, image masks, and push lifecycle", async () => {
  const probe = createContext({ storageProvider: createInMemoryLocalStorageProvider() });
  const submitted = [];
  const lifecycle = [];
  const renderer = renderCommand(probe.context, () =>
    createElement(
      Form,
      {
        actions: createElement(
          ActionPanel,
          null,
          createElement(SubmitFormAction, { onSubmit: (values) => submitted.push(values) }),
          createElement(PushAction, {
            title: "Push",
            target: createElement(PushTarget),
            onPush: () => lifecycle.push("push"),
            onPop: () => lifecycle.push("pop"),
          }),
        ),
      },
      createElement(Form.TextField, { id: "name", defaultValue: "Ada" }),
    ),
  );
  await renderer.flush();

  assert.equal(ImageMask.Circle, Image.Mask.Circle);
  await setLocalStorageItem("legacy", "value");
  assert.equal(await getLocalStorageItem("legacy"), "value");

  const root = probe.transactions[0].operations[0].root;
  const actionGroup = root.children[0];
  assert.equal(actionGroup.children[0].props.title, "Submit Form");
  assert.equal(actionGroup.children[1].props.title, "Push");

  probe.dispatch(actionGroup.children[0].props.onAction, { name: "Grace" });
  assert.deepEqual(submitted, [{ name: "Grace" }]);

  probe.dispatch(actionGroup.children[1].props.onAction);
  await renderer.flush();
  assert.equal(probe.transactions.at(-1).operations[0].root.props.navigationTitle, "Pushed");
  assert.deepEqual(lifecycle, ["push"]);

  const pushedRoot = probe.transactions.at(-1).operations[0].root;
  probe.dispatch(pushedRoot.children[0].children[0].children[0].props.onAction);
  await renderer.flush();
  assert.deepEqual(lifecycle, ["push", "pop"]);
});

test("LocalStorage routes through the capability broker", async () => {
  const probe = createContext({ storageProvider: createInMemoryLocalStorageProvider() });
  configureRaycastCompat(probe.context);

  assert.equal(await LocalStorage.getItem("missing"), undefined);
  await LocalStorage.setItem("token", "secret");
  assert.equal(await LocalStorage.getItem("token"), "secret");
  await LocalStorage.setItem("flag", true);
  assert.equal(await LocalStorage.getItem("flag"), true);
  assert.deepEqual(await LocalStorage.allItems(), { token: "secret", flag: true });
  assert.deepEqual(await allLocalStorageItems(), { token: "secret", flag: true });
  await LocalStorage.removeItem("token");
  assert.equal(await LocalStorage.getItem("token"), undefined);
  await LocalStorage.clear();
  assert.equal(await LocalStorage.getItem("flag"), undefined);
  await LocalStorage.removeAllItems();

  assert.deepEqual(
    probe.capabilityRequests.map((request) => request.operation),
    ["get", "set", "get", "set", "get", "getAll", "getAll", "remove", "get", "clear", "get", "clear"],
  );
});

test("rejects malformed LocalStorage.allItems responses", async () => {
  const probe = createContext({ capabilityValues: { "local-storage.getAll": JSON.stringify({ bad: [] }) } });
  configureRaycastCompat(probe.context);

  await assert.rejects(
    () => LocalStorage.allItems(),
    (error) => error instanceof CompatibilityError && /invalid value/.test(error.message),
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
  assert.equal(environment.entryPointName, "index");
  assert.equal(environment.entryPointMode, "view");
  assert.equal(environment.commandMode, "view");
  assert.equal(environment.entryPointType, "command");
  assert.equal(environment.appearance, "dark");
  assert.equal(environment.textSize, "medium");
  assert.equal(environment.isDevelopment, true);
  assert.equal(environment.theme, "dark");
  assert.equal(environment.assetsPath, "assets");
  assert.equal(environment.supportPath, "support");
  assert.equal(environment.canAccess("fixture-api"), false);
});

test("environment preserves manifest identity and host metadata", () => {
  const probe = createContext();
  probe.context.descriptor.extensionName = "Fixture Display Name";
  probe.context.descriptor.ownerOrAuthorName = "fixture-owner";
  probe.context.descriptor.environment = {
    raycastVersion: "1.80.0",
    entryPointType: "tool",
    isDevelopment: false,
    appearance: "light",
    textSize: "large",
  };
  configureRaycastCompat(probe.context);

  const info = environment();
  assert.equal(info.raycastVersion, "1.80.0");
  assert.equal(info.extensionName, "Fixture Display Name");
  assert.equal(info.ownerOrAuthorName, "fixture-owner");
  assert.equal(info.entryPointType, "tool");
  assert.equal(info.isDevelopment, false);
  assert.equal(info.appearance, "light");
  assert.equal(info.theme, "light");
  assert.equal(info.textSize, "large");
  assert.equal(environment.entryPointType, "tool");
  assert.equal(environment.appearance, "light");
});

test("environment preserves the descriptor entry point mode", () => {
  const probe = createContext();
  configureRaycastCompat(probe.context);

  for (const mode of ["no-view", "view", "menu-bar"]) {
    probe.context.descriptor.entryPointMode = mode;
    assert.equal(environment().entryPointMode, mode);
    assert.equal(environment.commandMode, mode);
  }
});

test("environment delegates canAccess to a host policy with stable API names", () => {
  const requests = [];
  const probe = createContext({
    canAccess: (api, apiName) => {
      requests.push({ api, apiName });
      return apiName === "AI" || apiName === "getSelectedText";
    },
  });
  configureRaycastCompat(probe.context);

  assert.equal(environment.canAccess(AI), true);
  assert.equal(environment.canAccess("AI"), true);
  assert.equal(environment.canAccess(getSelectedText), true);
  assert.equal(environment.canAccess(BrowserExtension), false);
  assert.equal(environment.canAccess({}), false);
  assert.deepEqual(
    requests.map(({ apiName }) => apiName),
    ["AI", "AI", "getSelectedText", "BrowserExtension", undefined],
  );
  assert.equal(requests[0].api, AI);
  assert.equal(requests[2].api, getSelectedText);
});

test("environment rejects a non-boolean canAccess policy response", () => {
  const probe = createContext({ canAccess: () => "granted" });
  configureRaycastCompat(probe.context);

  assert.throws(
    () => environment.canAccess(AI),
    (error) =>
      error instanceof CompatibilityError &&
      /must return a boolean/.test(error.message) &&
      error.details.apiName === "AI" &&
      error.details.result === "granted",
  );
});

test("routes WindowManagement discovery and bounds through capabilities", async () => {
  const activeWindow = {
    id: "window-1",
    application: {
      name: "Terminal",
      localizedName: "Terminal",
      path: "/System/Applications/Utilities/Terminal.app",
      bundleId: "com.apple.Terminal",
    },
    bounds: {
      position: { x: 0, y: 0 },
      size: { width: 960, height: 1080 },
    },
    desktopId: "desktop-1",
    fullScreenSettable: true,
    resizable: true,
    positionable: true,
    active: true,
  };
  const desktop = {
    size: { width: 1920, height: 1080 },
    id: "desktop-1",
    screenId: "screen-1",
    active: true,
    type: "User",
  };
  const probe = createContext({
    capabilityValues: {
      "window-management.getActiveWindow": JSON.stringify(activeWindow),
      "window-management.getWindowsOnActiveDesktop": JSON.stringify([activeWindow]),
      "window-management.getDesktops": JSON.stringify([desktop]),
      "window-management.setWindowBounds": undefined,
    },
  });
  configureRaycastCompat(probe.context);

  assert.deepEqual(await WindowManagement.getActiveWindow(), activeWindow);
  assert.deepEqual(await WindowManagement.getWindowsOnActiveDesktop(), [activeWindow]);
  assert.deepEqual(await WindowManagement.getDesktops(), [desktop]);
  await WindowManagement.setWindowBounds({
    id: "window-1",
    desktopId: "desktop-1",
    bounds: { position: { x: 100 }, size: { width: 800, height: 600 } },
  });

  assert.deepEqual(probe.capabilityRequests, [
    { capability: "window-management", operation: "getActiveWindow" },
    { capability: "window-management", operation: "getWindowsOnActiveDesktop" },
    { capability: "window-management", operation: "getDesktops" },
    {
      capability: "window-management",
      operation: "setWindowBounds",
      arguments: {
        optionsJSON: JSON.stringify({
          id: "window-1",
          bounds: { position: { x: 100 }, size: { width: 800, height: 600 } },
          desktopId: "desktop-1",
        }),
      },
    },
  ]);
  assert.equal(WindowManagement.DesktopType.User, "User");
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
  assert.deepEqual(item.props, { title: "First", icon: "circle-16", iconTintColor: "raycast-red" });

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

test("routes ActionPanel.Submenu search and open callbacks", async () => {
  const probe = createContext();
  const searches = [];
  let opened = 0;
  const renderer = renderCommand(probe.context, () =>
    createElement(
      List,
      null,
      createElement(
        List.Item,
        { title: "Host" },
        createElement(
          ActionPanel,
          null,
          createElement(
            ActionPanel.Submenu,
            {
              id: "more",
              title: "More",
              filtering: { keepSectionOrder: true },
              isLoading: true,
              throttle: true,
              onSearchTextChange: (text) => searches.push(text),
              onOpen: () => opened++,
            },
            createElement(Action, { id: "child", title: "Child", onAction: () => {} }),
          ),
        ),
      ),
    ),
  );
  await renderer.flush();

  const submenu = probe.transactions[0].operations[0].root.children[0].children[0].children[0];
  assert.deepEqual(submenu.props, {
    id: "more",
    title: "More",
    filtering: true,
    filteringKeepSectionOrder: true,
    isLoading: true,
    throttle: true,
    onSearchTextChange: submenu.props.onSearchTextChange,
    onOpen: submenu.props.onOpen,
  });
  assert.deepEqual(submenu.children[0].props, {
    id: "child",
    title: "Child",
    onAction: submenu.children[0].props.onAction,
  });

  probe.dispatch(submenu.props.onSearchTextChange, { searchText: "needle" });
  probe.dispatch(submenu.props.onOpen);
  assert.deepEqual(searches, ["needle"]);
  assert.equal(opened, 1);
});

test("routes measured AI, command metadata, and OAuth boundaries", async () => {
  const tokenUpdatedAt = new Date().toISOString();
  const probe = createContext({
    capabilityValues: {
      "ai.ask": "fixture answer",
      "oauth.authorizationRequest": JSON.stringify({
        clientId: "fixture-client",
        codeChallenge: "fixture-challenge",
        codeVerifier: "fixture-verifier",
        state: "fixture-state",
        redirectURI: "https://raycast.com/redirect?packageName=fixture.extension",
      }),
      "oauth.authorize": JSON.stringify({ authorizationCode: "fixture-code" }),
      "oauth.getTokens": JSON.stringify({
        accessToken: "fixture-access",
        refreshToken: "fixture-refresh",
        expiresIn: 3600,
        scope: "read write",
        updatedAt: tokenUpdatedAt,
      }),
    },
  });
  configureRaycastCompat(probe.context);

  const chunks = [];
  const aiResult = AI.ask("Summarize this", {
    creativity: 4,
    model: AI.Model["OpenAI_GPT4o-mini"],
  });
  aiResult.on("data", (chunk) => chunks.push(chunk));
  assert.equal(await aiResult, "fixture answer");
  assert.deepEqual(chunks, ["fixture answer"]);

  await updateCommandMetadata({ subtitle: "Working" });
  await updateCommandMetadata({ subtitle: null });

  const client = new OAuth.PKCEClient({
    redirectMethod: OAuth.RedirectMethod.Web,
    providerName: "Fixture OAuth",
    providerId: "fixture-oauth",
    providerIcon: {
      source: { light: "oauth-light.png", dark: "oauth-dark.png" },
      fallback: { light: "oauth-fallback-light.png", dark: "oauth-fallback-dark.png" },
      mask: Image.Mask.Circle,
      tintColor: { light: "#111111", dark: "#eeeeee", adjustContrast: true },
    },
    description: "Connect the fixture account",
  });
  const request = await client.authorizationRequest({
    endpoint: "https://example.com/oauth/authorize",
    clientId: "fixture-client",
    scope: "read write",
    extraParameters: { audience: "fixture" },
  });
  const authorizationURL = new URL(request.toURL());
  assert.equal(authorizationURL.searchParams.get("client_id"), "fixture-client");
  assert.equal(authorizationURL.searchParams.get("code_challenge"), "fixture-challenge");
  assert.equal(authorizationURL.searchParams.get("audience"), "fixture");
  assert.deepEqual(await client.authorize(request), { authorizationCode: "fixture-code" });
  await client.setTokens({ accessToken: "new-access", scope: ["read", "write"], expiresIn: 60 });
  const tokens = await client.getTokens();
  assert.equal(tokens.accessToken, "fixture-access");
  assert.equal(tokens.isExpired(), false);
  await client.removeTokens();

  assert.deepEqual(probe.capabilityRequests, [
    {
      capability: "ai",
      operation: "ask",
      arguments: { prompt: "Summarize this", creativity: 2, model: "openai-gpt-4o-mini" },
    },
    { capability: "command", operation: "updateMetadata", arguments: { subtitle: "Working" } },
    { capability: "command", operation: "updateMetadata", arguments: { clear: true } },
    {
      capability: "oauth",
      operation: "authorizationRequest",
      arguments: {
        providerId: "fixture-oauth",
        providerName: "Fixture OAuth",
        redirectMethod: "web",
        endpoint: "https://example.com/oauth/authorize",
        clientId: "fixture-client",
        scope: "read write",
        providerIcon: "oauth-light.png",
        providerIconDark: "oauth-dark.png",
        providerIconFallback: "oauth-fallback-light.png",
        providerIconFallbackDark: "oauth-fallback-dark.png",
        providerIconMask: "circle",
        providerIconTintColor: "#111111",
        providerIconTintColorDark: "#eeeeee",
        providerIconTintColorAdjustContrast: true,
        description: "Connect the fixture account",
        extraParametersJSON: '{"audience":"fixture"}',
      },
    },
    {
      capability: "oauth",
      operation: "authorize",
      arguments: {
        providerId: "fixture-oauth",
        url: "https://example.com/oauth/authorize?client_id=fixture-client&response_type=code&redirect_uri=https%3A%2F%2Fraycast.com%2Fredirect%3FpackageName%3Dfixture.extension&scope=read+write&state=fixture-state&code_challenge=fixture-challenge&code_challenge_method=S256&audience=fixture",
      },
    },
    {
      capability: "oauth",
      operation: "setTokens",
      arguments: {
        providerId: "fixture-oauth",
        tokensJSON: '{"accessToken":"new-access","expiresIn":60,"scope":"read write"}',
      },
    },
    { capability: "oauth", operation: "getTokens", arguments: { providerId: "fixture-oauth" } },
    { capability: "oauth", operation: "removeTokens", arguments: { providerId: "fixture-oauth" } },
  ]);
});

test("rejects invalid OAuth provider icons before the host boundary", async () => {
  const probe = createContext();
  configureRaycastCompat(probe.context);
  const client = new OAuth.PKCEClient({
    redirectMethod: OAuth.RedirectMethod.Web,
    providerName: "Fixture OAuth",
    providerIcon: { source: "oauth.png", mask: "square" },
  });

  await assert.rejects(
    () =>
      client.authorizationRequest({
        endpoint: "https://example.com/oauth/authorize",
        clientId: "fixture-client",
        scope: "read",
      }),
    (error) => error instanceof CompatibilityError && /image mask/.test(error.message),
  );
  assert.deepEqual(probe.capabilityRequests, []);
});

test("mirrors the pinned AI model catalog while keeping unknown names extensible", () => {
  assert.equal(Object.keys(AI.Model).length, 159);
  assert.equal(AI.Model["OpenAI_GPT-4.1"], "openai-gpt-4.1");
  assert.equal(AI.Model["Anthropic_Claude_4.5_Haiku"], "anthropic-claude-4-5-haiku");
  assert.equal(AI.Model["OpenAI_GPT-5.1_Codex"], "openai-gpt-5.3-codex");
  assert.equal(AI.Model["xAI_Grok-4.1_Fast"], "xai-grok-4.5");
  assert.equal(AI.Model.OpenAI_GPT4_Turbo, "openai-gpt-4-turbo");
  assert.equal(AI.Model.Future_Model, "Future_Model");
});

test("routes browser, search, trash, and legacy toast boundaries", async () => {
  const probe = createContext({
    capabilityValues: {
      "browser-extension.getTabs": JSON.stringify([
        { id: 7, url: "https://example.com", title: "Example", active: true },
        { id: 8, url: "https://example.org", active: false },
      ]),
      "browser-extension.getContent": "Fixture page content",
    },
  });
  configureRaycastCompat(probe.context);

  assert.equal(ToastStyle.Success, "SUCCESS");
  assert.deepEqual(await BrowserExtension.getTabs(), [
    { id: 7, url: "https://example.com", title: "Example", active: true },
    { id: 8, url: "https://example.org", active: false },
  ]);
  assert.equal(
    await BrowserExtension.getContent({ format: "text", cssSelector: "#title", tabId: 7 }),
    "Fixture page content",
  );
  await clearSearchBar({ forceScrollToTop: true });
  await trash("/tmp/fixture-one");
  await trash([new URL("file:///tmp/fixture-two"), new TextEncoder().encode("/tmp/fixture-three")]);
  await showToast(ToastStyle.Success, "Boundary ready");

  assert.deepEqual(probe.capabilityRequests, [
    { capability: "browser-extension", operation: "getTabs" },
    {
      capability: "browser-extension",
      operation: "getContent",
      arguments: { format: "text", cssSelector: "#title", tabId: 7 },
    },
    { capability: "navigation", operation: "clearSearchBar", arguments: { forceScrollToTop: true } },
    { capability: "filesystem", operation: "trash", arguments: { pathsJSON: '["/tmp/fixture-one"]' } },
    {
      capability: "filesystem",
      operation: "trash",
      arguments: { pathsJSON: '["file:///tmp/fixture-two","/tmp/fixture-three"]' },
    },
  ]);
  assert.equal(probe.toasts[0].style, "success");
});

test("rejects malformed browser results and invalid host-boundary options", async () => {
  const probe = createContext({
    capabilityValues: {
      "browser-extension.getTabs": JSON.stringify([{ id: "not-a-number", url: "https://example.com", active: true }]),
    },
  });
  configureRaycastCompat(probe.context);

  await assert.rejects(
    () => BrowserExtension.getTabs(),
    (error) => error instanceof CompatibilityError,
  );
  await assert.rejects(
    () => BrowserExtension.getContent({ format: "xml" }),
    (error) => error instanceof CompatibilityError,
  );
  await assert.rejects(
    () => BrowserExtension.getContent({ format: "markdown", cssSelector: "#title" }),
    (error) => error instanceof CompatibilityError && /cssSelector with markdown/.test(error.message),
  );
  await assert.rejects(
    () => clearSearchBar({ forceScrollToTop: "yes" }),
    (error) => error instanceof CompatibilityError,
  );
  await assert.rejects(
    () => trash(""),
    (error) => error instanceof CompatibilityError,
  );
});
