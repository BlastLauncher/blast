// The machine-readable capability contract (decision 0010, point 3). Runtime
// APIs request these names; hosts answer or deny them. Keep this list complete:
// packages/runtime/src/api/capabilities.test.ts fails when the sources request
// a name that is missing here or the catalog lists one nobody requests.

/** `"session"` when the engine answers the capability itself, else `"grant"`. */
export type CapabilityScope = "session" | "grant";

export type CapabilitySchemaType =
  | "object"
  | "array"
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "null";

/**
 * The small JSON-Schema subset this catalog uses. It describes the wire shapes
 * for embedders without pulling a schema library into the dependency-free
 * protocol package.
 */
export interface CapabilitySchema {
  readonly type?: CapabilitySchemaType | readonly CapabilitySchemaType[];
  readonly properties?: Readonly<Record<string, CapabilitySchema>>;
  readonly required?: readonly string[];
  readonly items?: CapabilitySchema;
  readonly enum?: readonly (string | number | boolean | null)[];
}

export interface CapabilitySpec {
  readonly scope: CapabilityScope;
  /** One line describing what the capability does. */
  readonly summary: string;
  readonly params: CapabilitySchema;
  readonly result: CapabilitySchema;
  /** `@raycast/api` symbol paths that trigger the request. */
  readonly api: readonly string[];
}

const STRING: CapabilitySchema = { type: "string" };
const NUMBER: CapabilitySchema = { type: "number" };
const BOOLEAN: CapabilitySchema = { type: "boolean" };
const NULL: CapabilitySchema = { type: "null" };
const STRING_ARRAY: CapabilitySchema = { type: "array", items: STRING };
const OBJECT: CapabilitySchema = { type: "object" };
const NO_PARAMS: CapabilitySchema = { type: "object", properties: {} };

/** `Application`, shared by open, selection and window-management results. */
const APPLICATION: CapabilitySchema = {
  type: "object",
  properties: {
    name: STRING,
    localizedName: STRING,
    path: STRING,
    bundleId: STRING,
    windowsAppId: STRING,
  },
  required: ["name", "path"],
};

const DESKTOP: CapabilitySchema = {
  type: "object",
  properties: {
    size: {
      type: "object",
      properties: { width: NUMBER, height: NUMBER },
      required: ["width", "height"],
    },
    id: STRING,
    screenId: STRING,
    active: BOOLEAN,
    type: { type: "string", enum: ["User", "FullScreen"] },
  },
  required: ["size", "id", "screenId", "active", "type"],
};

const WINDOW: CapabilitySchema = {
  type: "object",
  properties: {
    id: STRING,
    application: APPLICATION,
    bounds: { type: ["object", "string"] },
    desktopId: STRING,
    fullScreenSettable: BOOLEAN,
    resizable: BOOLEAN,
    positionable: BOOLEAN,
    active: BOOLEAN,
  },
  required: [
    "id",
    "bounds",
    "desktopId",
    "fullScreenSettable",
    "resizable",
    "positionable",
    "active",
  ],
};

const CLIPBOARD_CONTENT: CapabilitySchema = {
  type: "object",
  properties: { text: STRING, file: STRING, html: STRING, concealed: BOOLEAN },
};

const TOKEN_PROPERTIES = {
  accessToken: STRING,
  refreshToken: STRING,
  idToken: STRING,
  expiresIn: NUMBER,
  scope: { type: ["string", "array"], items: STRING },
} as const;

const TOKENS: CapabilitySchema = {
  type: "object",
  properties: TOKEN_PROPERTIES,
  required: ["accessToken"],
};

const MCP_SERVER: CapabilitySchema = {
  type: "object",
  properties: {
    name: STRING,
    transport: { type: "string", enum: ["stdio", "sse"] },
    icon: STRING,
    description: STRING,
    command: STRING,
    args: STRING_ARRAY,
    env: OBJECT,
    url: STRING,
    headers: OBJECT,
  },
  required: ["name", "transport"],
};

const STORAGE_APIS = [
  "LocalStorage.getItem",
  "getLocalStorageItem",
  "Form.TextField.Props.storeValue",
  "Form.Dropdown.Props.storeValue",
  "List.Dropdown.Props.storeValue",
  "Grid.Dropdown.Props.storeValue",
] as const;

const STORAGE_WRITE_APIS = [
  "LocalStorage.setItem",
  "setLocalStorageItem",
  "Form.TextField.Props.storeValue",
  "Form.Dropdown.Props.storeValue",
  "List.Dropdown.Props.storeValue",
  "Grid.Dropdown.Props.storeValue",
] as const;

const STORAGE_REMOVE_APIS = [
  "LocalStorage.removeItem",
  "removeLocalStorageItem",
  "Form.TextField.Props.storeValue",
  "Form.Dropdown.Props.storeValue",
  "List.Dropdown.Props.storeValue",
  "Grid.Dropdown.Props.storeValue",
] as const;

/**
 * Every capability the runtime can request, keyed by wire name. Params and
 * results are the shapes the runtime sends and accepts, not the full Raycast
 * API types.
 */
export const CAPABILITIES = {
  "storage.get": {
    scope: "session",
    summary: "Reads a LocalStorage or internal storage key.",
    params: {
      type: "object",
      properties: { key: STRING, scope: { type: "string", enum: ["blast:internal"] } },
      required: ["key"],
    },
    result: { type: ["string", "number", "boolean", "null"] },
    api: STORAGE_APIS,
  },
  "storage.set": {
    scope: "session",
    summary: "Writes a LocalStorage or internal storage key.",
    params: {
      type: "object",
      properties: {
        key: STRING,
        value: { type: ["string", "number", "boolean"] },
        scope: { type: "string", enum: ["blast:internal"] },
      },
      required: ["key", "value"],
    },
    result: NULL,
    api: STORAGE_WRITE_APIS,
  },
  "storage.remove": {
    scope: "session",
    summary: "Removes a LocalStorage, internal storage or form draft key.",
    params: {
      type: "object",
      properties: { key: STRING, scope: { type: "string", enum: ["blast:internal"] } },
      required: ["key"],
    },
    result: NULL,
    api: STORAGE_REMOVE_APIS,
  },
  "storage.all": {
    scope: "session",
    summary: "Reads every LocalStorage entry for the extension.",
    params: NO_PARAMS,
    result: OBJECT,
    api: ["LocalStorage.allItems", "allLocalStorageItems"],
  },
  "storage.clear": {
    scope: "session",
    summary: "Clears every LocalStorage entry for the extension.",
    params: NO_PARAMS,
    result: NULL,
    api: ["LocalStorage.clear", "clearLocalStorage"],
  },
  "oauth.tokens.get": {
    scope: "session",
    summary: "Reads the stored OAuth token set for a provider.",
    params: { type: "object", properties: { providerId: STRING }, required: ["providerId"] },
    result: { type: ["object", "null"], properties: TOKEN_PROPERTIES },
    api: ["OAuth.PKCEClient.getTokens"],
  },
  "oauth.tokens.set": {
    scope: "session",
    summary: "Stores an OAuth token set for a provider.",
    params: {
      type: "object",
      properties: { providerId: STRING, tokens: TOKENS },
      required: ["providerId", "tokens"],
    },
    result: NULL,
    api: ["OAuth.PKCEClient.setTokens"],
  },
  "oauth.tokens.remove": {
    scope: "session",
    summary: "Removes the stored OAuth token set for a provider.",
    params: { type: "object", properties: { providerId: STRING }, required: ["providerId"] },
    result: NULL,
    api: ["OAuth.PKCEClient.removeTokens"],
  },
  "oauth.authorize": {
    scope: "grant",
    summary: "Asks the client to run an OAuth authorization flow and return a code.",
    params: {
      type: "object",
      properties: {
        url: STRING,
        providerName: STRING,
        providerId: STRING,
        redirectMethod: { type: "string" },
        providerIcon: STRING,
        description: STRING,
      },
      required: ["url", "providerName", "providerId", "redirectMethod"],
    },
    result: {
      type: "object",
      properties: { authorizationCode: STRING },
      required: ["authorizationCode"],
    },
    api: ["OAuth.PKCEClient.authorize"],
  },
  "ai.ask": {
    scope: "session",
    summary: "Asks the extension's own AI provider, or a supplied handler, for text.",
    params: {
      type: "object",
      properties: {
        prompt: STRING,
        model: { type: ["string", "object"], properties: { id: STRING } },
        creativity: { type: ["string", "number"] },
      },
      required: ["prompt"],
    },
    result: STRING,
    api: ["AI.ask"],
  },
  "ai.models.refresh": {
    scope: "session",
    summary: "Re-lists the extension's own AI provider models.",
    params: NO_PARAMS,
    result: NULL,
    api: ["AI.refreshModels"],
  },
  "ai.decide": {
    scope: "grant",
    summary: "Asks a client for typed answers to experimental decision questions.",
    params: {
      type: "object",
      properties: {
        state: STRING,
        questions: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["noul", "score", "choice"] },
            instructions: STRING,
            criteria: { type: ["array", "object"] },
          },
          required: ["type", "instructions"],
        },
      },
      required: ["state", "questions"],
    },
    result: OBJECT,
    api: ["AI.experimental_decide"],
  },
  "browser.tabs": {
    scope: "grant",
    summary: "Lists the browser tabs a client chooses to expose.",
    params: NO_PARAMS,
    result: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: NUMBER,
          url: STRING,
          title: STRING,
          favicon: STRING,
          active: BOOLEAN,
        },
        required: ["id", "url", "active"],
      },
    },
    api: ["BrowserExtension.getTabs"],
  },
  "browser.content": {
    scope: "grant",
    summary: "Returns the content of a browser tab.",
    params: {
      type: "object",
      properties: {
        cssSelector: STRING,
        tabId: NUMBER,
        format: { type: "string", enum: ["html", "text", "markdown"] },
      },
    },
    result: STRING,
    api: ["BrowserExtension.getContent"],
  },
  "clipboard.copy": {
    scope: "grant",
    summary: "Copies text, HTML or a file path to the clipboard.",
    params: CLIPBOARD_CONTENT,
    result: NULL,
    api: ["Clipboard.copy", "Action.CopyToClipboard", "ActionPanel.Item.CopyToClipboard"],
  },
  "clipboard.clear": {
    scope: "grant",
    summary: "Clears the clipboard.",
    params: NO_PARAMS,
    result: NULL,
    api: ["Clipboard.clear"],
  },
  "clipboard.paste": {
    scope: "grant",
    summary: "Pastes text, HTML or a file path into the frontmost application.",
    params: CLIPBOARD_CONTENT,
    result: NULL,
    api: ["Clipboard.paste", "Action.Paste", "ActionPanel.Item.Paste"],
  },
  "clipboard.read": {
    scope: "grant",
    summary: "Reads the clipboard, optionally at a history offset.",
    params: {
      type: "object",
      properties: { offset: { type: "integer", enum: [0, 1, 2, 3, 4, 5] } },
    },
    result: {
      type: "object",
      properties: { text: STRING, file: STRING, html: STRING },
      required: ["text"],
    },
    api: ["Clipboard.read", "Clipboard.readText"],
  },
  "open.url": {
    scope: "grant",
    summary: "Opens an HTTP(S) URL, optionally with a named application.",
    params: {
      type: "object",
      properties: { url: STRING, application: { type: ["string", "object"] } },
      required: ["url"],
    },
    result: NULL,
    api: ["open", "Action.Open", "Action.OpenWith", "Action.OpenInBrowser"],
  },
  "open.path": {
    scope: "grant",
    summary: "Opens a file or folder, optionally with a named application.",
    params: {
      type: "object",
      properties: { path: STRING, application: { type: ["string", "object"] } },
      required: ["path"],
    },
    result: NULL,
    api: ["open", "Action.Open", "Action.OpenWith"],
  },
  "selection.text": {
    scope: "grant",
    summary: "Returns the selected text; an empty string means nothing is selected.",
    params: NO_PARAMS,
    result: STRING,
    api: ["getSelectedText"],
  },
  "selection.files": {
    scope: "grant",
    summary: "Returns the selected file-system items.",
    params: NO_PARAMS,
    result: { type: "array", items: { type: "object", properties: { path: STRING } } },
    api: ["getSelectedFinderItems"],
  },
  "applications.frontmost": {
    scope: "grant",
    summary: "Returns the frontmost application.",
    params: NO_PARAMS,
    result: APPLICATION,
    api: ["getFrontmostApplication"],
  },
  "applications.list": {
    scope: "grant",
    summary: "Lists installed applications, optionally filtered by path.",
    params: { type: "object", properties: { path: STRING } },
    result: { type: "array", items: APPLICATION },
    api: ["getApplications"],
  },
  "applications.default": {
    scope: "grant",
    summary: "Returns the application the machine would open a path with.",
    params: { type: "object", properties: { path: STRING }, required: ["path"] },
    result: APPLICATION,
    api: ["getDefaultApplication"],
  },
  "finder.show": {
    scope: "grant",
    summary: "Reveals a file or folder in the file manager.",
    params: { type: "object", properties: { path: STRING }, required: ["path"] },
    result: NULL,
    api: ["showInFinder", "Action.ShowInFinder"],
  },
  trash: {
    scope: "grant",
    summary: "Moves files or folders to the trash.",
    params: {
      type: "object",
      properties: { paths: STRING_ARRAY },
      required: ["paths"],
    },
    result: NULL,
    api: ["trash", "Action.Trash"],
  },
  "window.desktops": {
    scope: "grant",
    summary: "Lists desktops across all screens.",
    params: NO_PARAMS,
    result: { type: "array", items: DESKTOP },
    api: ["WindowManagement.getDesktops"],
  },
  "window.active": {
    scope: "grant",
    summary: "Returns the active window.",
    params: NO_PARAMS,
    result: WINDOW,
    api: ["WindowManagement.getActiveWindow"],
  },
  "window.list": {
    scope: "grant",
    summary: "Lists the windows on the active desktop.",
    params: NO_PARAMS,
    result: { type: "array", items: WINDOW },
    api: ["WindowManagement.getWindowsOnActiveDesktop"],
  },
  "window.setBounds": {
    scope: "grant",
    summary: "Moves, resizes or makes a window fullscreen.",
    params: {
      type: "object",
      properties: {
        id: STRING,
        bounds: { type: ["object", "string"] },
        desktopId: STRING,
      },
      required: ["id", "bounds"],
    },
    result: NULL,
    api: ["WindowManagement.setWindowBounds"],
  },
  "preferences.open": {
    scope: "grant",
    summary: "Asks the client to open extension or command preferences.",
    params: {
      type: "object",
      properties: { scope: { type: "string", enum: ["extension", "command"] } },
      required: ["scope"],
    },
    result: NULL,
    api: ["openExtensionPreferences", "openCommandPreferences"],
  },
  "command.launch": {
    scope: "grant",
    summary: "Launches another command, passing arguments and launch context.",
    params: {
      type: "object",
      properties: {
        name: STRING,
        type: { type: "string", enum: ["userInitiated", "background"] },
        extensionName: STRING,
        ownerOrAuthorName: STRING,
        arguments: OBJECT,
        context: OBJECT,
        fallbackText: STRING,
      },
      required: ["name", "type"],
    },
    result: NULL,
    api: ["launchCommand"],
  },
  "command.metadata": {
    scope: "grant",
    summary: "Updates the command's subtitle in the client.",
    params: {
      type: "object",
      properties: { subtitle: { type: ["string", "null"] } },
    },
    result: NULL,
    api: ["updateCommandMetadata"],
  },
  "snippet.create": {
    scope: "grant",
    summary: "Creates a snippet from text, a name and a keyword.",
    params: {
      type: "object",
      properties: { text: STRING, name: STRING, keyword: STRING },
      required: ["text"],
    },
    result: NULL,
    api: ["Action.CreateSnippet"],
  },
  "quicklink.create": {
    scope: "grant",
    summary: "Creates a quicklink from a link and optional metadata.",
    params: {
      type: "object",
      properties: {
        link: STRING,
        name: STRING,
        icon: STRING,
        application: { type: ["string", "object"] },
      },
      required: ["link"],
    },
    result: NULL,
    api: ["Action.CreateQuicklink"],
  },
  "quicklook.toggle": {
    scope: "grant",
    summary: "Toggles Quick Look for the client's selected item.",
    params: NO_PARAMS,
    result: NULL,
    api: ["Action.ToggleQuickLook"],
  },
  "mcp.install": {
    scope: "grant",
    summary: "Installs an MCP server descriptor.",
    params: { type: "object", properties: { server: MCP_SERVER }, required: ["server"] },
    result: NULL,
    api: ["Action.InstallMCPServer"],
  },
} as const satisfies Readonly<Record<string, CapabilitySpec>>;

export type CapabilityName = keyof typeof CAPABILITIES;

/** Whether a wire name names a capability in `CAPABILITIES`. */
export function isCapabilityName(name: string): name is CapabilityName {
  return Object.hasOwn(CAPABILITIES, name);
}
