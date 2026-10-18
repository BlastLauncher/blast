import { createElement, type ReactNode } from "react";
import { copy, paste, type ClipboardContent } from "./clipboard.ts";
import { requestCapability } from "./capability.ts";
import { useNavigation } from "./navigation.ts";
import { SubmitForm } from "./form.ts";
import { ActionStyle, DatePickerType_2, Icon } from "./enums.generated.ts";
import { applicationParam, open, type Application } from "./open.ts";
import type { ImageLike, Shortcut } from "./types.ts";
import type { JsonValue } from "../reconciler/index.ts";

export type ActionStyle = (typeof ActionStyle)[keyof typeof ActionStyle];

export interface ActionProps {
  /** The title displayed for the Action. */
  title: string;
  /** The icon displayed for the Action. */
  icon?: ImageLike;
  /** Defines the visual style of the Action. */
  style?: ActionStyle;
  /** The keyboard shortcut for the Action. */
  shortcut?: Shortcut;
  /**
   * Indicates whether the Action should be focused automatically when its
   * ActionPanel opens.
   */
  autoFocus?: boolean;
  /** Callback that is triggered when the Action is selected. */
  onAction?: () => void;
}

export interface CopyToClipboardProps {
  /** The contents that will be copied to the clipboard. */
  content: string | number | ClipboardContent;
  /** An optional title for the Action. @defaultValue `"Copy to Clipboard"` */
  title?: string;
  /** An optional icon displayed for the Action. */
  icon?: ImageLike;
  /** The keyboard shortcut for the Action. */
  shortcut?: Shortcut;
  /** Indicates whether the content should be treated as confidential. */
  concealed?: boolean;
  /** Callback when the content was copied to clipboard. */
  onCopy?: (content: string | number | ClipboardContent) => void;
}

/** The value type of `Action.PickDate.Type`. */
export type DatePickerTypeValue = (typeof DatePickerType_2)[keyof typeof DatePickerType_2];

/** `PickDateProps` from the declarations (`Action.PickDate`). */
export interface PickDateProps {
  /** A title for the Action. */
  title: string;
  /** The icon displayed for the Action. @defaultValue `Icon.Calendar` */
  icon?: ImageLike;
  /** The keyboard shortcut for the Action. */
  shortcut?: Shortcut;
  /** Callback when the date was picked. */
  onChange: (date: Date | null) => void;
  /** What types of date components can be picked. @defaultValue `Type.DateTime` */
  type?: DatePickerTypeValue;
  /** The minimum date (inclusive) allowed for selection. */
  min?: Date;
  /** The maximum date (inclusive) allowed for selection. */
  max?: Date;
}

// `isFullDay` from the declarations: a date without a local time component is
// a full day.
function isFullDay(date?: Date | null): boolean {
  if (!date || Number.isNaN(date.getTime())) return false;
  return (
    date.getHours() === 0 &&
    date.getMinutes() === 0 &&
    date.getSeconds() === 0 &&
    date.getMilliseconds() === 0
  );
}

export const PickDate = Object.assign(
  function PickDate(props: PickDateProps) {
    const { onChange, min, max, ...rest } = props;
    return createElement("Action.PickDate", {
      ...rest,
      icon: rest.icon ?? Icon.Calendar,
      // Dates arrive from clients as ISO strings; extension callbacks see
      // Dates (the same wire rule as Form.DatePicker).
      onChange: (value: JsonValue) => onChange(typeof value === "string" ? new Date(value) : null),
      // `Date` objects cannot cross the wire: the bounds travel as ISO strings.
      ...(min === undefined ? {} : { min: min.toISOString() }),
      ...(max === undefined ? {} : { max: max.toISOString() }),
    });
  },
  // `Action.PickDate.Type` and `.isFullDay` are members, exactly as declared.
  { Type: DatePickerType_2, isFullDay },
);

export const Action = Object.assign(
  function Action(props: ActionProps) {
    return createElement("Action", props);
  },
  {
    CopyToClipboard,
    CreateQuicklink,
    CreateSnippet,
    InstallMCPServer,
    Open,
    OpenInBrowser,
    OpenWith,
    Paste,
    PickDate,
    Push,
    ShowInFinder,
    SubmitForm,
    ToggleQuickLook,
    Trash,
    Style: ActionStyle,
  },
);

export function CopyToClipboard(props: CopyToClipboardProps) {
  const { content, onCopy, title, ...rest } = props;
  // `content` stays in the runtime: clipboard payloads (possibly concealed
  // secrets) must not be broadcast to clients in the scene.
  return createElement("Action.CopyToClipboard", {
    ...rest,
    title: title ?? "Copy to Clipboard",
    onAction: () => copy(content).then(() => onCopy?.(content)),
  });
}

export interface OpenInBrowserProps {
  url: string;
  title?: string;
  icon?: ImageLike;
  shortcut?: Shortcut;
  onOpen?: (url: string) => void;
}

export interface PasteProps {
  content: string | number | ClipboardContent;
  title?: string;
  icon?: ImageLike;
  shortcut?: Shortcut;
  onPaste?: (content: string | number | ClipboardContent) => void;
}

export function OpenInBrowser(props: OpenInBrowserProps) {
  const { url, onOpen, title, icon, ...rest } = props;
  return createElement("Action.OpenInBrowser", {
    ...rest,
    title: title ?? "Open in Browser",
    icon: icon ?? Icon.Globe,
    onAction: async () => {
      await requestCapability("open.url", { url });
      onOpen?.(url);
    },
  });
}

export function Paste(props: PasteProps) {
  const { content, onPaste, title, icon, ...rest } = props;
  return createElement("Action.Paste", {
    ...rest,
    title: title ?? "Paste in Active App",
    icon: icon ?? Icon.Clipboard,
    onAction: async () => {
      await paste(content, "Action.Paste");
      onPaste?.(content);
    },
  });
}

export { CopyToClipboard as CopyToClipboardAction, Paste as PasteAction };

export interface PushProps {
  title: string;
  target: ReactNode;
  icon?: ImageLike;
  shortcut?: Shortcut;
  onPush?: () => void;
  onPop?: () => void;
}

export function Push({ target, onPush, onPop, ...props }: PushProps) {
  const { push } = useNavigation();
  return createElement("Action.Push", {
    ...props,
    onAction: () => {
      push(target, onPop);
      onPush?.();
    },
  });
}

export { Push as PushAction };

/** `PathLike`, which the declarations take from `node:fs`. */
export type ActionPathLike = string | Buffer | URL;

/** Normalizes a `PathLike` for the wire; mirrors the check in `applications.ts`. */
function pathParam(path: ActionPathLike, api: string): string {
  if (typeof path !== "string" && !(path instanceof URL) && !Buffer.isBuffer(path)) {
    throw new TypeError(`${api}: path must be a string, Buffer or URL`);
  }
  const value = String(path);
  if (value === "") throw new TypeError(`${api}: path must not be empty`);
  return value;
}

/** `OpenProps` from the declarations (`Action.Open`). */
export interface OpenProps {
  /** The file, folder or URL to open. */
  target: string;
  /** The application name (or identifier/path) to use for opening the file. */
  application?: Application | string;
  /** The title for the Action. */
  title: string;
  /** The icon displayed for the Action. @defaultValue `Icon.Finder` */
  icon?: ImageLike;
  /** The keyboard shortcut for the Action. */
  shortcut?: Shortcut;
  /** Callback when the file or folder was opened. */
  onOpen?: (target: string) => void;
}

export function Open(props: OpenProps) {
  const { target, application, onOpen, ...rest } = props;
  // `target` may be a private path: it reaches the host only through the
  // capability request, never the scene.
  return createElement("Action.Open", {
    ...rest,
    icon: rest.icon ?? Icon.Finder,
    onAction: async () => {
      await open(target, application);
      onOpen?.(target);
    },
  });
}

/** Deprecated alias of `Action.Open`. */
export const OpenAction = Open;

/** `OpenWithProps` from the declarations (`Action.OpenWith`). */
export interface OpenWithProps {
  /** The path to open. */
  path: string;
  /** The title for the Action. @defaultValue `"Open With"` */
  title?: string;
  /** The icon displayed for the Action. @defaultValue `Icon.Upload` */
  icon?: ImageLike;
  /** The keyboard shortcut for the Action. */
  shortcut?: Shortcut;
  /** Callback when the file or folder was opened. */
  onOpen?: (path: string) => void;
}

export function OpenWith(props: OpenWithProps) {
  const { path, onOpen, ...rest } = props;
  // `path` stays private, like every `Action.Open*` payload. The client picks
  // the application, so no application param is sent here.
  return createElement("Action.OpenWith", {
    ...rest,
    title: rest.title ?? "Open With",
    icon: rest.icon ?? Icon.Upload,
    onAction: async () => {
      await open(path);
      onOpen?.(path);
    },
  });
}

/** Deprecated alias of `Action.OpenWith`. */
export const OpenWithAction = OpenWith;

/** `ShowInFinderProps` from the declarations (`Action.ShowInFinder`). */
export interface ShowInFinderProps {
  /** The path to reveal. */
  path: ActionPathLike;
  /** The title for the Action. @defaultValue `"Show in Finder"` */
  title?: string;
  /** The icon displayed for the Action. @defaultValue `Icon.Finder` */
  icon?: ImageLike;
  /** The keyboard shortcut for the Action. */
  shortcut?: Shortcut;
  /** Callback when the file or folder was shown in the Finder. */
  onShow?: (path: ActionPathLike) => void;
}

export function ShowInFinder(props: ShowInFinderProps) {
  const { path, onShow, ...rest } = props;
  return createElement("Action.ShowInFinder", {
    ...rest,
    title: rest.title ?? "Show in Finder",
    icon: rest.icon ?? Icon.Finder,
    onAction: async () => {
      await requestCapability("finder.show", { path: pathParam(path, "Action.ShowInFinder") });
      // The callback sees the value as passed, like the declarations promise.
      onShow?.(path);
    },
  });
}

/** Deprecated alias of `Action.ShowInFinder`. */
export const ShowInFinderAction = ShowInFinder;

/** `TrashProps` from the declarations (`Action.Trash`). */
export interface TrashProps {
  /** The item or items to move to the trash. */
  paths: ActionPathLike | ActionPathLike[];
  /** The title for the Action. @defaultValue `"Move to Trash"` */
  title?: string;
  /** The icon displayed for the Action. @defaultValue `Icon.Trash` */
  icon?: ImageLike;
  /** The keyboard shortcut for the Action. */
  shortcut?: Shortcut;
  /** Callback when all items were moved to the trash. */
  onTrash?: (paths: ActionPathLike | ActionPathLike[]) => void;
}

export function Trash(props: TrashProps) {
  const { paths, onTrash, ...rest } = props;
  const items = Array.isArray(paths) ? paths : [paths];
  return createElement("Action.Trash", {
    ...rest,
    title: rest.title ?? "Move to Trash",
    icon: rest.icon ?? Icon.Trash,
    onAction: async () => {
      await requestCapability("trash", {
        paths: items.map((item) => pathParam(item, "Action.Trash")),
      });
      onTrash?.(paths);
    },
  });
}

/** Deprecated alias of `Action.Trash`. */
export const TrashAction = Trash;

/** `Snippet` from the declarations. */
export interface Snippet {
  /** The snippet contents. */
  text: string;
  /** The snippet name. */
  name?: string;
  /** The keyword to trigger the snippet. */
  keyword?: string;
}

/** `CreateSnippetProps` from the declarations (`Action.CreateSnippet`). */
export interface CreateSnippetProps {
  /** The snippet to create. */
  snippet: Snippet;
  /** The title for the Action. */
  title?: string;
  /** The icon displayed for the Action. */
  icon?: ImageLike;
  /** The keyboard shortcut for the Action. */
  shortcut?: Shortcut;
}

export function CreateSnippet(props: CreateSnippetProps) {
  const { snippet, ...rest } = props;
  // The snippet contents are private: out of the scene, into the capability.
  const params: Record<string, JsonValue> = {
    text: snippet.text,
    ...(snippet.name === undefined ? {} : { name: snippet.name }),
    ...(snippet.keyword === undefined ? {} : { keyword: snippet.keyword }),
  };
  return createElement("Action.CreateSnippet", {
    ...rest,
    // The declarations document no defaults for CreateSnippet; these mirror
    // the built-in action Raycast renders.
    title: rest.title ?? "Create Snippet",
    icon: rest.icon ?? Icon.Snippets,
    onAction: () => requestCapability("snippet.create", params),
  });
}

/** `Quicklink` from the declarations. */
export interface Quicklink {
  /** The icon to display for the quicklink. */
  icon?: (typeof Icon)[keyof typeof Icon];
  /** The URL or file path, optionally including placeholders such as `{Query}`. */
  link: string;
  /** The quicklink name. */
  name?: string;
  /** The application that the quicklink should be opened in. */
  application?: string | Application;
}

/** `CreateQuicklinkProps` from the declarations (`Action.CreateQuicklink`). */
export interface CreateQuicklinkProps {
  /** The quicklink to create. */
  quicklink: Quicklink;
  /** The title for the Action. */
  title?: string;
  /** The icon displayed for the Action. */
  icon?: ImageLike;
  /** The keyboard shortcut for the Action. */
  shortcut?: Shortcut;
}

export function CreateQuicklink(props: CreateQuicklinkProps) {
  const { quicklink, ...rest } = props;
  const params: Record<string, JsonValue> = {
    link: quicklink.link,
    ...(quicklink.name === undefined ? {} : { name: quicklink.name }),
    ...(quicklink.icon === undefined ? {} : { icon: quicklink.icon }),
  };
  const application = applicationParam(quicklink.application);
  if (application !== undefined) params.application = application;
  return createElement("Action.CreateQuicklink", {
    ...rest,
    title: rest.title ?? "Create Quicklink",
    icon: rest.icon ?? Icon.Quicklink,
    onAction: () => requestCapability("quicklink.create", params),
  });
}

/** `ToggleQuickLookProps` from the declarations (`Action.ToggleQuickLook`). */
export interface ToggleQuickLookProps {
  /** The title for the Action. @defaultValue `"Quick Look"` */
  title?: string;
  /** The icon displayed for the Action. @defaultValue `Icon.Eye` */
  icon?: ImageLike;
  /** The keyboard shortcut for the Action. */
  shortcut?: Shortcut;
}

export function ToggleQuickLook(props: ToggleQuickLookProps) {
  // Which file to preview is the client's business (the selected item carries
  // it), so the capability carries no payload.
  return createElement("Action.ToggleQuickLook", {
    title: props.title ?? "Quick Look",
    icon: props.icon ?? Icon.Eye,
    shortcut: props.shortcut,
    onAction: () => requestCapability("quicklook.toggle", {}),
  });
}

/** An `Icon` member, as the declarations type `MCPServer.icon`. */
export type IconValue = (typeof Icon)[keyof typeof Icon];

/** `MCPServer` from the declarations. */
export interface MCPServer {
  /** The icon to display for the MCP server. */
  icon?: IconValue;
  /** The name of the MCP server. */
  name: string;
  /** The description of the MCP server. */
  description?: string;
}

/** `StdioMCPServer`: an MCP server started as a local process. */
export interface StdioMCPServer extends MCPServer {
  transport: "stdio";
  /** The command to run the MCP server. */
  command: string;
  /** The arguments to pass to the MCP server. */
  args?: string[];
  /** The environment variables to pass to the MCP server. */
  env?: Record<string, string>;
}

/** `SSEMCPServer`: an MCP server reached over HTTP. */
export interface SSEMCPServer extends MCPServer {
  transport: "sse";
  /** The URL of the MCP server. */
  url: string;
  /** The HTTP headers to use for network requests to the MCP server. */
  headers?: Record<string, string>;
}

/** `InstallMCPServerProps` from the declarations (`Action.InstallMCPServer`). */
export interface InstallMCPServerProps {
  /** The stdio or SSE server to install. */
  server: StdioMCPServer | SSEMCPServer;
  /** The title for the Action. */
  title?: string;
  /** The icon displayed for the Action. */
  icon?: ImageLike;
  /** The keyboard shortcut for the Action. */
  shortcut?: Shortcut;
}

// The server descriptor is the only payload: rebuilt from the declared fields
// so nothing unserializable or unknown reaches the wire.
function serverParam(server: StdioMCPServer | SSEMCPServer): Record<string, JsonValue> {
  if (typeof server !== "object" || server === null || Array.isArray(server)) {
    throw new TypeError("Action.InstallMCPServer: server must be an object");
  }
  if (server.transport !== "stdio" && server.transport !== "sse") {
    throw new TypeError('Action.InstallMCPServer: server.transport must be "stdio" or "sse"');
  }
  const params: Record<string, JsonValue> = {
    name: server.name,
    transport: server.transport,
  };
  if (server.icon !== undefined) params["icon"] = server.icon;
  if (server.description !== undefined) params["description"] = server.description;
  if (server.transport === "stdio") {
    params["command"] = server.command;
    if (server.args !== undefined) params["args"] = server.args;
    if (server.env !== undefined) params["env"] = server.env;
  } else {
    params["url"] = server.url;
    if (server.headers !== undefined) params["headers"] = server.headers;
  }
  return params;
}

/**
 * Installs an MCP server. Blast runs no MCP client, so this is a capability:
 * the host decides, and a headless run denies it unless granted.
 */
export function InstallMCPServer(props: InstallMCPServerProps) {
  const { server, ...rest } = props;
  return createElement("Action.InstallMCPServer", {
    ...rest,
    title: rest.title ?? "Install MCP Server",
    onAction: () => requestCapability("mcp.install", { server: serverParam(server) }),
  });
}
