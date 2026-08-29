import {
  Children,
  Fragment,
  cloneElement,
  createContext,
  createElement,
  isValidElement,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Context,
  type ReactElement,
  type ReactNode,
} from "react";

import type {
  SceneEventPayload,
  SceneFormValue,
  SceneShortcut,
  SceneTransaction,
  ToastActionPayload,
  ToastOperation,
  ToastPayload,
  ToastStyle as SceneToastStyle,
} from "@blastlauncher/scene";
import { SceneRendererError, createSceneRenderer, type SceneRenderer } from "@blastlauncher/react-renderer";

export { Color, Icon } from "./icon.js";
export type { ColorName, IconName } from "./icon.js";

/**
 * Structured error for API surface that Blast has deliberately not measured
 * or implemented yet. Unsupported behavior never fails silently.
 */
export class CompatibilityError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = "CompatibilityError";
    this.code = "unsupported_api";
    if (details !== undefined) {
      this.details = details;
    }
  }
}

export interface RaycastCompatContext {
  readonly descriptor: {
    readonly extensionId: string;
    readonly commandName: string;
    readonly preferences: Readonly<Record<string, string | number | boolean>>;
    readonly rootDirectory?: string;
  };
  readonly platform: string;
  readonly publish: (transaction: SceneTransaction) => Promise<void>;
  readonly onEvent: (handler: (payload: SceneEventPayload) => void | Promise<void>) => void;
  readonly requestCapability: (request: {
    readonly capability: string;
    readonly operation: string;
    readonly arguments?: Readonly<Record<string, string | number | boolean>>;
  }) => Promise<{ readonly outcome: string; readonly value?: string | number | boolean | null }>;
  readonly showToast: (payload: ToastPayload) => Promise<void>;
}

/**
 * Command state lives on `globalThis` because a bundled extension carries its
 * own copy of this module while the bootstrap configures another; both copies
 * must share one command binding per JavaScript realm.
 */
interface RaycastCompatGlobals {
  context?: RaycastCompatContext;
  launchProps?: LaunchProps;
  navigation?: NavigationApi;
  renderer?: SceneRenderer;
  legacyRenderElement?: ReactElement;
  rendering?: boolean;
  toastEvents?: Map<string, () => void>;
  cacheStores?: Map<string, CacheState>;
}

const compatGlobals: RaycastCompatGlobals = (() => {
  const holder = globalThis as typeof globalThis & { __blastRaycastCompat?: RaycastCompatGlobals };
  holder.__blastRaycastCompat ??= {};
  return holder.__blastRaycastCompat;
})();

/**
 * Binds the adapter to the running command context. The runtime bootstrap
 * calls this before invoking the extension command so module-level API
 * singletons such as `Clipboard` work.
 */
export function configureRaycastCompat(context: RaycastCompatContext): void {
  compatGlobals.context = context;
  delete compatGlobals.launchProps;
  delete compatGlobals.navigation;
  delete compatGlobals.legacyRenderElement;
  compatGlobals.rendering = false;
  compatGlobals.toastEvents ??= new Map();
}

function requireContext(): RaycastCompatContext {
  if (compatGlobals.context === undefined) {
    throw new CompatibilityError("The Raycast compatibility API is not configured for this command");
  }
  return compatGlobals.context;
}

/**
 * Runs a Raycast-style command component: configures the API surface, renders
 * through the scene renderer, and routes scene events back to component
 * callbacks. One command per runtime. Render errors, including structured
 * compatibility errors thrown from components, fail the command loudly.
 */
export function runCommand(
  context: RaycastCompatContext,
  component: (props: LaunchProps) => ReactElement,
  launchProps: LaunchProps = createDefaultLaunchProps(),
): void {
  if (compatGlobals.renderer !== undefined) {
    throw new CompatibilityError("A Raycast command is already running in this runtime");
  }
  const { renderer, takeError } = createCompatRenderer(context);
  compatGlobals.launchProps = launchProps;
  compatGlobals.renderer = renderer;
  renderLoudly(renderer, takeError, () =>
    adaptRootElement(createElement(NavigationHost, { base: component(launchProps) })),
  );
}

/**
 * Raycast command components may be async functions; React client rendering
 * rejects them. The adapter awaits the async root once and renders the
 * resolved element.
 */
function AsyncRootAdapter({
  Component,
  props,
}: {
  readonly Component: (props: Record<string, unknown>) => unknown;
  readonly props: Record<string, unknown>;
}): ReactNode {
  const [resolved, setResolved] = useState<ReactNode>(null);
  useEffect(() => {
    let alive = true;
    void Promise.resolve(Component(props)).then((element) => {
      if (alive) {
        setResolved(isValidElement(element) ? element : null);
      }
    });
    return () => {
      alive = false;
    };
  }, [Component, props]);
  return resolved;
}

function adaptRootElement(element: ReactElement): ReactElement {
  if (
    typeof element.type === "function" &&
    (element.type as unknown as { constructor?: { name?: string } }).constructor?.name === "AsyncFunction"
  ) {
    return createElement(AsyncRootAdapter, {
      Component: element.type as (props: Record<string, unknown>) => unknown,
      props: element.props as Record<string, unknown>,
    });
  }
  return element;
}

/**
 * Renders a Raycast-style scene with a command-provided component factory and
 * returns the renderer for direct observation. Used by tests.
 */
export function renderCommand(
  context: RaycastCompatContext,
  component: (props: LaunchProps) => ReactElement,
  launchProps: LaunchProps = createDefaultLaunchProps(),
): SceneRenderer {
  const { renderer, takeError } = createCompatRenderer(context);
  compatGlobals.launchProps = launchProps;
  compatGlobals.renderer = renderer;
  renderLoudly(renderer, takeError, () =>
    adaptRootElement(createElement(NavigationHost, { base: component(launchProps) })),
  );
  return renderer;
}

function renderLoudly(renderer: SceneRenderer, takeError: () => unknown, component: () => ReactElement): void {
  let renderError: unknown;
  compatGlobals.rendering = true;
  try {
    renderer.render(component());
  } catch (error) {
    renderError = error;
  } finally {
    compatGlobals.rendering = false;
  }
  if (renderError === undefined) {
    const legacyRenderElement = compatGlobals.legacyRenderElement;
    delete compatGlobals.legacyRenderElement;
    if (legacyRenderElement !== undefined) {
      try {
        renderer.render(
          createElement(NavigationHost, { key: `legacy-render-${++legacyRenderCounter}`, base: legacyRenderElement }),
        );
      } catch (error) {
        renderError = error;
      }
    }
  }
  const captured = takeError();
  if (captured !== undefined) {
    throw captured;
  }
  if (renderError !== undefined) {
    throw renderError;
  }
}

/**
 * Compatibility bridge for older commands that call `render(<Command />)`
 * from their default export instead of returning the element. During the
 * initial React render the element is queued to avoid re-entering the
 * reconciler; later calls update the active scene immediately.
 */
export function render(element: ReactNode): void {
  if (!isValidElement(element)) {
    unsupported("render element", { element });
  }
  const renderer = compatGlobals.renderer;
  if (renderer === undefined) {
    throw new CompatibilityError("render requires a running Raycast command");
  }
  if (compatGlobals.rendering) {
    compatGlobals.legacyRenderElement = element;
    return;
  }
  renderer.render(createElement(NavigationHost, { key: `legacy-render-${++legacyRenderCounter}`, base: element }));
}

function createCompatRenderer(context: RaycastCompatContext): {
  renderer: SceneRenderer;
  takeError: () => unknown;
} {
  configureRaycastCompat(context);
  const toastEvents = new Map<string, () => void>();
  compatGlobals.toastEvents = toastEvents;
  let capturedError: unknown;
  let capturedCompatibilityError: unknown;
  const renderer = createSceneRenderer({
    sink: {
      publish: (transaction) => context.publish(transaction),
    },
    onError: (error) => {
      if (error instanceof SceneRendererError && error.code === "empty_scene_root") {
        // The async root adapter commits an empty placeholder before the
        // resolved element arrives.
        return;
      }
      capturedError ??= error;
      if (error instanceof CompatibilityError) {
        capturedCompatibilityError ??= error;
      }
    },
  });
  context.onEvent((payload) => {
    try {
      renderer.dispatchSceneEvent(payload);
    } catch (error) {
      if (!(error instanceof SceneRendererError) || error.code !== "unknown_event") {
        throw error;
      }
      const toastHandler = toastEvents.get(payload.eventId);
      if (toastHandler === undefined) {
        throw error;
      }
      toastHandler();
    }
  });
  return {
    renderer,
    takeError: () => {
      const error = capturedCompatibilityError ?? capturedError;
      capturedError = undefined;
      capturedCompatibilityError = undefined;
      return error;
    },
  };
}

export interface ListProps {
  readonly navigationTitle?: string;
  readonly searchBarPlaceholder?: string;
  readonly isLoading?: boolean;
  readonly children?: ReactNode;
  readonly actions?: ReactNode;
}

export interface ListItemProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly icon?: IconLike;
  readonly children?: ReactNode;
  readonly actions?: ReactNode;
}

export interface ListSectionProps {
  readonly id?: string;
  readonly title?: string;
  readonly subtitle?: string;
  readonly children?: ReactNode;
}

/** @deprecated Use the measured List item props or a component-specific type. */
export type ItemProps = Partial<ListItemProps> & { readonly id: string };

export type GridAspectRatio = "1" | "3/2" | "2/3" | "4/3" | "3/4" | "16/9" | "9/16";
export type GridFit = "contain" | "fill";
export type GridInset = "zero" | "sm" | "md" | "lg";
export type GridItemSize = "small" | "medium" | "large";

export type GridColorLike =
  | string
  | {
      readonly light: string;
      readonly dark: string;
      readonly adjustContrast?: boolean;
    };

export type GridContentLike =
  | IconLike
  | { readonly color: GridColorLike }
  | { readonly value: IconLike | { readonly color: GridColorLike }; readonly tooltip: string };

export interface GridProps {
  readonly navigationTitle?: string;
  readonly searchBarPlaceholder?: string;
  readonly isLoading?: boolean;
  readonly columns?: number;
  readonly itemSize?: GridItemSize;
  readonly aspectRatio?: GridAspectRatio;
  readonly fit?: GridFit;
  readonly inset?: GridInset;
  readonly searchText?: string;
  readonly filtering?: boolean | { readonly keepSectionOrder: boolean };
  readonly throttle?: boolean;
  readonly selectedItemId?: string;
  readonly onSelectionChange?: (id: string | null) => void;
  readonly onSearchTextChange?: (text: string) => void;
  readonly searchBarAccessory?: ReactNode;
  readonly children?: ReactNode;
  readonly actions?: ReactNode;
}

export interface GridItemAccessoryProps {
  readonly icon?: IconLike;
  readonly tooltip?: string;
}

export interface GridItemProps {
  readonly id?: string;
  readonly content: GridContentLike;
  readonly title?: string;
  readonly subtitle?: string;
  readonly keywords?: string[];
  readonly accessory?: GridItemAccessoryProps;
  readonly children?: ReactNode;
  readonly actions?: ReactNode;
}

export interface GridSectionProps {
  readonly title?: string;
  readonly subtitle?: string;
  readonly columns?: number;
  readonly aspectRatio?: GridAspectRatio;
  readonly fit?: GridFit;
  readonly inset?: GridInset;
  readonly children?: ReactNode;
}

export interface GridEmptyViewProps {
  readonly icon?: IconLike;
  readonly title?: string;
  readonly description?: string;
  readonly actions?: ReactNode;
}

export interface GridDropdownItemProps {
  readonly value: string;
  readonly title: string;
  readonly icon?: IconLike;
  readonly keywords?: string[];
}

export interface GridDropdownSectionProps {
  readonly title?: string;
  readonly children?: ReactNode;
}

export interface GridDropdownProps {
  readonly id?: string;
  readonly tooltip: string;
  readonly placeholder?: string;
  readonly storeValue?: boolean;
  readonly value?: string;
  readonly defaultValue?: string;
  readonly onChange?: (value: string) => void;
  readonly children?: ReactNode;
}

export type MenuBarExtraActionEvent = { readonly type: "left-click" | "right-click" };

export interface MenuBarExtraProps {
  readonly isLoading?: boolean;
  readonly title?: string;
  readonly tooltip?: string;
  readonly icon?: IconLike;
  readonly children?: ReactNode;
}

export interface MenuBarExtraItemProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly tooltip?: string;
  readonly icon?: IconLike;
  readonly onAction?: (event: MenuBarExtraActionEvent) => void | Promise<void>;
  readonly shortcut?: ShortcutLike;
  readonly alternate?: ReactElement<MenuBarExtraItemProps>;
}

export interface MenuBarExtraSectionProps {
  readonly title?: string;
  readonly children?: ReactNode;
}

export interface MenuBarExtraSubmenuProps {
  readonly title: string;
  readonly icon?: IconLike;
  readonly children?: ReactNode;
}

export interface MenuBarExtraSeparatorProps {}

export interface DetailProps {
  readonly markdown?: string;
  readonly navigationTitle?: string;
}

export interface ActionPanelProps {
  readonly children?: ReactNode;
  readonly title?: string;
}

export interface SubmenuProps {
  readonly title: string;
  readonly icon?: IconLike;
  readonly shortcut?: ShortcutLike;
  readonly autoFocus?: boolean;
  readonly children?: ReactNode;
}

export interface ActionProps {
  readonly title: string;
  readonly onAction?: (event?: SceneEventPayload) => void;
  readonly icon?: IconLike;
  readonly shortcut?: ShortcutLike;
  readonly style?: ActionStyleLike;
  readonly autoFocus?: boolean;
}

export interface CopyToClipboardProps {
  readonly title?: string;
  readonly content: string | number | Clipboard.Content;
  readonly transient?: boolean;
  readonly concealed?: boolean;
  readonly onCopy?: (content: string | number | Clipboard.Content) => void;
  readonly icon?: IconLike;
  readonly shortcut?: ShortcutLike;
  readonly style?: ActionStyleLike;
  readonly autoFocus?: boolean;
}

/** @deprecated Use `CopyToClipboardProps` or `Action.CopyToClipboard` instead. */
export interface CopyToClipboardActionProps extends CopyToClipboardProps {}

export interface OpenInBrowserProps {
  readonly url: string;
  readonly title?: string;
  readonly icon?: IconLike;
  readonly shortcut?: ShortcutLike;
  readonly onOpen?: (url: string) => void;
}

/** @deprecated Use `OpenInBrowserProps` or `Action.OpenInBrowser` instead. */
export interface OpenInBrowserActionProps extends OpenInBrowserProps {}

export interface OpenProps {
  readonly target: string;
  readonly application?: string | ApplicationLike;
  readonly title: string;
  readonly icon?: IconLike;
  readonly shortcut?: ShortcutLike;
  readonly onOpen?: (target: string) => void;
}

export interface OpenWithProps {
  readonly path: string;
  readonly title?: string;
  readonly icon?: IconLike;
  readonly shortcut?: ShortcutLike;
  readonly onOpen?: (path: string) => void;
}

/** @deprecated Use `OpenProps` or `Action.Open` instead. */
export interface OpenActionProps extends OpenProps {}

/** @deprecated Use `OpenWithProps` or `Action.OpenWith` instead. */
export interface OpenWithActionProps extends OpenWithProps {}

export interface PasteProps {
  readonly content: string | number | Clipboard.Content;
  readonly title?: string;
  readonly icon?: IconLike;
  readonly shortcut?: ShortcutLike;
  readonly onPaste?: (content: string | number | Clipboard.Content) => void;
}

/** @deprecated Use `PasteProps` or `Action.Paste` instead. */
export interface PasteActionProps extends PasteProps {}

export interface IconObject {
  readonly source: string | { readonly light: string; readonly dark: string };
  readonly tintColor?: string;
  readonly fallback?: string | { readonly light: string; readonly dark: string };
  readonly mask?: Image.Mask;
}

export interface FileIcon {
  readonly fileIcon: string;
}

export type IconLike = string | IconObject | FileIcon;

/** Runtime constants and type namespace for Raycast image descriptors. */
export namespace Image {
  export type URL = string;
  export type Asset = string;
  export type Source = URL | Asset | { readonly light: URL | Asset; readonly dark: URL | Asset };
  export type Fallback = Asset | { readonly light: Asset; readonly dark: Asset };
  export type ImageLike = URL | Asset | IconObject;

  export enum Mask {
    Circle = "circle",
    RoundedRectangle = "roundedRectangle",
  }
}

/** @deprecated Use `Image.Mask` instead. */
export type ImageMask = Image.Mask;
/** @deprecated Use `Image.ImageLike` instead. */
export type ImageLike = Image.ImageLike;

/** @deprecated Use `Image.Mask` instead. */
export const ImageMask = Image.Mask;

export type LaunchContext = Readonly<Record<string, unknown>>;
export type LaunchArguments = Readonly<Record<string, unknown>>;

/** The top-level props supplied to a Raycast command on launch. */
export type LaunchProps<
  T extends {
    arguments?: Readonly<Record<string, unknown>>;
    draftValues?: FormValues;
    launchContext?: LaunchContext;
  } = {
    arguments: Readonly<Record<string, unknown>>;
    draftValues: FormValues;
    launchContext?: LaunchContext;
  },
> = {
  readonly launchType: LaunchTypeName;
  readonly arguments: T["arguments"];
  readonly draftValues?: T["draftValues"];
  readonly launchContext?: T["launchContext"];
  readonly fallbackText?: string;
};

/** @deprecated Use `LaunchProps` directly. */
export interface ArgumentsLaunchProps {
  readonly arguments?: LaunchArguments;
}

export interface IntraExtensionLaunchOptions {
  readonly name: string;
  readonly type: LaunchTypeName;
  readonly arguments?: LaunchArguments | null;
  readonly context?: LaunchContext | null;
  readonly fallbackText?: string | null;
}

export interface InterExtensionLaunchOptions extends IntraExtensionLaunchOptions {
  readonly ownerOrAuthorName: string;
  readonly extensionName: string;
}

export type LaunchOptions = IntraExtensionLaunchOptions | InterExtensionLaunchOptions;

export type KeyModifier = "cmd" | "ctrl" | "opt" | "shift" | "alt" | "windows";
export type KeyEquivalent =
  | "a"
  | "b"
  | "c"
  | "d"
  | "e"
  | "f"
  | "g"
  | "h"
  | "i"
  | "j"
  | "k"
  | "l"
  | "m"
  | "n"
  | "o"
  | "p"
  | "q"
  | "r"
  | "s"
  | "t"
  | "u"
  | "v"
  | "w"
  | "x"
  | "y"
  | "z"
  | "0"
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "."
  | ","
  | ";"
  | "="
  | "+"
  | "-"
  | "["
  | "]"
  | "{"
  | "}"
  | "«"
  | "»"
  | "("
  | ")"
  | "/"
  | "\\"
  | "'"
  | "`"
  | "§"
  | "^"
  | "@"
  | "$"
  | "return"
  | "delete"
  | "deleteForward"
  | "tab"
  | "arrowUp"
  | "arrowDown"
  | "arrowLeft"
  | "arrowRight"
  | "pageUp"
  | "pageDown"
  | "home"
  | "end"
  | "space"
  | "escape"
  | "enter"
  | "backspace";
export type ShortcutLike =
  | {
      readonly modifiers: readonly KeyModifier[];
      readonly key: KeyEquivalent;
    }
  | {
      readonly macOS: {
        readonly modifiers: readonly KeyModifier[];
        readonly key: KeyEquivalent;
      };
      readonly Windows: {
        readonly modifiers: readonly KeyModifier[];
        readonly key: KeyEquivalent;
      };
      readonly windows?: {
        readonly modifiers: readonly KeyModifier[];
        readonly key: KeyEquivalent;
      };
    };
export type KeyboardShortcut = ShortcutLike;
export type ActionStyleLike = "regular" | "destructive";
export type AlertActionStyleLike = "default" | "cancel" | "destructive";

export interface AlertActionOptions {
  readonly title: string;
  readonly style?: AlertActionStyleLike;
  readonly onAction?: () => void;
}

export interface AlertOptions {
  readonly title: string;
  readonly icon?: IconLike;
  readonly message?: string;
  readonly primaryAction?: AlertActionOptions;
  readonly dismissAction?: AlertActionOptions;
  readonly rememberUserChoice?: boolean;
}

export interface ApplicationLike {
  readonly name?: string;
  readonly localizedName?: string;
  readonly path?: string;
  readonly bundleId?: string;
  readonly windowsAppId?: string;
}

export interface Application {
  readonly name: string;
  readonly localizedName?: string;
  readonly path: string;
  readonly bundleId?: string;
  readonly windowsAppId?: string;
}

/**
 * Measured Raycast window-management data returned by the host.
 *
 * Results cross the capability boundary as JSON because the V2 capability
 * protocol intentionally carries primitive values only.
 */
export namespace WindowManagement {
  export enum DesktopType {
    User = "User",
    FullScreen = "FullScreen",
  }

  export type Window = {
    readonly id: string;
    readonly application?: Application;
    readonly bounds:
      | {
          readonly position: {
            readonly x: number;
            readonly y: number;
          };
          readonly size: {
            readonly width: number;
            readonly height: number;
          };
        }
      | "fullscreen";
    readonly desktopId: string;
    readonly fullScreenSettable: boolean;
    readonly resizable: boolean;
    readonly positionable: boolean;
    readonly active: boolean;
  };

  export type Desktop = {
    readonly size: {
      readonly width: number;
      readonly height: number;
    };
    readonly id: string;
    readonly screenId: string;
    readonly active: boolean;
    readonly type: DesktopType;
  };

  /** Returns the desktops available across all screens. */
  export async function getDesktops(): Promise<Desktop[]> {
    const response = await callCapability(
      "window-management",
      "getDesktops",
      undefined,
      "WindowManagement.getDesktops",
    );
    const value = parseJSONCapabilityValue(response.value, "WindowManagement.getDesktops");
    if (!Array.isArray(value)) {
      throw new CompatibilityError("The WindowManagement.getDesktops capability returned a non-array", { value });
    }
    return value.map((entry, index) => deserializeWindowDesktop(entry, `WindowManagement.getDesktops result ${index}`));
  }

  /** Returns the active window, or rejects when no active window exists. */
  export async function getActiveWindow(): Promise<Window> {
    const response = await callCapability(
      "window-management",
      "getActiveWindow",
      undefined,
      "WindowManagement.getActiveWindow",
    );
    return deserializeWindow(
      parseJSONCapabilityValue(response.value, "WindowManagement.getActiveWindow"),
      "WindowManagement.getActiveWindow result",
    );
  }

  /** Returns windows on the active desktop. */
  export async function getWindowsOnActiveDesktop(): Promise<Window[]> {
    const response = await callCapability(
      "window-management",
      "getWindowsOnActiveDesktop",
      undefined,
      "WindowManagement.getWindowsOnActiveDesktop",
    );
    const value = parseJSONCapabilityValue(response.value, "WindowManagement.getWindowsOnActiveDesktop");
    if (!Array.isArray(value)) {
      throw new CompatibilityError("The WindowManagement.getWindowsOnActiveDesktop capability returned a non-array", {
        value,
      });
    }
    return value.map((entry, index) =>
      deserializeWindow(entry, `WindowManagement.getWindowsOnActiveDesktop result ${index}`),
    );
  }

  /** Moves a window or requests fullscreen through the host window manager. */
  export async function setWindowBounds(
    options: {
      readonly id: string;
    } & (
      | {
          readonly bounds: {
            readonly position?: {
              readonly x?: number;
              readonly y?: number;
            };
            readonly size?: {
              readonly width?: number;
              readonly height?: number;
            };
          };
          readonly desktopId?: string;
        }
      | { readonly bounds: "fullscreen" }
    ),
  ): Promise<void> {
    const normalized = serializeWindowBounds(options);
    await callCapability(
      "window-management",
      "setWindowBounds",
      { optionsJSON: normalized },
      "WindowManagement.setWindowBounds",
    );
  }
}

/** Type-only preference bag used by generic Raycast command code. */
export interface PreferenceValues {
  [name: string]: any;
}

export type PreferenceType = "appPicker" | "checkbox" | "dropdown" | "password" | "textfield" | "file" | "directory";

/** Deprecated preference metadata shape retained for older extensions. */
export interface Preference {
  readonly name: string;
  readonly type: PreferenceType;
  readonly required: boolean;
  readonly title: string;
  readonly description: string;
  readonly value?: unknown;
  readonly default?: unknown;
  readonly placeholder?: string;
  readonly label?: string;
  readonly data?: unknown[];
}

/** Deprecated record of preference metadata keyed by preference name. */
export type Preferences = Record<string, Preference>;

/** Structural equivalent of Node's PathLike without a Node-only dependency. */
export type PathLike = string | URL | Uint8Array;

export interface FileSystemItem {
  readonly path: string;
}

/** Browser-tab data returned by the host browser-extension provider. */
export namespace BrowserExtension {
  export interface Tab {
    readonly id: number;
    readonly url: string;
    readonly title?: string;
    readonly favicon?: string;
    readonly active: boolean;
  }

  export type ContentFormat = "html" | "text" | "markdown";

  export interface GetContentOptions {
    readonly format?: ContentFormat;
    readonly cssSelector?: string;
    readonly tabId?: number;
  }

  /** Returns the tabs exposed by the host browser integration. */
  export async function getTabs(): Promise<Tab[]> {
    const response = await callCapability("browser-extension", "getTabs", undefined, "The BrowserExtension.getTabs");
    return deserializeBrowserTabs(response.value);
  }

  /** Returns content from the active or selected browser tab. */
  export async function getContent(options?: GetContentOptions): Promise<string> {
    const argumentsValue: Record<string, string | number> = {
      format: "html",
    };
    if (options !== undefined) {
      if (!isRecord(options)) {
        unsupported("BrowserExtension.getContent options", { options });
      }
      if (options.format !== undefined) {
        if (options.format !== "html" && options.format !== "text" && options.format !== "markdown") {
          unsupported("BrowserExtension.getContent format", { value: options.format });
        }
        argumentsValue.format = options.format;
      }
      if (options.cssSelector !== undefined) {
        argumentsValue.cssSelector = requireNonEmptyString(
          options.cssSelector,
          "BrowserExtension.getContent cssSelector",
        );
      }
      if (options.tabId !== undefined) {
        const tabId: unknown = options.tabId;
        if (typeof tabId !== "number" || !Number.isInteger(tabId) || tabId < 0) {
          unsupported("BrowserExtension.getContent tabId", { value: tabId });
        }
        argumentsValue.tabId = tabId;
      }
    }
    const response = await callCapability(
      "browser-extension",
      "getContent",
      argumentsValue,
      "The BrowserExtension.getContent",
    );
    if (typeof response.value !== "string") {
      throw new CompatibilityError("The BrowserExtension.getContent capability returned no content", response);
    }
    return response.value;
  }
}

/** Legacy top-level toast constants retained for measured Raycast sources. */
export const ToastStyle = {
  Success: "SUCCESS",
  Failure: "FAILURE",
  Animated: "ANIMATED",
} as const;

export type ToastStyle = (typeof ToastStyle)[keyof typeof ToastStyle];

/** Type-only tool confirmation contract used by Raycast tool entrypoints. */
export namespace Tool {
  export type Confirmation<T> = (input: T) => Promise<
    | undefined
    | {
        readonly style?: ActionStyleLike;
        readonly info?: readonly { readonly name: string; readonly value?: string }[];
        readonly message?: string;
        readonly image?: Image.URL | FileIcon;
      }
  >;
}

/** Measured prompt-completion surface backed by a host AI provider. */
export namespace AI {
  export type Creativity = "none" | "low" | "medium" | "high" | "maximum" | number;
  /** Model identifiers remain extensible because Raycast adds providers over time. */
  export type Model = string;
  export interface AskOptions {
    readonly creativity?: Creativity;
    readonly model?: Model;
    readonly signal?: AbortSignal;
  }

  const modelValues: Record<string, string> = {
    OpenAI_GPT4: "openai-gpt-4",
    OpenAI_GPT4o: "openai-gpt-4o",
    "OpenAI_GPT4o-mini": "openai-gpt-4o-mini",
    OpenAI_GPT5: "openai_o1-gpt-5",
    "OpenAI_GPT5-mini": "openai-gpt-5-mini",
    "OpenAI_GPT-4": "openai-gpt-4",
    OpenAI_GPT4_Turbo: "openai-gpt-4-turbo",
    "OpenAI_GPT-4o": "openai-gpt-4o",
    "OpenAI_GPT-4o_mini": "openai-gpt-4o-mini",
    "OpenAI_GPT-5": "openai_o1-gpt-5",
    "OpenAI_GPT-5_mini": "openai-gpt-5-mini",
    "OpenAI_GPT-5_nano": "openai-gpt-5-nano",
    "OpenAI_GPT-5.1": "openai-gpt-5.1",
    "OpenAI_GPT-5.2": "openai-gpt-5.2",
    Anthropic_Claude_Sonnet: "anthropic-claude-sonnet",
    Anthropic_Claude_Haiku: "anthropic-claude-haiku",
    "Anthropic_Claude_4.5_Sonnet": "anthropic-claude-sonnet-4-5",
    "Anthropic_Claude_4.6_Sonnet": "anthropic-claude-sonnet-4-6",
    "Anthropic_Claude_4.5_Haiku": "anthropic-claude-4-5-haiku",
    "Anthropic_Claude_4.6_Opus": "anthropic-claude-opus-4-6",
    Perplexity_Sonar: "perplexity-sonar",
    Perplexity_Sonar_Pro: "perplexity-sonar-pro",
    "Google_Gemini_2.0_Flash": "google-gemini-2.0-flash",
    "Google_Gemini_2.5_Pro": "google-gemini-2.5-pro",
    "Google_Gemini_2.5_Flash": "google-gemini-2.5-flash",
    Google_Gemini_3_Flash: "google-gemini-3-flash",
    "xAI_Grok-4": "xai-grok-4",
    "xAI_Grok-4.1_Fast": "xai-grok-4.1-fast",
    Mistral_Large: "mistral-mistral-large-latest",
    Mistral_Medium: "mistral-mistral-medium-latest",
    Mistral_Small: "mistral-mistral-small-latest",
    Mistral_Small_3: "mistral-mistral-small-latest",
    Groq_Kimi_K2_Instruct: "groq-kimi-k2-instruct",
    "Together_AI_DeepSeek-R1": "together-deepseek-r1",
    "Together_AI_DeepSeek-V3": "together-deepseek-v3",
  };

  /**
   * The official enum is intentionally open at runtime: older corpus
   * extensions still reference model aliases that newer Raycast releases may
   * remove from their generated type definitions.
   */
  export const Model: Readonly<Record<string, string>> = new Proxy(modelValues, {
    get(target, property: string | symbol) {
      if (typeof property === "string" && !Object.hasOwn(target, property)) {
        return property;
      }
      return Reflect.get(target, property);
    },
  });

  export function ask(
    prompt: string,
    options?: AskOptions,
  ): Promise<string> & { on(event: "data", listener: (chunk: string) => void): void } {
    let signal: AbortSignal | undefined;
    const args: Record<string, string | number | boolean> = {
      prompt: requireNonEmptyString(prompt, "AI.ask prompt"),
    };
    if (options !== undefined) {
      if (!isRecord(options)) {
        unsupported("AI.ask options", { options });
      }
      if (options.creativity !== undefined) {
        args.creativity = normalizeAICreativity(options.creativity);
      }
      if (options.model !== undefined) {
        args.model = requireNonEmptyString(options.model, "AI.ask model");
      }
      if (options.signal !== undefined) {
        const candidateSignal: unknown = options.signal;
        if (
          typeof candidateSignal !== "object" ||
          candidateSignal === null ||
          typeof (candidateSignal as { readonly aborted?: unknown }).aborted !== "boolean"
        ) {
          unsupported("AI.ask signal", { signal: candidateSignal });
        }
        signal = candidateSignal as AbortSignal;
        if (signal.aborted) {
          return createRejectedAIStream(createAbortError("AI.ask was aborted"));
        }
      }
    }

    const result = withAbortSignal(
      callCapability("ai", "ask", args, "The AI.ask").then((response) => {
        if (typeof response.value !== "string") {
          throw new CompatibilityError("The AI.ask capability returned no text", response);
        }
        return response.value;
      }),
      signal,
    );
    const stream = result as Promise<string> & {
      on(event: "data", listener: (chunk: string) => void): void;
    };
    stream.on = (event, listener) => {
      if (event !== "data") {
        unsupported("AI.ask stream event", { event });
      }
      void result
        .then((value) => listener(value))
        .catch(() => {
          // The promise returned by AI.ask remains the source of errors.
        });
    };
    return stream;
  }
}

/** Host-owned OAuth PKCE boundary matching the measured Raycast client shape. */
export namespace OAuth {
  export const clientIdMetadataDocument = "https://www.raycast.com/.well-known/oauth-client-metadata/raycast.json";

  export namespace PKCEClient {
    export interface Options<TRedirectMethod extends RedirectMethod = RedirectMethod> {
      readonly redirectMethod: TRedirectMethod;
      readonly providerName: string;
      readonly providerIcon?: Image.ImageLike;
      readonly providerId?: string;
      readonly description?: string;
    }
  }

  export class PKCEClient<TRedirectMethod extends RedirectMethod = RedirectMethod> {
    redirectMethod: TRedirectMethod;
    providerName: string;
    providerIcon?: Image.ImageLike;
    providerId: string;
    description?: string;

    constructor(options: PKCEClient.Options<TRedirectMethod>) {
      if (!isRecord(options)) {
        unsupported("OAuth.PKCEClient options", { options });
      }
      if (!isRedirectMethod(options.redirectMethod)) {
        unsupported("OAuth.PKCEClient redirectMethod", { value: options.redirectMethod });
      }
      this.redirectMethod = options.redirectMethod as TRedirectMethod;
      this.providerName = requireNonEmptyString(options.providerName, "OAuth.PKCEClient providerName");
      if (options.providerIcon !== undefined) {
        this.providerIcon = options.providerIcon;
      }
      this.providerId =
        options.providerId === undefined
          ? this.providerName
          : requireNonEmptyString(options.providerId, "OAuth.PKCEClient providerId");
      if (options.description !== undefined) {
        if (typeof options.description !== "string") {
          unsupported("OAuth.PKCEClient description", { value: options.description });
        }
        this.description = options.description;
      }
    }

    authorizationRequest(
      this: PKCEClient<RedirectMethod.ClientIdMetadataDocument>,
      options: ClientIdMetadataDocumentAuthorizationRequestOptions,
    ): Promise<AuthorizationRequest>;
    authorizationRequest(options: AuthorizationRequestOptions): Promise<AuthorizationRequest>;
    async authorizationRequest(
      options: AuthorizationRequestOptions | ClientIdMetadataDocumentAuthorizationRequestOptions,
    ): Promise<AuthorizationRequest> {
      if (!isRecord(options)) {
        unsupported("OAuth.authorizationRequest options", { options });
      }
      const endpoint = requireNonEmptyString(options.endpoint, "OAuth.authorizationRequest endpoint");
      const scope = requireString(options.scope, "OAuth.authorizationRequest scope");
      const clientId =
        options.clientId === undefined
          ? this.redirectMethod === RedirectMethod.ClientIdMetadataDocument
            ? clientIdMetadataDocument
            : unsupported("OAuth.authorizationRequest clientId", { options })
          : requireNonEmptyString(options.clientId, "OAuth.authorizationRequest clientId");
      const extraParameters = normalizeOAuthExtraParameters(options.extraParameters);
      const argumentsValue: Record<string, string | number | boolean> = {
        providerId: this.providerId,
        providerName: this.providerName,
        redirectMethod: this.redirectMethod,
        endpoint,
        clientId,
        scope,
      };
      if (extraParameters !== undefined) {
        argumentsValue.extraParametersJSON = JSON.stringify(extraParameters);
      }
      const response = await callCapability(
        "oauth",
        "authorizationRequest",
        argumentsValue,
        "The OAuth authorizationRequest",
      );
      return deserializeAuthorizationRequest(parseJSONCapabilityValue(response.value, "OAuth.authorizationRequest"), {
        endpoint,
        scope,
        ...(extraParameters === undefined ? {} : { extraParameters }),
      });
    }

    async authorize(options: AuthorizationRequest | AuthorizationOptions): Promise<AuthorizationResponse> {
      if (!isRecord(options)) {
        unsupported("OAuth.authorize options", { options });
      }
      const url =
        typeof options.toURL === "function"
          ? requireNonEmptyString(options.toURL(), "OAuth.authorize URL")
          : requireNonEmptyString(options.url, "OAuth.authorize URL");
      const response = await callCapability(
        "oauth",
        "authorize",
        { providerId: this.providerId, url },
        "The OAuth authorize",
      );
      return deserializeAuthorizationResponse(parseJSONCapabilityValue(response.value, "OAuth.authorize"));
    }

    async setTokens(options: TokenSetOptions | TokenResponse): Promise<void> {
      const tokens = normalizeOAuthTokenInput(options);
      await callCapability(
        "oauth",
        "setTokens",
        { providerId: this.providerId, tokensJSON: JSON.stringify(tokens) },
        "The OAuth setTokens",
      );
    }

    async getTokens(): Promise<TokenSet | undefined> {
      const response = await callCapability(
        "oauth",
        "getTokens",
        { providerId: this.providerId },
        "The OAuth getTokens",
      );
      if (response.value === undefined || response.value === null) {
        return undefined;
      }
      return deserializeTokenSet(parseJSONCapabilityValue(response.value, "OAuth.getTokens"));
    }

    async removeTokens(): Promise<void> {
      await callCapability("oauth", "removeTokens", { providerId: this.providerId }, "The OAuth removeTokens");
    }
  }

  export enum RedirectMethod {
    Web = "web",
    App = "app",
    AppURI = "appURI",
    ClientIdMetadataDocument = "clientIdMetadataDocument",
  }

  export interface AuthorizationRequestOptions {
    readonly endpoint: string;
    readonly clientId: string;
    readonly scope: string;
    readonly extraParameters?: Readonly<Record<string, string>>;
  }

  export interface ClientIdMetadataDocumentAuthorizationRequestOptions extends Omit<
    AuthorizationRequestOptions,
    "clientId"
  > {
    readonly clientId?: string;
  }

  export interface AuthorizationRequestURLParams {
    readonly clientId?: string;
    readonly codeChallenge: string;
    readonly codeVerifier: string;
    readonly state: string;
    readonly redirectURI: string;
  }

  export interface AuthorizationRequest extends AuthorizationRequestURLParams {
    readonly clientId: string;
    readonly toURL: () => string;
  }

  export interface AuthorizationOptions {
    readonly url: string;
  }

  export interface AuthorizationResponse {
    readonly authorizationCode: string;
  }

  export interface TokenSet {
    readonly accessToken: string;
    readonly refreshToken?: string;
    readonly idToken?: string;
    readonly expiresIn?: number;
    readonly scope?: string;
    readonly updatedAt: Date;
    isExpired(): boolean;
  }

  export interface TokenSetOptions {
    readonly accessToken: string;
    readonly refreshToken?: string;
    readonly idToken?: string;
    readonly expiresIn?: number;
    readonly scope?: string | string[];
  }

  export interface TokenResponse {
    readonly access_token: string;
    readonly refresh_token?: string;
    readonly id_token?: string;
    readonly expires_in?: number;
    readonly scope?: string | string[];
  }
}

export interface CommandMetadata {
  readonly subtitle?: string | null;
}

export interface CacheOptions {
  /** Separates cache entries while keeping the default shared per extension. */
  readonly namespace?: string;
  /** Retained for source compatibility; V2 currently exposes session-local storage. */
  readonly directory?: string;
  /** Maximum UTF-8 byte size before least-recently-used entries are evicted. */
  readonly capacity?: number;
}

export type CacheSubscriber = (key: string | undefined, data: string | undefined) => void;
export type CacheSubscription = () => void;

interface CacheState {
  readonly storage: Map<string, string>;
  readonly subscribers: Set<CacheSubscriber>;
}

export const Keyboard = {
  Shortcut: {
    Common: {
      Copy: { modifiers: ["cmd"], key: "c" },
      CopyDeeplink: { modifiers: ["cmd", "shift"], key: "c" },
      CopyName: { modifiers: ["cmd", "shift"], key: "n" },
      CopyPath: { modifiers: ["cmd", "shift"], key: "p" },
      Save: { modifiers: ["cmd"], key: "s" },
      Duplicate: { modifiers: ["cmd"], key: "d" },
      Edit: { modifiers: ["cmd"], key: "e" },
      MoveDown: { modifiers: ["cmd"], key: "arrowDown" },
      MoveUp: { modifiers: ["cmd"], key: "arrowUp" },
      New: { modifiers: ["cmd"], key: "n" },
      Open: { modifiers: ["cmd"], key: "o" },
      OpenWith: { modifiers: ["cmd", "shift"], key: "o" },
      Pin: { modifiers: ["cmd"], key: "p" },
      Refresh: { modifiers: ["cmd"], key: "r" },
      Remove: { modifiers: ["cmd"], key: "backspace" },
      RemoveAll: { modifiers: ["cmd", "shift"], key: "backspace" },
      ToggleQuickLook: { modifiers: [], key: "space" },
    },
  },
} as const;

export const PopToRootType = {
  Default: "default",
  Immediate: "immediate",
  Suspended: "suspended",
} as const;

export type PopToRootType = (typeof PopToRootType)[keyof typeof PopToRootType];

export const Alert = {
  ActionStyle: {
    Default: "default",
    Cancel: "cancel",
    Destructive: "destructive",
  },
} as const;

/** @deprecated Use `Alert.ActionStyle` instead. */
export const AlertActionStyle = Alert.ActionStyle;

export const ActionStyle = {
  Regular: "regular",
  Destructive: "destructive",
} as const;

function MenuBarExtraComponent(props: MenuBarExtraProps): ReactElement {
  const icon = serializeIcon(props.icon, "MenuBarExtra");
  return createElement(
    "menu-bar-extra",
    {
      ...(props.title === undefined ? {} : { title: props.title }),
      ...(props.tooltip === undefined ? {} : { tooltip: props.tooltip }),
      ...(icon === undefined
        ? {}
        : { icon: icon.icon, ...(icon.iconTintColor === undefined ? {} : { iconTintColor: icon.iconTintColor }) }),
      ...(props.isLoading === undefined ? {} : { isLoading: props.isLoading }),
    },
    mapMenuBarChildren(props.children, "MenuBarExtra"),
  );
}

function MenuBarExtraItem(props: MenuBarExtraItemProps): ReactElement {
  const icon = serializeIcon(props.icon, "MenuBarExtra.Item");
  const shortcut = serializeShortcut(props.shortcut, "MenuBarExtra.Item");
  if (props.alternate !== undefined) {
    unsupported("MenuBarExtra.Item alternate");
  }
  if (props.onAction !== undefined && typeof props.onAction !== "function") {
    unsupported("MenuBarExtra.Item onAction", { onAction: props.onAction });
  }
  return createElement("menu-bar-item", {
    title: requireNonEmptyString(props.title, "MenuBarExtra.Item title"),
    ...(props.subtitle === undefined ? {} : { subtitle: props.subtitle }),
    ...(props.tooltip === undefined ? {} : { tooltip: props.tooltip }),
    ...(icon === undefined
      ? {}
      : { icon: icon.icon, ...(icon.iconTintColor === undefined ? {} : { iconTintColor: icon.iconTintColor }) }),
    ...(shortcut === undefined ? {} : { shortcut }),
    ...(props.onAction === undefined
      ? {}
      : {
          onAction: () => {
            void props.onAction?.({ type: "left-click" });
          },
        }),
  });
}

function MenuBarExtraSection(props: MenuBarExtraSectionProps): ReactElement {
  return createElement(
    "menu-bar-section",
    { ...(props.title === undefined ? {} : { title: props.title }) },
    mapMenuBarChildren(props.children, "MenuBarExtra.Section"),
  );
}

function MenuBarExtraSubmenu(props: MenuBarExtraSubmenuProps): ReactElement {
  const icon = serializeIcon(props.icon, "MenuBarExtra.Submenu");
  return createElement(
    "menu-bar-submenu",
    {
      title: requireNonEmptyString(props.title, "MenuBarExtra.Submenu title"),
      ...(icon === undefined
        ? {}
        : { icon: icon.icon, ...(icon.iconTintColor === undefined ? {} : { iconTintColor: icon.iconTintColor }) }),
    },
    mapMenuBarChildren(props.children, "MenuBarExtra.Submenu"),
  );
}

function MenuBarExtraSeparator(_props: MenuBarExtraSeparatorProps): ReactElement {
  return createElement("menu-bar-separator");
}

interface MenuBarExtraComponent {
  (props: MenuBarExtraProps): ReactElement;
  Item: typeof MenuBarExtraItem;
  Section: typeof MenuBarExtraSection;
  Submenu: typeof MenuBarExtraSubmenu;
  Separator: typeof MenuBarExtraSeparator;
}

export const MenuBarExtra: MenuBarExtraComponent = Object.assign(MenuBarExtraComponent, {
  Item: MenuBarExtraItem,
  Section: MenuBarExtraSection,
  Submenu: MenuBarExtraSubmenu,
  Separator: MenuBarExtraSeparator,
});

export type FormValue = string | number | boolean | string[] | number[] | Date | null;
export type FormValues = Readonly<Record<string, FormValue>>;

export type FormEventType = "focus" | "blur";
export interface FormEvent<T extends FormValue = FormValue> {
  readonly target: {
    readonly id: string;
    readonly value?: T;
  };
  readonly type: FormEventType;
}

export type LocalStorageValue = string | number | boolean;
export interface LocalStorageValues {
  readonly [key: string]: unknown;
}

export interface FormProps {
  readonly navigationTitle?: string;
  readonly isLoading?: boolean;
  readonly enableDrafts?: boolean;
  readonly children?: ReactNode;
  readonly actions?: ReactNode;
  readonly searchBarAccessory?: ReactNode;
}

export interface FormItemProps<T extends FormValue> {
  readonly id: string;
  readonly title?: string;
  readonly info?: string;
  readonly error?: string;
  readonly storeValue?: boolean;
  readonly autoFocus?: boolean;
  readonly value?: T;
  readonly defaultValue?: T;
  readonly onChange?: (value: T) => void;
  readonly onFocus?: (event: FormEvent<T>) => void;
  readonly onBlur?: (event: FormEvent<T>) => void;
}

export type DatePickerType = "date" | "date_time";

export interface DatePickerProps extends FormItemProps<Date | null> {
  readonly type?: DatePickerType;
  readonly min?: Date;
  readonly max?: Date;
}

export interface TextFieldProps extends FormItemProps<string> {
  readonly placeholder?: string;
}

export interface TextAreaProps extends FormItemProps<string> {
  readonly placeholder?: string;
  readonly enableMarkdown?: boolean;
}

export interface PasswordFieldProps extends FormItemProps<string> {
  readonly placeholder?: string;
}

export interface CheckboxProps extends FormItemProps<boolean> {
  readonly label: string;
}

export interface DropdownItemProps {
  readonly value: string;
  readonly title: string;
  readonly icon?: IconLike;
}

export interface DropdownSectionProps {
  readonly title?: string;
  readonly children?: ReactNode;
}

export interface DropdownProps extends FormItemProps<string> {
  readonly placeholder?: string;
  readonly children?: ReactNode;
}

export interface TagPickerItemProps {
  readonly value: string;
  readonly title: string;
  readonly icon?: IconLike;
}

export interface TagPickerProps extends FormItemProps<string[]> {
  readonly placeholder?: string;
  readonly children?: ReactNode;
}

export interface FilePickerProps extends FormItemProps<string[]> {
  readonly canChooseFiles?: boolean;
  readonly canChooseDirectories?: boolean;
  readonly showHiddenFiles?: boolean;
  readonly allowMultipleSelection?: boolean;
}

export interface DescriptionProps {
  readonly title?: string;
  readonly text: string;
}

export interface SeparatorProps {}

export interface SubmitFormProps<T extends FormValues = FormValues> {
  readonly title?: string;
  readonly icon?: IconLike;
  readonly shortcut?: ShortcutLike;
  readonly style?: ActionStyleLike;
  readonly onSubmit?: (values: T) => void | boolean | Promise<void | boolean>;
}

/** @deprecated Use `Action.SubmitForm` instead. */
export interface SubmitFormActionProps<T extends FormValues = FormValues> extends SubmitFormProps<T> {}

export interface PushProps {
  readonly title: string;
  readonly target: ReactNode;
  readonly icon?: IconLike;
  readonly shortcut?: ShortcutLike;
  readonly style?: ActionStyleLike;
  readonly autoFocus?: boolean;
  readonly onPush?: () => void;
  readonly onPop?: () => void;
}

/** @deprecated Use `Action.Push` instead. */
export interface PushActionProps extends PushProps {}

function unsupported(what: string, details?: unknown): never {
  throw new CompatibilityError(`${what} is not supported by the Blast compatibility surface yet`, details);
}

function normalizeStringArray(value: unknown, where: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    unsupported(`${where} must be an array of strings`, { value });
  }
  return [...(value as string[])];
}

function normalizeGridColumns(value: unknown, where: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 8) {
    unsupported(`${where} must be an integer between 1 and 8`, { value });
  }
  return value;
}

function normalizeGridItemSize(value: unknown, where: string): GridItemSize {
  if (
    value !== GRID_ITEM_SIZE_VALUES.Small &&
    value !== GRID_ITEM_SIZE_VALUES.Medium &&
    value !== GRID_ITEM_SIZE_VALUES.Large
  ) {
    unsupported(`${where} is invalid`, { value });
  }
  return value as GridItemSize;
}

function normalizeGridFit(value: unknown, where: string): GridFit {
  if (value !== GRID_FIT_VALUES.Contain && value !== GRID_FIT_VALUES.Fill) {
    unsupported(`${where} is invalid`, { value });
  }
  return value as GridFit;
}

function normalizeGridInset(value: unknown, where: string): GridInset {
  if (
    value !== GRID_INSET_VALUES.Zero &&
    value !== GRID_INSET_VALUES.Small &&
    value !== GRID_INSET_VALUES.Medium &&
    value !== GRID_INSET_VALUES.Large
  ) {
    unsupported(`${where} is invalid`, { value });
  }
  return value as GridInset;
}

function normalizeGridAspectRatio(value: unknown, where: string): GridAspectRatio {
  if (typeof value !== "string" || !GRID_ASPECT_RATIOS.has(value as GridAspectRatio)) {
    unsupported(`${where} is invalid`, { value });
  }
  return value as GridAspectRatio;
}

function normalizeGridFiltering(
  value: GridProps["filtering"],
  where: string,
): { filtering: boolean; filteringKeepSectionOrder?: boolean } | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "boolean") {
    return { filtering: value };
  }
  if (!isRecord(value) || typeof value.keepSectionOrder !== "boolean") {
    unsupported(`${where} must be a boolean or { keepSectionOrder: boolean }`, { value });
  }
  return { filtering: true, filteringKeepSectionOrder: value.keepSectionOrder };
}

function serializeGridContent(
  content: unknown,
  where: string,
): { content: string; contentTintColor?: string; contentTooltip?: string } {
  if (typeof content === "string") {
    return { content };
  }
  if (!isRecord(content)) {
    unsupported(`${where} content`, { content });
  }
  if ("value" in content) {
    return {
      ...serializeGridContent(content.value, where),
      contentTooltip: requireNonEmptyString(content.tooltip, `${where} content tooltip`),
    };
  }
  if ("color" in content) {
    return { content: `color:${serializeGridColor(content.color, where)}` };
  }
  if ("source" in content || "fileIcon" in content) {
    const icon = serializeIcon(content as unknown as IconLike, where);
    if (icon === undefined) {
      unsupported(`${where} content`, { content });
    }
    return {
      content: icon.icon,
      ...(icon.iconTintColor === undefined ? {} : { contentTintColor: icon.iconTintColor }),
    };
  }
  unsupported(`${where} content`, { content });
}

function serializeGridColor(color: unknown, where: string): string {
  if (typeof color === "string") {
    return color;
  }
  if (isRecord(color) && typeof color.light === "string" && typeof color.dark === "string") {
    return color.light;
  }
  unsupported(`${where} color`, { color });
}

function serializeIcon(
  icon: IconLike | null | undefined,
  where: string,
): { icon: string; iconTintColor?: string } | undefined {
  if (icon === undefined || icon === null) {
    return undefined;
  }
  if (typeof icon === "string") {
    return { icon };
  }
  if (typeof icon === "object" && icon !== null && "source" in icon) {
    const record = icon as unknown as Record<string, unknown>;
    const source = record.source;
    let serializedSource: string;
    if (typeof source === "string") {
      serializedSource = source;
    } else if (
      isRecord(source) &&
      typeof source.light === "string" &&
      typeof source.dark === "string" &&
      source.light.length > 0 &&
      source.dark.length > 0
    ) {
      // The scene contract currently carries one resolved icon source. Use the
      // light asset deterministically until theme-aware image values are added.
      serializedSource = source.light;
    } else {
      unsupported(`An icon source in ${where}`, { source });
    }
    if (record.mask !== undefined && record.mask !== Image.Mask.Circle && record.mask !== Image.Mask.RoundedRectangle) {
      unsupported(`An image mask in ${where}`, { mask: record.mask });
    }
    const tintColor =
      record.tintColor === undefined || record.tintColor === null
        ? undefined
        : serializeTintColor(record.tintColor, where);
    return {
      icon: serializedSource,
      ...(tintColor === undefined ? {} : { iconTintColor: tintColor }),
    };
  }
  if (typeof icon === "object" && icon !== null && "fileIcon" in icon) {
    const fileIcon = (icon as unknown as Record<string, unknown>).fileIcon;
    return { icon: `fileIcon:${requireNonEmptyString(fileIcon, `${where} fileIcon`)}` };
  }
  unsupported(`An icon in ${where}`, { icon });
}

function serializeTintColor(tintColor: unknown, where: string): string {
  if (typeof tintColor === "string") {
    return tintColor;
  }
  if (isRecord(tintColor) && typeof tintColor.light === "string" && typeof tintColor.dark === "string") {
    return tintColor.light;
  }
  unsupported(`A tint color in ${where}`, { tintColor });
}

const SHORTCUT_MODIFIERS = new Set<KeyModifier>(["cmd", "ctrl", "opt", "shift", "alt", "windows"]);

/**
 * Normalizes Raycast's keyboard shortcut union into the structured scene
 * representation. The platform-specific form is selected at render time so
 * the client never has to understand Raycast's deprecated `windows` alias.
 */
function serializeShortcut(shortcut: unknown, where: string): SceneShortcut | undefined {
  if (shortcut === undefined || shortcut === null) {
    return undefined;
  }
  if (!isRecord(shortcut)) {
    unsupported(`A shortcut in ${where}`, { shortcut });
  }

  const context = requireContext();
  const selected =
    "modifiers" in shortcut
      ? shortcut
      : context.platform === "darwin"
        ? (shortcut["macOS"] ?? shortcut["Windows"] ?? shortcut["windows"])
        : (shortcut["Windows"] ?? shortcut["windows"] ?? shortcut["macOS"]);
  if (!isRecord(selected) || !Array.isArray(selected.modifiers) || typeof selected.key !== "string") {
    unsupported(`A shortcut in ${where}`, { shortcut });
  }
  const rawModifiers = selected.modifiers;
  const key = selected.key;
  if (!Array.isArray(rawModifiers) || typeof key !== "string") {
    unsupported(`A shortcut in ${where}`, { shortcut });
  }
  if (
    rawModifiers.some((modifier) => typeof modifier !== "string" || !SHORTCUT_MODIFIERS.has(modifier as KeyModifier))
  ) {
    unsupported(`A shortcut modifier in ${where}`, { shortcut });
  }
  const modifiers = rawModifiers as string[];
  if (new Set(modifiers).size !== modifiers.length || key.length === 0) {
    unsupported(`A shortcut in ${where}`, { shortcut });
  }
  return { modifiers: [...modifiers], key };
}

function normalizeActionStyle(style: unknown, where: string): ActionStyleLike | undefined {
  if (style === undefined || style === null) {
    return undefined;
  }
  if (style === "regular" || style === "destructive") {
    return style;
  }
  unsupported(`An action style in ${where}`, { style });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireNonEmptyString(value: unknown, where: string): string {
  if (typeof value !== "string" || value.length === 0) {
    unsupported(`${where} must be a non-empty string`, { value });
  }
  return value;
}

function requireString(value: unknown, where: string): string {
  if (typeof value !== "string") {
    unsupported(`${where} must be a string`, { value });
  }
  return value;
}

function normalizeAICreativity(value: unknown): string | number {
  if (value === "none" || value === "low" || value === "medium" || value === "high" || value === "maximum") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.min(2, Math.max(0, value));
  }
  unsupported("AI.ask creativity", { value });
}

function createAbortError(message: string): Error {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

function withAbortSignal<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (signal === undefined) {
    return promise;
  }
  if (signal.aborted) {
    return Promise.reject(createAbortError("The operation was aborted"));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(createAbortError("The operation was aborted"));
    };
    const cleanup = () => {
      signal.removeEventListener("abort", onAbort);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    void promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
  });
}

function createRejectedAIStream(error: Error): Promise<string> & {
  on(event: "data", listener: (chunk: string) => void): void;
} {
  const result = Promise.reject<string>(error) as Promise<string> & {
    on(event: "data", listener: (chunk: string) => void): void;
  };
  result.on = () => {};
  return result;
}

function isRedirectMethod(value: unknown): value is OAuth.RedirectMethod {
  return (
    value === OAuth.RedirectMethod.Web ||
    value === OAuth.RedirectMethod.App ||
    value === OAuth.RedirectMethod.AppURI ||
    value === OAuth.RedirectMethod.ClientIdMetadataDocument
  );
}

function normalizeOAuthExtraParameters(value: unknown): Readonly<Record<string, string>> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    unsupported("OAuth.authorizationRequest extraParameters", { value });
  }
  const normalized = Object.create(null) as Record<string, string>;
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== "string") {
      unsupported(`OAuth.authorizationRequest extraParameters.${key}`, { value: entry });
    }
    normalized[key] = entry;
  }
  return normalized;
}

interface OAuthAuthorizationRequestFallback {
  readonly endpoint: string;
  readonly scope: string;
  readonly extraParameters?: Readonly<Record<string, string>>;
}

function deserializeAuthorizationRequest(
  value: unknown,
  fallback: OAuthAuthorizationRequestFallback,
): OAuth.AuthorizationRequest {
  if (!isRecord(value)) {
    throw new CompatibilityError("The OAuth.authorizationRequest capability returned an invalid request", { value });
  }
  const clientId = requireNonEmptyString(value.clientId, "OAuth.authorizationRequest result clientId");
  const codeChallenge = requireNonEmptyString(value.codeChallenge, "OAuth.authorizationRequest result codeChallenge");
  const codeVerifier = requireNonEmptyString(value.codeVerifier, "OAuth.authorizationRequest result codeVerifier");
  const state = requireNonEmptyString(value.state, "OAuth.authorizationRequest result state");
  const redirectURI = requireNonEmptyString(value.redirectURI, "OAuth.authorizationRequest result redirectURI");
  const authorizationURL =
    value.authorizationURL === undefined
      ? undefined
      : requireNonEmptyString(value.authorizationURL, "OAuth.authorizationRequest result authorizationURL");
  return {
    clientId,
    codeChallenge,
    codeVerifier,
    state,
    redirectURI,
    toURL: () =>
      authorizationURL ??
      buildOAuthAuthorizationURL(fallback.endpoint, {
        clientId,
        codeChallenge,
        state,
        redirectURI,
        scope: fallback.scope,
        ...(fallback.extraParameters === undefined ? {} : { extraParameters: fallback.extraParameters }),
      }),
  };
}

function buildOAuthAuthorizationURL(
  endpoint: string,
  request: {
    readonly clientId: string;
    readonly codeChallenge: string;
    readonly state: string;
    readonly redirectURI: string;
    readonly scope: string;
    readonly extraParameters?: Readonly<Record<string, string>>;
  },
): string {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch (error) {
    throw new CompatibilityError("OAuth.authorizationRequest endpoint is not a valid URL", {
      endpoint,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  const parameters = new URLSearchParams(url.search);
  parameters.set("client_id", request.clientId);
  parameters.set("response_type", "code");
  parameters.set("redirect_uri", request.redirectURI);
  parameters.set("scope", request.scope);
  parameters.set("state", request.state);
  parameters.set("code_challenge", request.codeChallenge);
  parameters.set("code_challenge_method", "S256");
  for (const [key, value] of Object.entries(request.extraParameters ?? {})) {
    parameters.set(key, value);
  }
  url.search = parameters.toString();
  return url.toString();
}

function deserializeAuthorizationResponse(value: unknown): OAuth.AuthorizationResponse {
  if (!isRecord(value)) {
    throw new CompatibilityError("The OAuth.authorize capability returned an invalid response", { value });
  }
  return {
    authorizationCode: requireNonEmptyString(value.authorizationCode, "OAuth.authorize result authorizationCode"),
  };
}

function normalizeOAuthTokenInput(value: unknown): Record<string, string | number> {
  if (!isRecord(value)) {
    unsupported("OAuth.setTokens options", { value });
  }
  const accessToken = value.accessToken === undefined ? value.access_token : value.accessToken;
  const normalized: Record<string, string | number> = {
    accessToken: requireNonEmptyString(accessToken, "OAuth.setTokens accessToken"),
  };
  for (const [target, source] of [
    ["refreshToken", "refreshToken"],
    ["idToken", "idToken"],
  ] as const) {
    const entry = value[source];
    const legacyEntry = value[source.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)];
    const selected = entry === undefined ? legacyEntry : entry;
    if (selected !== undefined) {
      if (typeof selected !== "string") {
        unsupported(`OAuth.setTokens ${target}`, { value: selected });
      }
      normalized[target] = selected;
    }
  }
  const expiresIn = value.expiresIn === undefined ? value.expires_in : value.expiresIn;
  if (expiresIn !== undefined) {
    if (typeof expiresIn !== "number" || !Number.isFinite(expiresIn)) {
      unsupported("OAuth.setTokens expiresIn", { value: expiresIn });
    }
    normalized.expiresIn = expiresIn;
  }
  if (value.scope !== undefined) {
    if (typeof value.scope === "string") {
      normalized.scope = value.scope;
    } else if (Array.isArray(value.scope) && value.scope.every((entry) => typeof entry === "string")) {
      normalized.scope = value.scope.join(" ");
    } else {
      unsupported("OAuth.setTokens scope", { value: value.scope });
    }
  }
  return normalized;
}

function deserializeTokenSet(value: unknown): OAuth.TokenSet {
  if (!isRecord(value)) {
    throw new CompatibilityError("The OAuth.getTokens capability returned an invalid token set", { value });
  }
  const accessToken = requireNonEmptyString(value.accessToken, "OAuth.getTokens result accessToken");
  const tokenSet: {
    accessToken: string;
    refreshToken?: string;
    idToken?: string;
    expiresIn?: number;
    scope?: string;
    updatedAt: Date;
  } = { accessToken, updatedAt: deserializeOAuthDate(value.updatedAt) };
  for (const field of ["refreshToken", "idToken"] as const) {
    const entry = value[field];
    if (entry !== undefined) {
      tokenSet[field] = requireString(entry, `OAuth.getTokens result ${field}`);
    }
  }
  if (value.expiresIn !== undefined) {
    if (typeof value.expiresIn !== "number" || !Number.isFinite(value.expiresIn)) {
      throw new CompatibilityError("The OAuth.getTokens capability returned an invalid expiresIn", {
        value: value.expiresIn,
      });
    }
    tokenSet.expiresIn = value.expiresIn;
  }
  if (value.scope !== undefined) {
    if (typeof value.scope === "string") {
      tokenSet.scope = value.scope;
    } else if (Array.isArray(value.scope) && value.scope.every((entry) => typeof entry === "string")) {
      tokenSet.scope = value.scope.join(" ");
    } else {
      throw new CompatibilityError("The OAuth.getTokens capability returned an invalid scope", {
        value: value.scope,
      });
    }
  }
  return {
    ...tokenSet,
    isExpired: () =>
      tokenSet.expiresIn !== undefined && Date.now() >= tokenSet.updatedAt.getTime() + tokenSet.expiresIn * 1000 - 5000,
  };
}

function deserializeOAuthDate(value: unknown): Date {
  if (value === undefined) {
    return new Date();
  }
  if (typeof value !== "string" && typeof value !== "number") {
    throw new CompatibilityError("The OAuth.getTokens capability returned an invalid updatedAt", { value });
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new CompatibilityError("The OAuth.getTokens capability returned an invalid updatedAt", { value });
  }
  return date;
}

interface ListComponent {
  (props: ListProps): ReactElement;
  Item: typeof ListItem;
  Section: typeof ListSection;
}

function ListComponent(props: ListProps): ReactElement {
  return createElement(
    "list",
    {
      ...(props.navigationTitle === undefined ? {} : { navigationTitle: props.navigationTitle }),
      ...(props.searchBarPlaceholder === undefined ? {} : { searchBarPlaceholder: props.searchBarPlaceholder }),
      ...(props.isLoading === undefined ? {} : { isLoading: props.isLoading }),
    },
    props.children,
    props.actions,
  );
}

function ListItem(props: ListItemProps): ReactElement {
  const icon = serializeIcon(props.icon, "List.Item");
  const children =
    props.actions === undefined
      ? props.children
      : Children.toArray([...Children.toArray(props.actions), ...Children.toArray(props.children)]);
  return createElement(
    "list-item",
    {
      title: props.title,
      ...(props.subtitle === undefined ? {} : { subtitle: props.subtitle }),
      ...(icon === undefined ? {} : { icon: icon.icon, iconTintColor: icon.iconTintColor }),
    },
    mapItemChildren(children, "List.Item"),
  );
}

export function ListSection(props: ListSectionProps): ReactElement {
  return createElement(
    "list-section",
    {
      ...(props.id === undefined ? {} : { id: requireNonEmptyString(props.id, "List.Section id") }),
      ...(props.title === undefined ? {} : { title: props.title }),
      ...(props.subtitle === undefined ? {} : { subtitle: props.subtitle }),
    },
    mapListSectionChildren(props.children),
  );
}

export const List: ListComponent = Object.assign(ListComponent, { Item: ListItem, Section: ListSection });

const GRID_INSET_VALUES = {
  Zero: "zero",
  Small: "sm",
  Medium: "md",
  Large: "lg",
} as const satisfies Record<string, GridInset>;

const GRID_ITEM_SIZE_VALUES = {
  Small: "small",
  Medium: "medium",
  Large: "large",
} as const satisfies Record<string, GridItemSize>;

const GRID_FIT_VALUES = {
  Contain: "contain",
  Fill: "fill",
} as const satisfies Record<string, GridFit>;

const GRID_ASPECT_RATIOS = new Set<GridAspectRatio>(["1", "3/2", "2/3", "4/3", "3/4", "16/9", "9/16"]);

function GridComponent(props: GridProps): ReactElement {
  const filtering = normalizeGridFiltering(props.filtering, "Grid filtering");
  return createElement(
    "grid",
    {
      ...(props.navigationTitle === undefined ? {} : { navigationTitle: props.navigationTitle }),
      ...(props.searchBarPlaceholder === undefined ? {} : { searchBarPlaceholder: props.searchBarPlaceholder }),
      ...(props.isLoading === undefined ? {} : { isLoading: props.isLoading }),
      ...(props.columns === undefined ? {} : { columns: normalizeGridColumns(props.columns, "Grid columns") }),
      ...(props.itemSize === undefined ? {} : { itemSize: normalizeGridItemSize(props.itemSize, "Grid itemSize") }),
      ...(props.aspectRatio === undefined
        ? {}
        : { aspectRatio: normalizeGridAspectRatio(props.aspectRatio, "Grid aspectRatio") }),
      ...(props.fit === undefined ? {} : { fit: normalizeGridFit(props.fit, "Grid fit") }),
      ...(props.inset === undefined ? {} : { inset: normalizeGridInset(props.inset, "Grid inset") }),
      ...(props.searchText === undefined ? {} : { searchText: props.searchText }),
      ...(filtering === undefined ? {} : filtering),
      ...(props.throttle === undefined ? {} : { throttle: props.throttle }),
      ...(props.selectedItemId === undefined ? {} : { selectedItemId: props.selectedItemId }),
      ...(props.onSelectionChange === undefined
        ? {}
        : {
            onSelectionChange: (event: SceneEventPayload) => {
              const value = event.values?.selectedItemId;
              props.onSelectionChange?.(value === undefined || value === null ? null : String(value));
            },
          }),
      ...(props.onSearchTextChange === undefined
        ? {}
        : {
            onSearchTextChange: (event: SceneEventPayload) => {
              const value = event.values?.searchText;
              props.onSearchTextChange?.(typeof value === "string" ? value : "");
            },
          }),
    },
    mapGridChildren(Children.toArray([props.searchBarAccessory, props.children, props.actions])),
  );
}

function GridItem(props: GridItemProps): ReactElement {
  const content = serializeGridContent(props.content, "Grid.Item");
  const icon =
    props.accessory === undefined || props.accessory === null
      ? undefined
      : serializeIcon(props.accessory.icon, "Grid.Item accessory");
  const children =
    props.actions === undefined
      ? props.children
      : Children.toArray([...Children.toArray(props.actions), ...Children.toArray(props.children)]);
  return createElement(
    "grid-item",
    {
      ...(props.id === undefined ? {} : { id: requireNonEmptyString(props.id, "Grid.Item id") }),
      content: content.content,
      ...(content.contentTintColor === undefined ? {} : { contentTintColor: content.contentTintColor }),
      ...(content.contentTooltip === undefined ? {} : { contentTooltip: content.contentTooltip }),
      ...(props.title === undefined ? {} : { title: props.title }),
      ...(props.subtitle === undefined ? {} : { subtitle: props.subtitle }),
      ...(props.keywords === undefined ? {} : { keywords: normalizeStringArray(props.keywords, "Grid.Item keywords") }),
      ...(icon === undefined ? {} : { accessoryIcon: icon.icon }),
      ...(props.accessory?.tooltip === undefined ? {} : { accessoryTooltip: props.accessory.tooltip }),
    },
    mapItemChildren(children, "Grid.Item"),
  );
}

function GridSection(props: GridSectionProps): ReactElement {
  return createElement(
    "grid-section",
    {
      ...(props.title === undefined ? {} : { title: props.title }),
      ...(props.subtitle === undefined ? {} : { subtitle: props.subtitle }),
      ...(props.columns === undefined ? {} : { columns: normalizeGridColumns(props.columns, "Grid.Section columns") }),
      ...(props.aspectRatio === undefined
        ? {}
        : { aspectRatio: normalizeGridAspectRatio(props.aspectRatio, "Grid.Section aspectRatio") }),
      ...(props.fit === undefined ? {} : { fit: normalizeGridFit(props.fit, "Grid.Section fit") }),
      ...(props.inset === undefined ? {} : { inset: normalizeGridInset(props.inset, "Grid.Section inset") }),
    },
    mapGridSectionChildren(props.children),
  );
}

function GridEmptyView(props: GridEmptyViewProps): ReactElement {
  const icon = serializeIcon(props.icon, "Grid.EmptyView");
  return createElement(
    "grid-empty-view",
    {
      ...(icon === undefined
        ? {}
        : { icon: icon.icon, ...(icon.iconTintColor === undefined ? {} : { iconTintColor: icon.iconTintColor }) }),
      ...(props.title === undefined ? {} : { title: props.title }),
      ...(props.description === undefined ? {} : { description: props.description }),
    },
    mapItemChildren(props.actions, "Grid.EmptyView actions"),
  );
}

function GridDropdown(props: GridDropdownProps): ReactElement {
  if (props.onChange !== undefined && typeof props.onChange !== "function") {
    unsupported("Grid.Dropdown onChange", { onChange: props.onChange });
  }
  const eventKey = props.id ?? "value";
  return createElement(
    "grid-dropdown",
    {
      ...(props.id === undefined ? {} : { id: requireNonEmptyString(props.id, "Grid.Dropdown id") }),
      tooltip: requireNonEmptyString(props.tooltip, "Grid.Dropdown tooltip"),
      ...(props.placeholder === undefined ? {} : { placeholder: props.placeholder }),
      ...(props.storeValue === undefined ? {} : { storeValue: props.storeValue }),
      ...(props.value === undefined ? {} : { value: props.value }),
      ...(props.defaultValue === undefined ? {} : { defaultValue: props.defaultValue }),
      ...(props.onChange === undefined
        ? {}
        : {
            onChange: (event: SceneEventPayload) => {
              const value = event.values?.[eventKey] ?? event.values?.value;
              if (typeof value === "string") {
                props.onChange?.(value);
              }
            },
          }),
    },
    mapGridDropdownChildren(props.children),
  );
}

function GridDropdownItem(props: GridDropdownItemProps): ReactElement {
  const icon = serializeIcon(props.icon, "Grid.Dropdown.Item");
  return createElement("grid-dropdown-item", {
    value: requireNonEmptyString(props.value, "Grid.Dropdown.Item value"),
    title: requireNonEmptyString(props.title, "Grid.Dropdown.Item title"),
    ...(icon === undefined
      ? {}
      : { icon: icon.icon, ...(icon.iconTintColor === undefined ? {} : { iconTintColor: icon.iconTintColor }) }),
    ...(props.keywords === undefined
      ? {}
      : { keywords: normalizeStringArray(props.keywords, "Grid.Dropdown.Item keywords") }),
  });
}

function GridDropdownSection(props: GridDropdownSectionProps): ReactElement {
  return createElement(
    "grid-dropdown-section",
    { ...(props.title === undefined ? {} : { title: props.title }) },
    mapGridDropdownChildren(props.children),
  );
}

interface GridComponent {
  (props: GridProps): ReactElement;
  Inset: typeof GRID_INSET_VALUES;
  ItemSize: typeof GRID_ITEM_SIZE_VALUES;
  Fit: typeof GRID_FIT_VALUES;
  Item: typeof GridItem;
  Section: typeof GridSection;
  EmptyView: typeof GridEmptyView;
  Dropdown: typeof GridDropdown & {
    Item: typeof GridDropdownItem;
    Section: typeof GridDropdownSection;
  };
}

export const Grid: GridComponent = Object.assign(GridComponent, {
  Inset: GRID_INSET_VALUES,
  ItemSize: GRID_ITEM_SIZE_VALUES,
  Fit: GRID_FIT_VALUES,
  Item: GridItem,
  Section: GridSection,
  EmptyView: GridEmptyView,
  Dropdown: Object.assign(GridDropdown, { Item: GridDropdownItem, Section: GridDropdownSection }),
});

export function Detail(props: DetailProps): ReactElement {
  return createElement("detail", {
    ...(props.markdown === undefined ? {} : { markdown: props.markdown }),
    ...(props.navigationTitle === undefined ? {} : { navigationTitle: props.navigationTitle }),
  });
}

interface FormCodec {
  readonly accepts: (value: unknown) => boolean;
  readonly acceptsWire: (value: SceneFormValue) => boolean;
  readonly serialize: (value: unknown) => SceneFormValue;
  readonly deserialize: (value: SceneFormValue) => FormValue;
}

interface FormRuntime {
  readonly resetFields: () => void;
  readonly register: (id: string, initialValue: FormValue | undefined, controlled: boolean, codec: FormCodec) => void;
  readonly update: (id: string, value: SceneFormValue) => void;
  readonly currentValue: (id: string) => SceneFormValue | undefined;
  readonly submit: (values: Readonly<Record<string, SceneFormValue>> | undefined) => FormValues;
}

const FormContext: Context<FormRuntime | undefined> = createContext<FormRuntime | undefined>(undefined);

function requireFormContext(where: string): FormRuntime {
  const context = useContext(FormContext);
  if (context === undefined) {
    throw new CompatibilityError(`${where} must be rendered inside a Form`);
  }
  return context;
}

function createFormRuntime(): FormRuntime {
  const values = new Map<string, SceneFormValue>();
  const fieldIds = new Set<string>();
  const fieldCodecs = new Map<string, FormCodec>();

  return {
    resetFields() {
      fieldIds.clear();
      fieldCodecs.clear();
    },
    register(id, initialValue, controlled, codec) {
      if (fieldIds.has(id)) {
        throw new CompatibilityError(`The Form contains duplicate field id ${JSON.stringify(id)}`, { id });
      }
      fieldIds.add(id);
      fieldCodecs.set(id, codec);
      if (controlled || !values.has(id)) {
        if (initialValue !== undefined) {
          values.set(id, codec.serialize(initialValue));
        } else if (controlled) {
          values.delete(id);
        }
      }
    },
    update(id, value) {
      if (fieldIds.has(id)) {
        values.set(id, value);
      }
    },
    currentValue(id) {
      return values.get(id);
    },
    submit(submittedValues) {
      const result: Record<string, FormValue> = {};
      for (const id of fieldIds) {
        if (submittedValues !== undefined && Object.prototype.hasOwnProperty.call(submittedValues, id)) {
          const value = submittedValues[id] as SceneFormValue;
          const codec = fieldCodecs.get(id);
          if (codec !== undefined && !codec.acceptsWire(value)) {
            throw new CompatibilityError(`Form field ${JSON.stringify(id)} received a value with the wrong type`, {
              id,
              value,
            });
          }
          const formValue = codec === undefined ? value : codec.deserialize(value);
          Object.defineProperty(result, id, {
            configurable: true,
            enumerable: true,
            value: formValue,
            writable: true,
          });
        } else if (values.has(id)) {
          const value = values.get(id) as SceneFormValue;
          const codec = fieldCodecs.get(id);
          const formValue = codec === undefined ? value : codec.deserialize(value);
          Object.defineProperty(result, id, {
            configurable: true,
            enumerable: true,
            value: formValue,
            writable: true,
          });
        }
      }
      return result;
    },
  };
}

function assertFormId(id: string, where: string): void {
  if (typeof id !== "string" || id.length === 0) {
    throw new CompatibilityError(`${where} requires a non-empty id`, { id });
  }
}

function assertFormCallbacks(props: FormItemProps<FormValue>, where: string): void {
  if (props.onChange !== undefined && typeof props.onChange !== "function") {
    throw new CompatibilityError(`${where} onChange must be a function`, { onChange: props.onChange });
  }
  if (props.onFocus !== undefined && typeof props.onFocus !== "function") {
    throw new CompatibilityError(`${where} onFocus must be a function`, { onFocus: props.onFocus });
  }
  if (props.onBlur !== undefined && typeof props.onBlur !== "function") {
    throw new CompatibilityError(`${where} onBlur must be a function`, { onBlur: props.onBlur });
  }
}

function useFormChange<T extends FormValue>(
  props: FormItemProps<T>,
  where: string,
  codec: FormCodec,
): (payload: SceneEventPayload) => void {
  const form = requireFormContext(where);
  assertFormId(props.id, where);
  assertFormCallbacks(props as unknown as FormItemProps<FormValue>, where);
  const { id, onChange } = props;
  const initialValue = props.value !== undefined ? props.value : props.defaultValue;
  if (initialValue !== undefined && !codec.accepts(initialValue)) {
    throw new CompatibilityError(`${where} received an initial value with the wrong type`, {
      id: props.id,
      value: initialValue,
    });
  }
  form.register(id, initialValue, props.value !== undefined, codec);
  return useMemo(
    () => (payload: SceneEventPayload) => {
      const value = payload.values?.[id];
      if (value === undefined) {
        return;
      }
      if (!codec.acceptsWire(value)) {
        throw new CompatibilityError(`${where} received a value with the wrong type`, {
          id,
          value,
        });
      }
      form.update(id, value);
      onChange?.(codec.deserialize(value) as T);
    },
    [codec, form, id, onChange, where],
  );
}

function useFormEvent<T extends FormValue>(
  props: FormItemProps<T>,
  where: string,
  codec: FormCodec,
  type: FormEventType,
): ((payload: SceneEventPayload) => void) | undefined {
  const form = requireFormContext(where);
  assertFormId(props.id, where);
  assertFormCallbacks(props as unknown as FormItemProps<FormValue>, where);
  const { id } = props;
  const callback = type === "focus" ? props.onFocus : props.onBlur;
  return useMemo(() => {
    if (callback === undefined) {
      return undefined;
    }
    return (payload: SceneEventPayload) => {
      const suppliedValues = payload.values;
      const wireValue =
        suppliedValues !== undefined && Object.prototype.hasOwnProperty.call(suppliedValues, id)
          ? suppliedValues[id]
          : form.currentValue(id);
      if (wireValue !== undefined && !codec.acceptsWire(wireValue)) {
        throw new CompatibilityError(`${where} received a value with the wrong type`, {
          id,
          value: wireValue,
        });
      }
      if (wireValue !== undefined) {
        form.update(id, wireValue);
      }
      const event: FormEvent<T> = {
        type,
        target: {
          id,
          ...(wireValue === undefined ? {} : { value: codec.deserialize(wireValue) as T }),
        },
      };
      callback(event);
    };
  }, [callback, codec, form, id, type, where]);
}

function isStringFormValue(value: unknown): value is string {
  return typeof value === "string";
}

function isBooleanFormValue(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isStringArrayFormValue(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isDateFormValue(value: unknown): value is Date | null {
  return value === null || (value instanceof Date && Number.isFinite(value.getTime()));
}

function isDateWireValue(value: SceneFormValue): boolean {
  return value === null || (typeof value === "string" && Number.isFinite(Date.parse(value)));
}

const stringFormCodec: FormCodec = {
  accepts: isStringFormValue,
  acceptsWire: isStringFormValue,
  serialize: (value) => value as string,
  deserialize: (value) => value as string,
};

const booleanFormCodec: FormCodec = {
  accepts: isBooleanFormValue,
  acceptsWire: isBooleanFormValue,
  serialize: (value) => value as boolean,
  deserialize: (value) => value as boolean,
};

const stringArrayFormCodec: FormCodec = {
  accepts: isStringArrayFormValue,
  acceptsWire: isStringArrayFormValue,
  serialize: (value) => [...(value as string[])],
  deserialize: (value) => [...(value as readonly string[])],
};

const dateFormCodec: FormCodec = {
  accepts: isDateFormValue,
  acceptsWire: isDateWireValue,
  serialize: (value) => (value === null ? null : (value as Date).toISOString()),
  deserialize: (value) => (value === null ? null : new Date(value as string)),
};

function commonFormProps<T extends FormValue>(
  props: FormItemProps<T>,
  onChange: (payload: SceneEventPayload) => void,
  codec: FormCodec,
  onFocus?: (payload: SceneEventPayload) => void,
  onBlur?: (payload: SceneEventPayload) => void,
) {
  const value = props.value === undefined ? undefined : codec.serialize(props.value);
  const defaultValue = props.defaultValue === undefined ? undefined : codec.serialize(props.defaultValue);
  return {
    id: props.id,
    ...(props.title === undefined ? {} : { title: props.title }),
    ...(props.info === undefined ? {} : { info: props.info }),
    ...(props.error === undefined ? {} : { error: props.error }),
    ...(props.storeValue === undefined ? {} : { storeValue: props.storeValue }),
    ...(props.autoFocus === undefined ? {} : { autoFocus: props.autoFocus }),
    ...(value === undefined || value === null ? {} : { value }),
    ...(defaultValue === undefined || defaultValue === null ? {} : { defaultValue }),
    onChange,
    ...(onFocus === undefined ? {} : { onFocus }),
    ...(onBlur === undefined ? {} : { onBlur }),
  };
}

function FormTextField(props: TextFieldProps): ReactElement {
  const onChange = useFormChange(props, "Form.TextField", stringFormCodec);
  const onFocus = useFormEvent(props, "Form.TextField", stringFormCodec, "focus");
  const onBlur = useFormEvent(props, "Form.TextField", stringFormCodec, "blur");
  return createElement("form-text-field", {
    ...commonFormProps(props, onChange, stringFormCodec, onFocus, onBlur),
    ...(props.placeholder === undefined ? {} : { placeholder: props.placeholder }),
  });
}

function FormTextArea(props: TextAreaProps): ReactElement {
  const onChange = useFormChange(props, "Form.TextArea", stringFormCodec);
  const onFocus = useFormEvent(props, "Form.TextArea", stringFormCodec, "focus");
  const onBlur = useFormEvent(props, "Form.TextArea", stringFormCodec, "blur");
  return createElement("form-text-area", {
    ...commonFormProps(props, onChange, stringFormCodec, onFocus, onBlur),
    ...(props.placeholder === undefined ? {} : { placeholder: props.placeholder }),
    ...(props.enableMarkdown === undefined ? {} : { enableMarkdown: props.enableMarkdown }),
  });
}

function FormPasswordField(props: PasswordFieldProps): ReactElement {
  const onChange = useFormChange(props, "Form.PasswordField", stringFormCodec);
  const onFocus = useFormEvent(props, "Form.PasswordField", stringFormCodec, "focus");
  const onBlur = useFormEvent(props, "Form.PasswordField", stringFormCodec, "blur");
  return createElement("form-password-field", {
    ...commonFormProps(props, onChange, stringFormCodec, onFocus, onBlur),
    ...(props.placeholder === undefined ? {} : { placeholder: props.placeholder }),
  });
}

function FormCheckbox(props: CheckboxProps): ReactElement {
  assertFormString(props.label, "Form.Checkbox label");
  const normalized = props.defaultValue === undefined ? { ...props, defaultValue: false } : props;
  const onChange = useFormChange(normalized, "Form.Checkbox", booleanFormCodec);
  const onFocus = useFormEvent(normalized, "Form.Checkbox", booleanFormCodec, "focus");
  const onBlur = useFormEvent(normalized, "Form.Checkbox", booleanFormCodec, "blur");
  return createElement("form-checkbox", {
    ...commonFormProps(normalized, onChange, booleanFormCodec, onFocus, onBlur),
    label: props.label,
  });
}

function FormDropdown(props: DropdownProps): ReactElement {
  const onChange = useFormChange(props, "Form.Dropdown", stringFormCodec);
  const onFocus = useFormEvent(props, "Form.Dropdown", stringFormCodec, "focus");
  const onBlur = useFormEvent(props, "Form.Dropdown", stringFormCodec, "blur");
  return createElement(
    "form-dropdown",
    {
      ...commonFormProps(props, onChange, stringFormCodec, onFocus, onBlur),
      ...(props.placeholder === undefined ? {} : { placeholder: props.placeholder }),
    },
    mapDropdownChildren(props.children),
  );
}

function FormDropdownItem(props: DropdownItemProps): ReactElement {
  assertFormString(props.value, "Form.Dropdown.Item value");
  assertFormString(props.title, "Form.Dropdown.Item title");
  const icon = serializeIcon(props.icon, "Form.Dropdown.Item");
  return createElement("form-dropdown-item", {
    value: props.value,
    title: props.title,
    ...(icon === undefined ? {} : { icon: icon.icon, iconTintColor: icon.iconTintColor }),
  });
}

function FormDropdownSection(props: DropdownSectionProps): ReactElement {
  return createElement("form-dropdown-section", { title: props.title }, mapDropdownChildren(props.children));
}

function FormDescription(props: DescriptionProps): ReactElement {
  assertFormString(props.text, "Form.Description text");
  return createElement("form-description", {
    title: props.title,
    text: props.text,
  });
}

function FormSeparator(_props: SeparatorProps): ReactElement {
  return createElement("form-separator");
}

function assertFormString(value: unknown, where: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new CompatibilityError(`${where} must be a non-empty string`, { value });
  }
}

const DATE_PICKER_TYPES = {
  Date: "date",
  DateTime: "date_time",
} as const;

function normalizeDatePickerType(type: unknown): DatePickerType {
  if (type === undefined) {
    return DATE_PICKER_TYPES.DateTime;
  }
  if (type === DATE_PICKER_TYPES.Date || type === DATE_PICKER_TYPES.DateTime) {
    return type;
  }
  throw new CompatibilityError("Form.DatePicker type must be Form.DatePicker.Type.Date or DateTime", { type });
}

function serializeDatePickerValue(value: unknown, where: string): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new CompatibilityError(`${where} must be a valid Date`, { value });
  }
  return value.toISOString();
}

function isFullDayDate(date?: Date | null): boolean {
  return (
    date === undefined ||
    date === null ||
    (date instanceof Date &&
      Number.isFinite(date.getTime()) &&
      date.getHours() === 0 &&
      date.getMinutes() === 0 &&
      date.getSeconds() === 0 &&
      date.getMilliseconds() === 0)
  );
}

function FormDatePicker(props: DatePickerProps): ReactElement {
  const normalized = props.defaultValue === undefined ? { ...props, defaultValue: null } : props;
  const onChange = useFormChange(normalized, "Form.DatePicker", dateFormCodec);
  const onFocus = useFormEvent(normalized, "Form.DatePicker", dateFormCodec, "focus");
  const onBlur = useFormEvent(normalized, "Form.DatePicker", dateFormCodec, "blur");
  const type = normalizeDatePickerType(props.type);
  const min = props.min === undefined ? undefined : serializeDatePickerValue(props.min, "Form.DatePicker min");
  const max = props.max === undefined ? undefined : serializeDatePickerValue(props.max, "Form.DatePicker max");
  return createElement("form-date-picker", {
    ...commonFormProps(normalized, onChange, dateFormCodec, onFocus, onBlur),
    type,
    ...(min === undefined ? {} : { min }),
    ...(max === undefined ? {} : { max }),
  });
}

const DatePicker = Object.assign(FormDatePicker, {
  Type: DATE_PICKER_TYPES,
  isFullDay: isFullDayDate,
});

function FormTagPickerItem(props: TagPickerItemProps): ReactElement {
  assertFormString(props.value, "Form.TagPicker.Item value");
  assertFormString(props.title, "Form.TagPicker.Item title");
  const icon = serializeIcon(props.icon, "Form.TagPicker.Item");
  return createElement("form-tag-picker-item", {
    value: props.value,
    title: props.title,
    ...(icon === undefined ? {} : { icon: icon.icon, iconTintColor: icon.iconTintColor }),
  });
}

function FormTagPicker(props: TagPickerProps): ReactElement {
  const normalized = props.defaultValue === undefined ? { ...props, defaultValue: [] } : props;
  const onChange = useFormChange(normalized, "Form.TagPicker", stringArrayFormCodec);
  const onFocus = useFormEvent(normalized, "Form.TagPicker", stringArrayFormCodec, "focus");
  const onBlur = useFormEvent(normalized, "Form.TagPicker", stringArrayFormCodec, "blur");
  return createElement(
    "form-tag-picker",
    {
      ...commonFormProps(normalized, onChange, stringArrayFormCodec, onFocus, onBlur),
      ...(props.placeholder === undefined ? {} : { placeholder: props.placeholder }),
    },
    mapTagPickerChildren(props.children),
  );
}

const TagPicker = Object.assign(FormTagPicker, { Item: FormTagPickerItem });

function FormFilePicker(props: FilePickerProps): ReactElement {
  const normalized = props.defaultValue === undefined ? { ...props, defaultValue: [] } : props;
  const onChange = useFormChange(normalized, "Form.FilePicker", stringArrayFormCodec);
  const onFocus = useFormEvent(normalized, "Form.FilePicker", stringArrayFormCodec, "focus");
  const onBlur = useFormEvent(normalized, "Form.FilePicker", stringArrayFormCodec, "blur");
  return createElement("form-file-picker", {
    ...commonFormProps(normalized, onChange, stringArrayFormCodec, onFocus, onBlur),
    ...(props.canChooseFiles === undefined ? {} : { canChooseFiles: props.canChooseFiles }),
    ...(props.canChooseDirectories === undefined ? {} : { canChooseDirectories: props.canChooseDirectories }),
    ...(props.showHiddenFiles === undefined ? {} : { showHiddenFiles: props.showHiddenFiles }),
    ...(props.allowMultipleSelection === undefined ? {} : { allowMultipleSelection: props.allowMultipleSelection }),
  });
}

function mapFormChildren(children: ReactNode): ReactNode {
  return Children.toArray(children).map((child, index) => {
    if (child === null || child === undefined || typeof child === "boolean") {
      return null;
    }
    if (!isValidElement(child)) {
      return unsupported("A Form text child", { child });
    }
    if (
      child.type === FormTextField ||
      child.type === FormTextArea ||
      child.type === FormPasswordField ||
      child.type === FormCheckbox ||
      child.type === FormDropdown ||
      child.type === DatePicker ||
      child.type === TagPicker ||
      child.type === FormFilePicker ||
      child.type === FormDescription ||
      child.type === FormSeparator ||
      child.type === ActionPanel
    ) {
      return keyedElement(child, `form-${index}`);
    }
    if (isCompositeElement(child)) {
      return keyedElement(child, `form-${index}`);
    }
    return unsupported("A Form child that is not a measured form item or ActionPanel", {
      childType: String(child.type),
    });
  });
}

function mapTagPickerChildren(children: ReactNode): ReactNode {
  return Children.toArray(children).map((child, index) => {
    if (child === null || child === undefined || typeof child === "boolean") {
      return null;
    }
    if (!isValidElement(child)) {
      return unsupported("A Form.TagPicker text child", { child });
    }
    if (child.type === FormTagPickerItem) {
      return keyedElement(child, `tag-picker-${index}`);
    }
    if (isCompositeElement(child)) {
      return keyedElement(child, `tag-picker-${index}`);
    }
    return unsupported("A Form.TagPicker child that is not an item", {
      childType: String(child.type),
    });
  });
}

function mapDropdownChildren(children: ReactNode): ReactNode {
  return Children.toArray(children).map((child, index) => {
    if (child === null || child === undefined || typeof child === "boolean") {
      return null;
    }
    if (!isValidElement(child)) {
      return unsupported("A Form.Dropdown text child", { child });
    }
    if (child.type === FormDropdownItem || child.type === FormDropdownSection) {
      return keyedElement(child, `dropdown-${index}`);
    }
    if (isCompositeElement(child)) {
      return keyedElement(child, `dropdown-${index}`);
    }
    return unsupported("A Form.Dropdown child that is not an item or section", {
      childType: String(child.type),
    });
  });
}

interface FormComponent {
  (props: FormProps): ReactElement;
  TextField: typeof FormTextField;
  TextArea: typeof FormTextArea;
  PasswordField: typeof FormPasswordField;
  Checkbox: typeof FormCheckbox;
  Dropdown: typeof FormDropdown & {
    Item: typeof FormDropdownItem;
    Section: typeof FormDropdownSection;
  };
  Description: typeof FormDescription;
  Separator: typeof FormSeparator;
  DatePicker: typeof DatePicker;
  TagPicker: typeof TagPicker;
  FilePicker: typeof FormFilePicker;
}

function FormComponent(props: FormProps): ReactElement {
  if (props.searchBarAccessory !== undefined && props.searchBarAccessory !== null) {
    unsupported("Form searchBarAccessory");
  }
  const runtime = useMemo(() => createFormRuntime(), []);
  runtime.resetFields();
  return createElement(
    FormContext.Provider,
    { value: runtime },
    createElement(
      "form",
      {
        ...(props.navigationTitle === undefined ? {} : { navigationTitle: props.navigationTitle }),
        ...(props.isLoading === undefined ? {} : { isLoading: props.isLoading }),
        ...(props.enableDrafts === undefined ? {} : { enableDrafts: props.enableDrafts }),
      },
      mapFormChildren(Children.toArray([props.actions, props.children])),
    ),
  );
}

export const Form: FormComponent = Object.assign(FormComponent, {
  TextField: FormTextField,
  TextArea: FormTextArea,
  PasswordField: FormPasswordField,
  Checkbox: FormCheckbox,
  Dropdown: Object.assign(FormDropdown, { Item: FormDropdownItem, Section: FormDropdownSection }),
  Description: FormDescription,
  Separator: FormSeparator,
  DatePicker,
  TagPicker,
  FilePicker: FormFilePicker,
});

export namespace Form {
  export type ItemProps<T extends FormValue> = FormItemProps<T>;
  export type Value = FormValue;
  export type Values = FormValues;
  export type Event<T extends FormValue = FormValue> = FormEvent<T>;
  export namespace Event {
    export type Type = FormEventType;
  }
}

function ActionPanelComponent(props: ActionPanelProps): ReactElement {
  return createElement("action-group", { title: props.title }, mapItemChildren(props.children, "ActionPanel"));
}

function Submenu(props: SubmenuProps): ReactElement {
  const icon = serializeIcon(props.icon, "ActionPanel.Submenu");
  const shortcut = serializeShortcut(props.shortcut, "ActionPanel.Submenu");
  return createElement(
    "action-group",
    {
      title: props.title,
      ...(icon === undefined ? {} : { icon: icon.icon, iconTintColor: icon.iconTintColor }),
      ...(shortcut === undefined ? {} : { shortcut }),
      ...(props.autoFocus === undefined ? {} : { autoFocus: props.autoFocus }),
    },
    mapItemChildren(props.children, "ActionPanel.Submenu"),
  );
}

function Section(props: ActionPanelProps): ReactElement {
  return createElement("action-group", { title: props.title }, mapItemChildren(props.children, "ActionPanel.Section"));
}

interface ActionPanelComponent {
  (props: ActionPanelProps): ReactElement;
  Section: typeof Section;
  Submenu: typeof Submenu;
}

export const ActionPanel: ActionPanelComponent = Object.assign(ActionPanelComponent, { Section, Submenu });

function ActionComponent(props: ActionProps): ReactElement {
  const icon = serializeIcon(props.icon, "Action");
  const shortcut = serializeShortcut(props.shortcut, "Action");
  const style = normalizeActionStyle(props.style, "Action");
  return createElement("action", {
    title: props.title,
    ...(icon === undefined ? {} : { icon: icon.icon, iconTintColor: icon.iconTintColor }),
    ...(shortcut === undefined ? {} : { shortcut }),
    ...(style === undefined ? {} : { style }),
    ...(props.autoFocus === undefined ? {} : { autoFocus: props.autoFocus }),
    onAction: (event: SceneEventPayload) => {
      props.onAction?.(event);
    },
  });
}

function SubmitForm<T extends FormValues = FormValues>(props: SubmitFormProps<T>): ReactElement {
  if (props.onSubmit !== undefined && typeof props.onSubmit !== "function") {
    throw new CompatibilityError("Action.SubmitForm onSubmit must be a function", { onSubmit: props.onSubmit });
  }
  const form = requireFormContext("Action.SubmitForm");
  return createElement(Action, {
    title: props.title ?? "Submit Form",
    ...(props.icon === undefined ? {} : { icon: props.icon }),
    ...(props.shortcut === undefined ? {} : { shortcut: props.shortcut }),
    ...(props.style === undefined ? {} : { style: props.style }),
    onAction: (event) => {
      const values = form.submit(event?.values);
      void props.onSubmit?.(values as T);
    },
  });
}

/** @deprecated Use `Action.SubmitForm` instead. */
export const SubmitFormAction = SubmitForm;

function Push(props: PushProps): ReactElement {
  const icon = serializeIcon(props.icon, "Action.Push");
  const shortcut = serializeShortcut(props.shortcut, "Action.Push");
  const style = normalizeActionStyle(props.style, "Action.Push");
  if (props.onPush !== undefined && typeof props.onPush !== "function") {
    throw new CompatibilityError("Action.Push onPush must be a function", { onPush: props.onPush });
  }
  if (props.onPop !== undefined && typeof props.onPop !== "function") {
    throw new CompatibilityError("Action.Push onPop must be a function", { onPop: props.onPop });
  }
  const target = requireNavigationElement(props.target, "Action.Push");
  const navigation = useContext(NavigationContext);
  return createElement("action", {
    title: props.title,
    ...(icon === undefined ? {} : { icon: icon.icon, iconTintColor: icon.iconTintColor }),
    ...(shortcut === undefined ? {} : { shortcut }),
    ...(style === undefined ? {} : { style }),
    ...(props.autoFocus === undefined ? {} : { autoFocus: props.autoFocus }),
    onAction: () => {
      navigation.push(target, props.onPop);
      void props.onPush?.();
    },
  });
}

/** @deprecated Use `Action.Push` instead. */
export const PushAction = Push;

function CopyToClipboard(props: CopyToClipboardProps): ReactElement {
  const icon = serializeIcon(props.icon, "Action.CopyToClipboard");
  const shortcut = serializeShortcut(props.shortcut, "Action.CopyToClipboard");
  const style = normalizeActionStyle(props.style, "Action.CopyToClipboard");
  return createElement("action", {
    title: props.title ?? "Copy to Clipboard",
    ...(icon === undefined ? { icon: "clipboard" } : { icon: icon.icon, iconTintColor: icon.iconTintColor }),
    ...(shortcut === undefined ? {} : { shortcut }),
    ...(style === undefined ? {} : { style }),
    ...(props.autoFocus === undefined ? {} : { autoFocus: props.autoFocus }),
    onAction: () => {
      void copyToClipboard(props.content, {
        ...(props.transient === undefined ? {} : { transient: props.transient }),
        ...(props.concealed === undefined ? {} : { concealed: props.concealed }),
      }).then(() => props.onCopy?.(props.content));
    },
  });
}

function OpenInBrowser(props: OpenInBrowserProps): ReactElement {
  const url = requireNonEmptyString(props.url, "Action.OpenInBrowser url");
  const icon = serializeIcon(props.icon ?? "globe", "Action.OpenInBrowser");
  const shortcut = serializeShortcut(props.shortcut, "Action.OpenInBrowser");
  return createElement("action", {
    title: props.title ?? "Open in Browser",
    ...(icon === undefined ? {} : { icon: icon.icon, iconTintColor: icon.iconTintColor }),
    ...(shortcut === undefined ? {} : { shortcut }),
    onAction: () => {
      void open(url).then(() => props.onOpen?.(url));
    },
  });
}

function Open(props: OpenProps): ReactElement {
  const target = requireNonEmptyString(props.target, "Action.Open target");
  const application =
    props.application === undefined ? undefined : serializeApplication(props.application, "Action.Open");
  const icon = serializeIcon(props.icon ?? "finder", "Action.Open");
  const shortcut = serializeShortcut(props.shortcut, "Action.Open");
  return createElement("action", {
    title: props.title,
    ...(icon === undefined ? {} : { icon: icon.icon, iconTintColor: icon.iconTintColor }),
    ...(shortcut === undefined ? {} : { shortcut }),
    onAction: () => {
      void open(target, application).then(() => props.onOpen?.(target));
    },
  });
}

function OpenWith(props: OpenWithProps): ReactElement {
  const path = requireNonEmptyString(props.path, "Action.OpenWith path");
  const icon = serializeIcon(props.icon ?? "upload", "Action.OpenWith");
  const shortcut = serializeShortcut(props.shortcut, "Action.OpenWith");
  return createElement("action", {
    title: props.title ?? "Open With",
    ...(icon === undefined ? {} : { icon: icon.icon, iconTintColor: icon.iconTintColor }),
    ...(shortcut === undefined ? {} : { shortcut }),
    onAction: () => {
      void openWith(path).then(() => props.onOpen?.(path));
    },
  });
}

function Paste(props: PasteProps): ReactElement {
  const icon = serializeIcon(props.icon ?? "clipboard", "Action.Paste");
  const shortcut = serializeShortcut(props.shortcut, "Action.Paste");
  return createElement("action", {
    title: props.title ?? "Paste in Active App",
    ...(icon === undefined ? {} : { icon: icon.icon, iconTintColor: icon.iconTintColor }),
    ...(shortcut === undefined ? {} : { shortcut }),
    onAction: () => {
      void pasteToClipboard(props.content).then(() => props.onPaste?.(props.content));
    },
  });
}

/** @deprecated Use `Action.CopyToClipboard` instead. */
export const CopyToClipboardAction = CopyToClipboard;

/** @deprecated Use `Action.OpenInBrowser` instead. */
export const OpenInBrowserAction = OpenInBrowser;

/** @deprecated Use `Action.Open` instead. */
export const OpenAction = Open;

/** @deprecated Use `Action.OpenWith` instead. */
export const OpenWithAction = OpenWith;

/** @deprecated Use `Action.Paste` instead. */
export const PasteAction = Paste;

function mapListSectionChildren(children: ReactNode): ReactNode {
  return Children.toArray(children).map((child, index) => {
    if (child === null || child === undefined || typeof child === "boolean") {
      return null;
    }
    if (!isValidElement(child)) {
      return unsupported("A List.Section text child", { child });
    }
    if (child.type === ListItem || isCompositeElement(child)) {
      return keyedElement(child, `list-section-${index}`);
    }
    return unsupported("A List.Section child that is not a List.Item", { childType: String(child.type) });
  });
}

function mapGridChildren(children: ReactNode): ReactNode {
  return Children.toArray(children).map((child, index) => {
    if (child === null || child === undefined || typeof child === "boolean") {
      return null;
    }
    if (!isValidElement(child)) {
      return unsupported("A Grid text child", { child });
    }
    if (
      child.type === GridItem ||
      child.type === GridSection ||
      child.type === GridEmptyView ||
      child.type === GridDropdown ||
      child.type === ActionPanel
    ) {
      return keyedElement(child, `grid-${index}`);
    }
    if (isCompositeElement(child)) {
      return keyedElement(child, `grid-${index}`);
    }
    return unsupported("A Grid child that is not a measured item, section, empty view, dropdown, or ActionPanel", {
      childType: String(child.type),
    });
  });
}

function mapGridSectionChildren(children: ReactNode): ReactNode {
  return Children.toArray(children).map((child, index) => {
    if (child === null || child === undefined || typeof child === "boolean") {
      return null;
    }
    if (!isValidElement(child)) {
      return unsupported("A Grid.Section child that is not a Grid.Item", {
        childType: typeof child,
      });
    }
    if (child.type !== GridItem && !isCompositeElement(child)) {
      return unsupported("A Grid.Section child that is not a Grid.Item", { childType: String(child.type) });
    }
    return keyedElement(child, `grid-section-${index}`);
  });
}

function mapGridDropdownChildren(children: ReactNode): ReactNode {
  return Children.toArray(children).map((child, index) => {
    if (child === null || child === undefined || typeof child === "boolean") {
      return null;
    }
    if (!isValidElement(child)) {
      return unsupported("A Grid.Dropdown text child", { child });
    }
    if (child.type === GridDropdownItem || child.type === GridDropdownSection) {
      return keyedElement(child, `grid-dropdown-${index}`);
    }
    if (isCompositeElement(child)) {
      return keyedElement(child, `grid-dropdown-${index}`);
    }
    return unsupported("A Grid.Dropdown child that is not an item or section", {
      childType: String(child.type),
    });
  });
}

function mapMenuBarChildren(children: ReactNode, where: string): ReactNode {
  return Children.toArray(children).map((child, index) => {
    if (child === null || child === undefined || typeof child === "boolean") {
      return null;
    }
    if (!isValidElement(child)) {
      return unsupported(`A ${where} text child`, { child });
    }
    if (
      child.type === MenuBarExtraItem ||
      child.type === MenuBarExtraSection ||
      child.type === MenuBarExtraSubmenu ||
      child.type === MenuBarExtraSeparator
    ) {
      return keyedElement(child, `${where}-${index}`);
    }
    if (isCompositeElement(child)) {
      return keyedElement(child, `${where}-${index}`);
    }
    return unsupported(`A ${where} child that is not a measured menu-bar item, section, submenu, or separator`, {
      childType: String(child.type),
    });
  });
}

interface ActionComponent {
  (props: ActionProps): ReactElement;
  CopyToClipboard: typeof CopyToClipboard;
  Open: typeof Open;
  OpenInBrowser: typeof OpenInBrowser;
  OpenWith: typeof OpenWith;
  Paste: typeof Paste;
  Push: typeof Push;
  SubmitForm: typeof SubmitForm;
  Style: typeof ActionStyle;
}

export const Action: ActionComponent = Object.assign(ActionComponent, {
  CopyToClipboard,
  Open,
  OpenInBrowser,
  OpenWith,
  Paste,
  Push,
  SubmitForm,
  Style: ActionStyle,
});

/** @deprecated Use `Action` instead. */
export const ActionPanelItem = Action;

function serializeClipboardContent(content: string | number | Clipboard.Content, where: string): CapabilityArguments {
  if (typeof content === "string") {
    return { text: content };
  }
  if (typeof content === "number" && Number.isFinite(content)) {
    return { text: String(content) };
  }
  if (!isRecord(content)) {
    unsupported(`${where} content`, { content });
  }
  const contentRecord = content as Record<string, unknown>;
  if (typeof contentRecord.text === "string" && Object.keys(contentRecord).every((key) => key === "text")) {
    return { contentJSON: JSON.stringify({ text: contentRecord.text }) };
  }
  if (Object.hasOwn(contentRecord, "file") && Object.keys(contentRecord).every((key) => key === "file")) {
    return {
      contentJSON: JSON.stringify({ file: serializePathLike(contentRecord.file as PathLike, `${where} file`) }),
    };
  }
  if (
    typeof contentRecord.html === "string" &&
    Object.keys(contentRecord).every((key) => key === "html" || key === "text")
  ) {
    if (contentRecord.text !== undefined && typeof contentRecord.text !== "string") {
      unsupported(`${where} text`, { value: contentRecord.text });
    }
    return {
      contentJSON: JSON.stringify({
        html: contentRecord.html,
        ...(contentRecord.text === undefined ? {} : { text: contentRecord.text }),
      }),
    };
  }
  unsupported(`${where} content`, { content });
}

async function copyToClipboard(
  content: string | number | Clipboard.Content,
  options?: Clipboard.CopyOptions,
): Promise<void> {
  const argumentsValue: Record<string, string | number | boolean> = {
    ...serializeClipboardContent(content, "Clipboard.copy"),
  };
  if (options !== undefined) {
    if (!isRecord(options)) {
      unsupported("Clipboard.copy options", { options });
    }
    if (options.transient !== undefined) {
      if (typeof options.transient !== "boolean") {
        unsupported("Clipboard.copy transient", { value: options.transient });
      }
      argumentsValue.transient = options.transient;
    }
    if (options.concealed !== undefined) {
      if (typeof options.concealed !== "boolean") {
        unsupported("Clipboard.copy concealed", { value: options.concealed });
      }
      argumentsValue.concealed = options.concealed;
    }
  }
  const response = await requireContext().requestCapability({
    capability: "clipboard",
    operation: "write",
    arguments: argumentsValue,
  });
  if (response.outcome !== "succeeded") {
    throw new CompatibilityError("The clipboard write capability was not granted", response);
  }
}

async function pasteToClipboard(content: string | number | Clipboard.Content): Promise<void> {
  const response = await requireContext().requestCapability({
    capability: "clipboard",
    operation: "paste",
    arguments: serializeClipboardContent(content, "Clipboard.paste"),
  });
  if (response.outcome !== "succeeded") {
    throw new CompatibilityError("The clipboard paste capability was not granted", response);
  }
}

function mapItemChildren(children: ReactNode, where: string): ReactNode {
  return Children.toArray(children).map((child, index) => {
    if (child === null || child === undefined || typeof child === "boolean") {
      return null;
    }
    if (!isValidElement(child)) {
      return unsupported(`A ${where} text child`, { child });
    }
    if (
      child.type === ActionPanel ||
      child.type === Submenu ||
      child.type === Section ||
      child.type === Action ||
      child.type === SubmitForm ||
      child.type === CopyToClipboard ||
      child.type === OpenInBrowser ||
      child.type === Open ||
      child.type === OpenWith ||
      child.type === Paste ||
      child.type === Push
    ) {
      return keyedElement(child, `${where}-${index}`);
    }
    if (isCompositeElement(child)) {
      return keyedElement(child, `${where}-${index}`);
    }
    return unsupported(`A ${where} child that is not an action`, { childType: String(child.type) });
  });
}

function isCompositeElement(element: ReactElement): boolean {
  return typeof element.type === "function" || (element.type as unknown) === Fragment;
}

function keyedElement(child: ReactNode, key: string): ReactNode {
  return isValidElement(child) ? cloneElement(child, { key }) : child;
}

export const Clipboard = {
  async copy(content: string | number | Clipboard.Content, options?: Clipboard.CopyOptions): Promise<void> {
    await copyToClipboard(content, options);
  },
  async paste(content: string | number | Clipboard.Content): Promise<void> {
    await pasteToClipboard(content);
  },
  async read(): Promise<string> {
    const response = await requireContext().requestCapability({ capability: "clipboard", operation: "read" });
    if (response.outcome !== "succeeded") {
      throw new CompatibilityError("The clipboard read capability was not granted", response);
    }
    return typeof response.value === "string" ? response.value : "";
  },
};

export namespace Clipboard {
  export type Content =
    | { readonly text: string }
    | { readonly file: PathLike }
    | { readonly html: string; readonly text?: string };

  export type CopyOptions = {
    readonly transient?: boolean;
    readonly concealed?: boolean;
  };
}

function normalizeToastStyle(style: unknown): SceneToastStyle {
  if (style === "success" || style === "SUCCESS") {
    return "success";
  }
  if (style === "failure" || style === "FAILURE") {
    return "failure";
  }
  if (style === "animated" || style === "ANIMATED") {
    return "animated";
  }
  return "neutral";
}

export interface ToastActionOptions {
  readonly title: string;
  readonly shortcut?: ShortcutLike;
  readonly onAction: (toast: Toast) => void;
}

export interface ToastOptions {
  readonly title: string;
  readonly message?: string;
  readonly style?: unknown;
  readonly primaryAction?: ToastActionOptions;
  readonly secondaryAction?: ToastActionOptions;
}

type ToastActionSlot = "primaryAction" | "secondaryAction";

interface RegisteredToastAction {
  readonly eventId: string;
  readonly callback: (toast: Toast) => void;
}

let toastCounter = 0;
let toastEventCounter = 0;

function normalizeToastAction(action: ToastActionOptions | undefined, where: string): ToastActionOptions | undefined {
  if (action === undefined) {
    return undefined;
  }
  if (typeof action !== "object" || action === null) {
    throw new CompatibilityError(`${where} must be an object`, { action });
  }
  if (typeof action.title !== "string" || action.title.length === 0) {
    throw new CompatibilityError(`${where} requires a non-empty title`, { action });
  }
  if (typeof action.onAction !== "function") {
    throw new CompatibilityError(`${where} onAction must be a function`, { action });
  }
  return action;
}

export class Toast {
  static readonly Style = {
    Success: "success",
    Failure: "failure",
    Animated: "animated",
  } as const;

  readonly #toastId = `toast-${++toastCounter}`;
  #title: string;
  #message: string | undefined;
  #style: SceneToastStyle;
  #primaryAction: ToastActionOptions | undefined;
  #secondaryAction: ToastActionOptions | undefined;
  #registeredActions = new Map<ToastActionSlot, RegisteredToastAction>();
  #shown = false;
  #sendQueue: Promise<void> = Promise.resolve();

  constructor(options: ToastOptions) {
    this.#title = options.title;
    this.#message = options.message;
    this.#style = normalizeToastStyle(options.style);
    this.#primaryAction = normalizeToastAction(options.primaryAction, "Toast.primaryAction");
    this.#secondaryAction = normalizeToastAction(options.secondaryAction, "Toast.secondaryAction");
  }

  get style(): SceneToastStyle {
    return this.#style;
  }

  set style(style: unknown) {
    this.#style = normalizeToastStyle(style);
    this.queueUpdate();
  }

  get title(): string {
    return this.#title;
  }

  set title(title: string) {
    this.#title = title;
    this.queueUpdate();
  }

  get message(): string | undefined {
    return this.#message;
  }

  set message(message: string | undefined) {
    this.#message = message;
    this.queueUpdate();
  }

  get primaryAction(): ToastActionOptions | undefined {
    return this.#primaryAction;
  }

  set primaryAction(action: ToastActionOptions | undefined) {
    this.#primaryAction = normalizeToastAction(action, "Toast.primaryAction");
    this.queueUpdate();
  }

  get secondaryAction(): ToastActionOptions | undefined {
    return this.#secondaryAction;
  }

  set secondaryAction(action: ToastActionOptions | undefined) {
    this.#secondaryAction = normalizeToastAction(action, "Toast.secondaryAction");
    this.queueUpdate();
  }

  async show(): Promise<void> {
    const operation: ToastOperation = this.#shown ? "update" : "show";
    await this.enqueue(operation);
    this.#shown = true;
  }

  async hide(): Promise<void> {
    if (!this.#shown) {
      return;
    }
    await this.enqueue("hide");
    this.#shown = false;
    this.clearActionEvents();
  }

  toPayload(): ToastPayload {
    return this.payloadFor(this.#shown ? "update" : "show");
  }

  private payloadFor(operation: ToastOperation): ToastPayload {
    if (operation === "hide") {
      return { toastId: this.#toastId, operation };
    }
    const primaryAction = this.serializeAction("primaryAction", this.#primaryAction);
    const secondaryAction = this.serializeAction("secondaryAction", this.#secondaryAction);
    return {
      toastId: this.#toastId,
      operation,
      title: this.#title,
      ...(this.#message === undefined ? {} : { message: this.#message }),
      style: this.#style,
      ...(primaryAction === undefined ? {} : { primaryAction }),
      ...(secondaryAction === undefined ? {} : { secondaryAction }),
    };
  }

  private serializeAction(
    slot: ToastActionSlot,
    action: ToastActionOptions | undefined,
  ): ToastActionPayload | undefined {
    if (action === undefined) {
      this.unregisterAction(slot);
      return undefined;
    }
    const normalized = normalizeToastAction(action, `Toast.${slot}`) as ToastActionOptions;
    const shortcut = serializeShortcut(normalized.shortcut, `Toast.${slot}`);
    const existing = this.#registeredActions.get(slot);
    if (existing !== undefined && existing.callback === normalized.onAction) {
      return {
        title: normalized.title,
        eventId: existing.eventId,
        ...(shortcut === undefined ? {} : { shortcut }),
      };
    }
    this.unregisterAction(slot);
    const eventId = `toast-event-${++toastEventCounter}`;
    compatGlobals.toastEvents?.set(eventId, () => normalized.onAction(this));
    this.#registeredActions.set(slot, { eventId, callback: normalized.onAction });
    return { title: normalized.title, eventId, ...(shortcut === undefined ? {} : { shortcut }) };
  }

  private unregisterAction(slot: ToastActionSlot): void {
    const existing = this.#registeredActions.get(slot);
    if (existing === undefined) {
      return;
    }
    compatGlobals.toastEvents?.delete(existing.eventId);
    this.#registeredActions.delete(slot);
  }

  private clearActionEvents(): void {
    this.unregisterAction("primaryAction");
    this.unregisterAction("secondaryAction");
  }

  private enqueue(operation: ToastOperation): Promise<void> {
    const payload = this.payloadFor(operation);
    const request = this.#sendQueue.then(() => requireContext().showToast(payload));
    this.#sendQueue = request.catch(() => undefined);
    return request;
  }

  private queueUpdate(): void {
    if (!this.#shown) {
      return;
    }
    void this.enqueue("update").catch(() => {});
  }
}

/**
 * Shows a toast in the client and returns the instance.
 */
export function showToast(options: ToastOptions): Promise<Toast>;
export function showToast(style: ToastStyle | SceneToastStyle, title: string, message?: string): Promise<Toast>;
export function showToast(title: string): Promise<Toast>;
export function showToast(
  optionsOrStyle: ToastOptions | ToastStyle | SceneToastStyle | string,
  title?: string,
  message?: string,
): Promise<Toast> {
  const toast =
    typeof optionsOrStyle === "string"
      ? title === undefined
        ? new Toast({ title: optionsOrStyle })
        : new Toast({
            title,
            style: optionsOrStyle,
            ...(message === undefined ? {} : { message }),
          })
      : new Toast(optionsOrStyle);
  return toast.show().then(() => toast);
}

export interface ClearSearchBarOptions {
  readonly forceScrollToTop?: boolean;
}

export interface ShowHUDOptions {
  readonly clearRootSearch?: boolean;
  readonly popToRootType?: PopToRootType;
}

export interface CloseMainWindowOptions {
  readonly clearRootSearch?: boolean;
  readonly popToRootType?: PopToRootType;
}

export interface PopToRootOptions {
  readonly clearSearchBar?: boolean;
}

type CapabilityArguments = Readonly<Record<string, string | number | boolean>>;

async function callCapability(
  capability: string,
  operation: string,
  argumentsValue: CapabilityArguments | undefined,
  description: string,
): Promise<Awaited<ReturnType<RaycastCompatContext["requestCapability"]>>> {
  const response = await requireContext().requestCapability({
    capability,
    operation,
    ...(argumentsValue === undefined ? {} : { arguments: argumentsValue }),
  });
  if (response.outcome !== "succeeded") {
    throw new CompatibilityError(`${description} capability was not granted`, response);
  }
  return response;
}

/** Reports an exception without allowing telemetry availability to affect a command. */
export function captureException(exception: unknown): void {
  const exceptionJSON = serializeCapturedException(exception);
  void callCapability("telemetry", "captureException", { exceptionJSON }, "The captureException").catch(() => {});
}

function serializeCapturedException(exception: unknown): string {
  if (exception instanceof Error) {
    return JSON.stringify({
      name: exception.name,
      message: exception.message,
      ...(exception.stack === undefined ? {} : { stack: exception.stack }),
    });
  }
  try {
    const serialized = JSON.stringify(exception);
    if (serialized !== undefined) {
      return serialized;
    }
  } catch {
    // Fall through to a string representation for circular or hostile values.
  }
  let message: string;
  try {
    message = String(exception);
  } catch {
    message = "Unserializable exception";
  }
  return JSON.stringify({ message });
}

/** Updates the current command's measured subtitle metadata through the host. */
export async function updateCommandMetadata(metadata: CommandMetadata): Promise<void> {
  if (!isRecord(metadata)) {
    unsupported("updateCommandMetadata metadata", { metadata });
  }
  for (const key of Object.keys(metadata)) {
    if (key !== "subtitle") {
      unsupported(`updateCommandMetadata ${key}`, { metadata });
    }
  }
  const subtitle = metadata.subtitle;
  if (subtitle !== undefined && subtitle !== null && typeof subtitle !== "string") {
    unsupported("updateCommandMetadata subtitle", { value: subtitle });
  }
  const argumentsValue = subtitle === undefined ? undefined : subtitle === null ? { clear: true } : { subtitle };
  await callCapability("command", "updateMetadata", argumentsValue, "The updateCommandMetadata");
}

/** Requests the client to display a transient heads-up message. */
export async function showHUD(title: string, options?: ShowHUDOptions): Promise<void> {
  const args: Record<string, string | number | boolean> = {
    title: requireNonEmptyString(title, "showHUD title"),
  };
  if (options !== undefined && options !== null) {
    if (!isRecord(options)) {
      unsupported("showHUD options", { options });
    }
    if (options.clearRootSearch !== undefined) {
      if (typeof options.clearRootSearch !== "boolean") {
        unsupported("showHUD clearRootSearch", { value: options.clearRootSearch });
      }
      args.clearRootSearch = options.clearRootSearch;
    }
    if (options.popToRootType !== undefined) {
      if (
        options.popToRootType !== PopToRootType.Default &&
        options.popToRootType !== PopToRootType.Immediate &&
        options.popToRootType !== PopToRootType.Suspended
      ) {
        unsupported("showHUD popToRootType", { value: options.popToRootType });
      }
      args.popToRootType = options.popToRootType;
    }
  }
  await callCapability("hud", "show", args, "The HUD show");
}

function serializeApplication(application: string | ApplicationLike, where: string): string {
  if (typeof application === "string") {
    return requireNonEmptyString(application, where);
  }
  if (!isRecord(application)) {
    unsupported(`${where} application`, { application });
  }
  for (const field of ["bundleId", "path", "windowsAppId", "name", "localizedName"]) {
    const value = application[field];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  unsupported(`${where} application`, { application });
}

/** Opens a URL, file, or application through the host capability boundary. */
export async function open(target: string, application?: string | ApplicationLike): Promise<void> {
  const args: Record<string, string | number | boolean> = {
    target: requireNonEmptyString(target, "open target"),
  };
  if (application !== undefined) {
    args.application = serializeApplication(application, "open");
  }
  await callCapability("open", "open", args, "The open");
}

/** Opens a path with the host's application chooser. */
async function openWith(path: string): Promise<void> {
  await callCapability(
    "open",
    "open",
    { target: requireNonEmptyString(path, "openWith path"), openWith: true },
    "The open-with",
  );
}

/** Reveals a file or directory in Finder through the host. */
export async function showInFinder(path: PathLike): Promise<void> {
  await callCapability("finder", "show", { path: serializePathLike(path, "showInFinder path") }, "The showInFinder");
}

/** Moves one or more files or directories to the host's trash provider. */
export async function trash(path: PathLike | PathLike[]): Promise<void> {
  const paths = (Array.isArray(path) ? path : [path]).map((entry) => serializePathLike(entry, "trash path"));
  await callCapability("filesystem", "trash", { pathsJSON: JSON.stringify(paths) }, "The trash");
}

/** Returns the selected text from the frontmost application through the host. */
export async function getSelectedText(): Promise<string> {
  const response = await callCapability("selection", "read", undefined, "The getSelectedText");
  if (typeof response.value !== "string") {
    throw new CompatibilityError("The selected-text capability returned no text", response);
  }
  return response.value;
}

/** Returns applications that can open the optional path through the host. */
export async function getApplications(path?: PathLike): Promise<Application[]> {
  const argumentsValue = path === undefined ? undefined : { path: serializePathLike(path, "getApplications path") };
  const response = await callCapability("application", "list", argumentsValue, "The getApplications");
  return deserializeApplications(response.value);
}

/** Returns the default application that opens a file or folder through the host. */
export async function getDefaultApplication(path: PathLike): Promise<Application> {
  const response = await callCapability(
    "application",
    "default",
    { path: serializePathLike(path, "getDefaultApplication path") },
    "The getDefaultApplication",
  );
  return deserializeApplication(
    parseJSONCapabilityValue(response.value, "getDefaultApplication"),
    "getDefaultApplication",
  );
}

/** Returns the selected Finder items through the host. */
export async function getSelectedFinderItems(): Promise<FileSystemItem[]> {
  const response = await callCapability("finder", "selectedItems", undefined, "The getSelectedFinderItems");
  return deserializeFileSystemItems(response.value);
}

/** Returns the frontmost application through the host. */
export async function getFrontmostApplication(): Promise<Application> {
  const response = await callCapability("application", "frontmost", undefined, "The getFrontmostApplication");
  return deserializeApplication(
    parseJSONCapabilityValue(response.value, "getFrontmostApplication"),
    "getFrontmostApplication",
  );
}

function serializePathLike(value: PathLike, where: string): string {
  if (typeof value === "string") {
    return requireNonEmptyString(value, where);
  }
  if (value instanceof URL) {
    return requireNonEmptyString(value.toString(), where);
  }
  if (value instanceof Uint8Array) {
    return requireNonEmptyString(new TextDecoder().decode(value), where);
  }
  unsupported(`${where} must be a path-like value`, { value });
}

function parseJSONCapabilityValue(value: unknown, where: string): unknown {
  if (typeof value !== "string") {
    throw new CompatibilityError(`The ${where} capability returned no JSON value`, { value });
  }
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new CompatibilityError(`The ${where} capability returned invalid JSON`, {
      value,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

function decodeLocalStorageItems<T extends LocalStorageValues>(value: unknown): T {
  const decoded = parseJSONCapabilityValue(value, "local-storage.getAll");
  if (!isRecord(decoded)) {
    throw new CompatibilityError("The local-storage.getAll capability returned a non-object", { value: decoded });
  }
  for (const [key, item] of Object.entries(decoded)) {
    if (typeof item !== "string" && typeof item !== "number" && typeof item !== "boolean") {
      throw new CompatibilityError(`The local-storage.getAll result has an invalid value for ${JSON.stringify(key)}`, {
        value: item,
      });
    }
  }
  return decoded as T;
}

function deserializeApplications(value: unknown): Application[] {
  const decoded = parseJSONCapabilityValue(value, "getApplications");
  if (!Array.isArray(decoded)) {
    throw new CompatibilityError("The getApplications capability returned a non-array", { value: decoded });
  }
  return decoded.map((entry, index) => deserializeApplication(entry, `getApplications result ${index}`));
}

function deserializeBrowserTabs(value: unknown): BrowserExtension.Tab[] {
  const decoded = parseJSONCapabilityValue(value, "BrowserExtension.getTabs");
  if (!Array.isArray(decoded)) {
    throw new CompatibilityError("The BrowserExtension.getTabs capability returned a non-array", { value: decoded });
  }
  return decoded.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new CompatibilityError(`The BrowserExtension.getTabs result ${index} is invalid`, { value: entry });
    }
    if (typeof entry.id !== "number" || !Number.isInteger(entry.id) || entry.id < 0) {
      throw new CompatibilityError(`The BrowserExtension.getTabs result ${index} has an invalid id`, {
        value: entry.id,
      });
    }
    if (typeof entry.active !== "boolean") {
      throw new CompatibilityError(`The BrowserExtension.getTabs result ${index} has an invalid active flag`, {
        value: entry.active,
      });
    }
    return {
      id: entry.id,
      url: requireString(entry.url, `BrowserExtension.getTabs result ${index} url`),
      active: entry.active,
      ...(entry.title === undefined
        ? {}
        : { title: requireString(entry.title, `BrowserExtension.getTabs result ${index} title`) }),
      ...(entry.favicon === undefined
        ? {}
        : { favicon: requireString(entry.favicon, `BrowserExtension.getTabs result ${index} favicon`) }),
    };
  });
}

function deserializeApplication(value: unknown, where: string): Application {
  if (!isRecord(value)) {
    throw new CompatibilityError(`The ${where} capability returned an invalid application`, { value });
  }
  const application: {
    name: string;
    path: string;
    localizedName?: string;
    bundleId?: string;
    windowsAppId?: string;
  } = {
    name: requireNonEmptyString(value.name, `${where} name`),
    path: requireNonEmptyString(value.path, `${where} path`),
  };
  for (const field of ["localizedName", "bundleId", "windowsAppId"] as const) {
    const fieldValue = value[field];
    if (fieldValue !== undefined) {
      application[field] = requireNonEmptyString(fieldValue, `${where} ${field}`);
    }
  }
  return application;
}

function deserializeFileSystemItems(value: unknown): FileSystemItem[] {
  const decoded = parseJSONCapabilityValue(value, "getSelectedFinderItems");
  if (!Array.isArray(decoded)) {
    throw new CompatibilityError("The getSelectedFinderItems capability returned a non-array", { value: decoded });
  }
  return decoded.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new CompatibilityError("The getSelectedFinderItems capability returned an invalid item", {
        index,
        value: entry,
      });
    }
    return { path: requireNonEmptyString(entry.path, `getSelectedFinderItems result ${index} path`) };
  });
}

function deserializeWindow(value: unknown, where: string): WindowManagement.Window {
  if (!isRecord(value)) {
    throw new CompatibilityError(`The ${where} is invalid`, { value });
  }
  const bounds = value.bounds;
  const normalizedBounds = bounds === "fullscreen" ? bounds : deserializeWindowBounds(bounds, `${where} bounds`);
  return {
    id: requireNonEmptyString(value.id, `${where} id`),
    ...(value.application === undefined
      ? {}
      : { application: deserializeApplication(value.application, `${where} application`) }),
    bounds: normalizedBounds,
    desktopId: requireNonEmptyString(value.desktopId, `${where} desktopId`),
    fullScreenSettable: requireBoolean(value.fullScreenSettable, `${where} fullScreenSettable`),
    resizable: requireBoolean(value.resizable, `${where} resizable`),
    positionable: requireBoolean(value.positionable, `${where} positionable`),
    active: requireBoolean(value.active, `${where} active`),
  };
}

function deserializeWindowBounds(value: unknown, where: string): WindowManagement.Window["bounds"] {
  if (!isRecord(value) || !isRecord(value.position) || !isRecord(value.size)) {
    throw new CompatibilityError(`The ${where} is invalid`, { value });
  }
  return {
    position: {
      x: requireFiniteNumber(value.position.x, `${where} position.x`),
      y: requireFiniteNumber(value.position.y, `${where} position.y`),
    },
    size: {
      width: requireFiniteNumber(value.size.width, `${where} size.width`),
      height: requireFiniteNumber(value.size.height, `${where} size.height`),
    },
  };
}

function deserializeWindowDesktop(value: unknown, where: string): WindowManagement.Desktop {
  if (!isRecord(value) || !isRecord(value.size)) {
    throw new CompatibilityError(`The ${where} is invalid`, { value });
  }
  if (value.type !== WindowManagement.DesktopType.User && value.type !== WindowManagement.DesktopType.FullScreen) {
    throw new CompatibilityError(`The ${where} has an invalid type`, { value: value.type });
  }
  return {
    size: {
      width: requireFiniteNumber(value.size.width, `${where} size.width`),
      height: requireFiniteNumber(value.size.height, `${where} size.height`),
    },
    id: requireNonEmptyString(value.id, `${where} id`),
    screenId: requireNonEmptyString(value.screenId, `${where} screenId`),
    active: requireBoolean(value.active, `${where} active`),
    type: value.type,
  };
}

function serializeWindowBounds(options: unknown): string {
  if (!isRecord(options)) {
    unsupported("WindowManagement.setWindowBounds options", { options });
  }
  const id = requireNonEmptyString(options.id, "WindowManagement.setWindowBounds id");
  const bounds = options.bounds;
  if (bounds === "fullscreen") {
    if (options.desktopId !== undefined) {
      unsupported("WindowManagement.setWindowBounds desktopId with fullscreen bounds", { options });
    }
    return JSON.stringify({ id, bounds });
  }
  if (!isRecord(bounds)) {
    unsupported("WindowManagement.setWindowBounds bounds", { bounds });
  }
  for (const key of Object.keys(options)) {
    if (key !== "id" && key !== "bounds" && key !== "desktopId") {
      unsupported(`WindowManagement.setWindowBounds ${key}`, { options });
    }
  }
  for (const key of Object.keys(bounds)) {
    if (key !== "position" && key !== "size") {
      unsupported(`WindowManagement.setWindowBounds bounds.${key}`, { bounds });
    }
  }
  const normalized: {
    id: string;
    bounds: {
      position?: { x?: number; y?: number };
      size?: { width?: number; height?: number };
    };
    desktopId?: string;
  } = { id, bounds: {} };
  if (options.desktopId !== undefined) {
    normalized.desktopId = requireNonEmptyString(options.desktopId, "WindowManagement.setWindowBounds desktopId");
  }
  for (const [section, fields] of [
    ["position", ["x", "y"]],
    ["size", ["width", "height"]],
  ] as const) {
    const sectionValue = bounds[section];
    if (sectionValue === undefined) {
      continue;
    }
    if (!isRecord(sectionValue)) {
      unsupported(`WindowManagement.setWindowBounds bounds.${section}`, { value: sectionValue });
    }
    const normalizedSection: Record<string, number> = {};
    const allowedFields: readonly string[] = fields;
    for (const key of Object.keys(sectionValue)) {
      if (!allowedFields.includes(key)) {
        unsupported(`WindowManagement.setWindowBounds bounds.${section}.${key}`, { value: sectionValue });
      }
      normalizedSection[key] = requireFiniteNumber(
        sectionValue[key],
        `WindowManagement.setWindowBounds bounds.${section}.${key}`,
      );
    }
    normalized["bounds"][section] = normalizedSection;
  }
  return JSON.stringify(normalized);
}

function requireBoolean(value: unknown, where: string): boolean {
  if (typeof value !== "boolean") {
    throw new CompatibilityError(`The ${where} must be a boolean`, { value });
  }
  return value;
}

function requireFiniteNumber(value: unknown, where: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new CompatibilityError(`The ${where} must be a finite number`, { value });
  }
  return value;
}

function serializeLaunchJSON(value: unknown, where: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!isRecord(value)) {
    unsupported(`${where} must be a JSON-serializable object`, { value });
  }
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      unsupported(`${where} must be a JSON-serializable object`, { value });
    }
    return serialized;
  } catch (error) {
    throw new CompatibilityError(`${where} must be a JSON-serializable object`, {
      value,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Launches another command through the host command-launch capability. */
export async function launchCommand(options: LaunchOptions): Promise<void> {
  if (!isRecord(options)) {
    unsupported("launchCommand options", { options });
  }
  const args: Record<string, string | number | boolean> = {
    name: requireNonEmptyString(options.name, "launchCommand name"),
  };
  if (options.type !== LaunchType.UserInitiated && options.type !== LaunchType.Background) {
    unsupported("launchCommand type", { type: options.type });
  }
  args.type = options.type;

  const ownerOrAuthorName = options.ownerOrAuthorName;
  const extensionName = options.extensionName;
  if ((ownerOrAuthorName === undefined) !== (extensionName === undefined)) {
    unsupported("launchCommand external target", { ownerOrAuthorName, extensionName });
  }
  if (ownerOrAuthorName !== undefined && extensionName !== undefined) {
    args.ownerOrAuthorName = requireNonEmptyString(ownerOrAuthorName, "launchCommand ownerOrAuthorName");
    args.extensionName = requireNonEmptyString(extensionName, "launchCommand extensionName");
  }

  if (options.fallbackText !== undefined && options.fallbackText !== null) {
    args.fallbackText = requireNonEmptyString(options.fallbackText, "launchCommand fallbackText");
  }
  const argumentsJSON = serializeLaunchJSON(options.arguments, "launchCommand arguments");
  if (argumentsJSON !== undefined) {
    args.argumentsJSON = argumentsJSON;
  }
  const contextJSON = serializeLaunchJSON(options.context, "launchCommand context");
  if (contextJSON !== undefined) {
    args.contextJSON = contextJSON;
  }
  await callCapability("command", "launch", args, "The launchCommand");
}

/** Closes the host's main window through the explicit window capability. */
export async function closeMainWindow(options?: CloseMainWindowOptions): Promise<void> {
  const args: Record<string, string | number | boolean> = {};
  if (options !== undefined && options !== null) {
    if (!isRecord(options)) {
      unsupported("closeMainWindow options", { options });
    }
    if (options.clearRootSearch !== undefined) {
      if (typeof options.clearRootSearch !== "boolean") {
        unsupported("closeMainWindow clearRootSearch", { value: options.clearRootSearch });
      }
      args.clearRootSearch = options.clearRootSearch;
    }
    if (options.popToRootType !== undefined) {
      if (
        options.popToRootType !== PopToRootType.Default &&
        options.popToRootType !== PopToRootType.Immediate &&
        options.popToRootType !== PopToRootType.Suspended
      ) {
        unsupported("closeMainWindow popToRootType", { value: options.popToRootType });
      }
      args.popToRootType = options.popToRootType;
    }
  }
  await callCapability("window", "close", Object.keys(args).length === 0 ? undefined : args, "The closeMainWindow");
}

/** Clears the active search field through the host navigation capability. */
export async function clearSearchBar(options?: ClearSearchBarOptions): Promise<void> {
  const args: Record<string, string | number | boolean> = {};
  if (options !== undefined) {
    if (!isRecord(options)) {
      unsupported("clearSearchBar options", { options });
    }
    for (const key of Object.keys(options)) {
      if (key !== "forceScrollToTop") {
        unsupported(`clearSearchBar ${key}`, { options });
      }
    }
    if (options.forceScrollToTop !== undefined) {
      if (typeof options.forceScrollToTop !== "boolean") {
        unsupported("clearSearchBar forceScrollToTop", { value: options.forceScrollToTop });
      }
      args.forceScrollToTop = options.forceScrollToTop;
    }
  }
  await callCapability(
    "navigation",
    "clearSearchBar",
    Object.keys(args).length === 0 ? undefined : args,
    "The clearSearchBar",
  );
}

/** Pops the host navigation stack back to its root through a capability. */
export async function popToRoot(options?: PopToRootOptions): Promise<void> {
  const args: Record<string, string | number | boolean> = {};
  if (options !== undefined && options !== null) {
    if (!isRecord(options)) {
      unsupported("popToRoot options", { options });
    }
    if (options.clearSearchBar !== undefined) {
      if (typeof options.clearSearchBar !== "boolean") {
        unsupported("popToRoot clearSearchBar", { value: options.clearSearchBar });
      }
      args.clearSearchBar = options.clearSearchBar;
    }
  }
  await callCapability("navigation", "popToRoot", Object.keys(args).length === 0 ? undefined : args, "The popToRoot");
}

/** Opens the current extension's preferences through the host capability. */
export async function openExtensionPreferences(): Promise<void> {
  await callCapability("preferences", "openExtension", undefined, "The openExtensionPreferences");
}

/** Opens the current command's preferences through the host capability. */
export async function openCommandPreferences(): Promise<void> {
  await callCapability("preferences", "openCommand", undefined, "The openCommandPreferences");
}

function normalizeAlertAction(action: AlertActionOptions | undefined, where: string): AlertActionOptions | undefined {
  if (action === undefined || action === null) {
    return undefined;
  }
  if (!isRecord(action)) {
    unsupported(`${where} action`, { action });
  }
  const title = requireNonEmptyString(action.title, `${where} title`);
  let style: AlertActionStyleLike | undefined;
  if (action.style !== undefined) {
    if (action.style !== "default" && action.style !== "cancel" && action.style !== "destructive") {
      unsupported(`${where} style`, { value: action.style });
    }
    style = action.style;
  }
  let onAction: (() => void) | undefined;
  if (action.onAction !== undefined) {
    if (typeof action.onAction !== "function") {
      unsupported(`${where} onAction`, { value: action.onAction });
    }
    onAction = action.onAction as () => void;
  }
  return {
    title,
    ...(style === undefined ? {} : { style }),
    ...(onAction === undefined ? {} : { onAction }),
  };
}

/** Shows a confirmation dialog and invokes the selected action callback. */
export async function confirmAlert(options: AlertOptions): Promise<boolean> {
  if (!isRecord(options)) {
    unsupported("confirmAlert options", { options });
  }
  const title = requireNonEmptyString(options.title, "confirmAlert title");
  const icon = serializeIcon(options.icon, "confirmAlert");
  const primaryAction = normalizeAlertAction(options.primaryAction, "confirmAlert.primaryAction");
  const dismissAction = normalizeAlertAction(options.dismissAction, "confirmAlert.dismissAction");
  const args: Record<string, string | number | boolean> = { title };

  if (options.message !== undefined) {
    if (typeof options.message !== "string") {
      unsupported("confirmAlert message", { value: options.message });
    }
    args.message = options.message;
  }
  if (icon !== undefined) {
    args.icon = icon.icon;
    if (icon.iconTintColor !== undefined) {
      args.iconTintColor = icon.iconTintColor;
    }
  }
  if (options.rememberUserChoice !== undefined) {
    if (typeof options.rememberUserChoice !== "boolean") {
      unsupported("confirmAlert rememberUserChoice", { value: options.rememberUserChoice });
    }
    args.rememberUserChoice = options.rememberUserChoice;
  }
  if (primaryAction !== undefined) {
    args.primaryTitle = primaryAction.title;
    if (primaryAction.style !== undefined) {
      args.primaryStyle = primaryAction.style;
    }
  }
  if (dismissAction !== undefined) {
    args.dismissTitle = dismissAction.title;
    if (dismissAction.style !== undefined) {
      args.dismissStyle = dismissAction.style;
    }
  }

  const response = await callCapability("alert", "confirm", args, "The alert confirm");
  if (typeof response.value !== "boolean") {
    throw new CompatibilityError("The alert confirm capability returned a non-boolean result", response);
  }
  const confirmed = response.value;
  const selectedAction = confirmed ? primaryAction : dismissAction;
  selectedAction?.onAction?.();
  return confirmed;
}

/**
 * Returns the command's preference values: manifest defaults resolved by the
 * trusted catalog today, user overrides once preference storage exists.
 */
export function getPreferenceValues<T = PreferenceValues>(): T {
  return (requireContext().descriptor.preferences ?? {}) as T;
}

function preferenceTypeForValue(value: string | number | boolean): PreferenceType {
  if (typeof value === "boolean") {
    return "checkbox";
  }
  if (typeof value === "number") {
    return "dropdown";
  }
  return "textfield";
}

function createLegacyPreference(name: string, value: string | number | boolean): Preference {
  return {
    name,
    type: preferenceTypeForValue(value),
    required: false,
    title: name,
    description: "",
    value,
  };
}

function currentPreferenceValues(): Readonly<Record<string, string | number | boolean>> {
  return requireContext().descriptor.preferences ?? {};
}

/**
 * Deprecated preference metadata view. The V2 descriptor currently carries
 * resolved values rather than the full manifest metadata, so the adapter
 * supplies stable metadata defaults while preserving the legacy `.value`
 * access pattern used by older extensions.
 */
const preferenceTarget = Object.create(null) as Preferences;
export const preferences: Preferences = new Proxy(preferenceTarget, {
  get(target, property, receiver) {
    if (typeof property !== "string") {
      return Reflect.get(target, property, receiver);
    }
    const values = currentPreferenceValues();
    const value = values[property];
    return value === undefined ? undefined : createLegacyPreference(property, value);
  },
  has(_target, property) {
    return typeof property === "string" && Object.hasOwn(currentPreferenceValues(), property);
  },
  ownKeys() {
    return Object.keys(currentPreferenceValues());
  },
  getOwnPropertyDescriptor(_target, property) {
    if (typeof property !== "string") {
      return undefined;
    }
    const values = currentPreferenceValues();
    if (!Object.hasOwn(values, property)) {
      return undefined;
    }
    const value = values[property];
    if (value === undefined) {
      return undefined;
    }
    return {
      configurable: true,
      enumerable: true,
      value: createLegacyPreference(property, value),
    };
  },
});

let randomIdCounter = 0;

/** @deprecated Use a project-owned identifier generator instead. */
export function randomId(): string {
  randomIdCounter += 1;
  return `blast-${randomIdCounter.toString(36)}`;
}

export interface Navigation {
  push(element: ReactNode, onPop?: () => void): void;
  pop(): void;
}

export interface NavigationApi extends Navigation {
  popToRoot(): void;
}

const NavigationContext: Context<NavigationApi> = createContext<NavigationApi>({
  push(element, onPop) {
    compatGlobals.navigation?.push(element, onPop);
  },
  pop() {
    compatGlobals.navigation?.pop();
  },
  popToRoot() {
    compatGlobals.navigation?.popToRoot();
  },
});

interface NavigationEntry {
  readonly id: number;
  readonly element: ReactElement;
  readonly onPop?: () => void;
}

function requireNavigationElement(element: ReactNode, where: string): ReactElement {
  if (!isValidElement(element)) {
    unsupported(`${where} target must be a React element`, { target: element });
  }
  return element;
}

/**
 * Navigation within a running command. Pushed entries retain their lifecycle
 * callbacks, and only the top view contributes scene nodes.
 */
export function useNavigation(): NavigationApi {
  return useContext(NavigationContext);
}

let navigationEntryCounter = 0;
let legacyRenderCounter = 0;

function NavigationHost({ base }: { readonly base: ReactElement }): ReactElement {
  const [entries, setEntries] = useState<NavigationEntry[]>(() => [{ id: ++navigationEntryCounter, element: base }]);
  const entriesRef = useRef(entries);
  const navigation = useMemo<NavigationApi>(
    () => ({
      push(element: ReactNode, onPop?: () => void) {
        if (onPop !== undefined && typeof onPop !== "function") {
          throw new CompatibilityError("Navigation.push onPop must be a function", { onPop });
        }
        const next = [
          ...entriesRef.current,
          {
            id: ++navigationEntryCounter,
            element: requireNavigationElement(element, "Navigation.push"),
            ...(onPop === undefined ? {} : { onPop }),
          },
        ];
        entriesRef.current = next;
        setEntries(next);
      },
      pop() {
        const current = entriesRef.current;
        if (current.length <= 1) {
          return;
        }
        const popped = current[current.length - 1];
        const next = current.slice(0, -1);
        entriesRef.current = next;
        setEntries(next);
        popped?.onPop?.();
      },
      popToRoot() {
        const current = entriesRef.current;
        if (current.length <= 1) {
          return;
        }
        const next = current.slice(0, 1);
        entriesRef.current = next;
        setEntries(next);
        for (const entry of current.slice(1).toReversed()) {
          entry.onPop?.();
        }
      },
    }),
    [],
  );
  compatGlobals.navigation = navigation;

  return createElement(
    NavigationContext.Provider,
    { value: navigation },
    entries.map((entry, index) =>
      createElement(Fragment, { key: entry.id }, index === entries.length - 1 ? entry.element : null),
    ),
  );
}

export const LaunchType = {
  UserInitiated: "userInitiated",
  Background: "background",
} as const;

export type LaunchTypeName = (typeof LaunchType)[keyof typeof LaunchType];

function createDefaultLaunchProps(): LaunchProps {
  return {
    launchType: LaunchType.UserInitiated,
    arguments: {},
  };
}

export interface Environment {
  readonly raycastVersion: string;
  readonly ownerOrAuthorName: string;
  readonly extensionName: string;
  readonly entryPointType: "command" | "tool";
  readonly entryPointName: string;
  readonly entryPointMode: "no-view" | "view" | "menu-bar";
  readonly assetsPath: string;
  readonly supportPath: string;
  readonly isDevelopment: boolean;
  readonly appearance: "light" | "dark";
  readonly textSize: "medium" | "large";
  launchType: LaunchTypeName;
  readonly canAccess: (api: unknown) => boolean;
  readonly theme: "light" | "dark";
  readonly launchContext?: LaunchContext;
  readonly commandName: string;
  readonly commandMode: "no-view" | "view" | "menu-bar";
  /** Legacy adapter-only platform tuple retained for existing commands. */
  readonly os: readonly [string];
}

export interface EnvironmentAccessor extends Environment {
  (): Environment;
}

function createEnvironment(): Environment {
  const context = requireContext();
  const osName = context.platform === "darwin" ? "macOS" : context.platform === "win32" ? "Windows" : "Linux";
  const appearance = "dark" as const;
  const rootDirectory = context.descriptor.rootDirectory;
  const pathUnderExtension = (name: string) =>
    rootDirectory === undefined ? name : `${rootDirectory.replace(/[\\/]$/, "")}/${name}`;
  return {
    raycastVersion: "1.79.0",
    ownerOrAuthorName: context.descriptor.extensionId,
    extensionName: context.descriptor.extensionId,
    entryPointType: "command",
    entryPointName: context.descriptor.commandName,
    entryPointMode: "view",
    assetsPath: pathUnderExtension("assets"),
    supportPath: pathUnderExtension("support"),
    isDevelopment: true,
    appearance,
    textSize: "medium",
    launchType: compatGlobals.launchProps?.launchType ?? LaunchType.UserInitiated,
    canAccess: () => false,
    theme: appearance,
    ...(compatGlobals.launchProps?.launchContext === undefined
      ? {}
      : { launchContext: compatGlobals.launchProps.launchContext }),
    commandName: context.descriptor.commandName,
    commandMode: "view",
    os: [osName],
  };
}

/**
 * Runtime environment for the running command. The callable form is retained
 * for older Blast fixtures while official property access stays live across
 * command configuration.
 */
const environmentAccessor = (() => createEnvironment()) as EnvironmentAccessor;
for (const property of [
  "raycastVersion",
  "ownerOrAuthorName",
  "extensionName",
  "entryPointType",
  "entryPointName",
  "entryPointMode",
  "assetsPath",
  "supportPath",
  "isDevelopment",
  "appearance",
  "textSize",
  "launchType",
  "canAccess",
  "theme",
  "launchContext",
  "commandName",
  "commandMode",
  "os",
] as const) {
  Object.defineProperty(environmentAccessor, property, {
    configurable: false,
    enumerable: true,
    get: () => createEnvironment()[property],
  });
}

export const environment = environmentAccessor;

/**
 * Per-extension key-value storage, brokered through the capability boundary
 * with the extension identity attached by the host.
 */
export const LocalStorage = {
  async allItems<T extends LocalStorageValues = LocalStorageValues>(): Promise<T> {
    const response = await requireContext().requestCapability({
      capability: "local-storage",
      operation: "getAll",
    });
    if (response.outcome !== "succeeded") {
      throw new CompatibilityError("The local-storage getAll capability was not granted", response);
    }
    return decodeLocalStorageItems<T>(response.value);
  },

  async getItem<T extends LocalStorageValue>(key: string): Promise<T | undefined> {
    const response = await requireContext().requestCapability({
      capability: "local-storage",
      operation: "get",
      arguments: { key },
    });
    if (response.outcome !== "succeeded") {
      throw new CompatibilityError("The local-storage get capability was not granted", response);
    }
    return response.value === undefined || response.value === null ? undefined : (response.value as T);
  },

  async setItem(key: string, value: LocalStorageValue): Promise<void> {
    const response = await requireContext().requestCapability({
      capability: "local-storage",
      operation: "set",
      arguments: { key, value },
    });
    if (response.outcome !== "succeeded") {
      throw new CompatibilityError("The local-storage set capability was not granted", response);
    }
  },

  async removeItem(key: string): Promise<void> {
    const response = await requireContext().requestCapability({
      capability: "local-storage",
      operation: "remove",
      arguments: { key },
    });
    if (response.outcome !== "succeeded") {
      throw new CompatibilityError("The local-storage remove capability was not granted", response);
    }
  },

  async clear(): Promise<void> {
    const response = await requireContext().requestCapability({
      capability: "local-storage",
      operation: "clear",
    });
    if (response.outcome !== "succeeded") {
      throw new CompatibilityError("The local-storage clear capability was not granted", response);
    }
  },
};

/** @deprecated Use `LocalStorage.allItems` instead. */
export const allLocalStorageItems: typeof LocalStorage.allItems = LocalStorage.allItems;

/** @deprecated Use `Clipboard.copy` instead. */
export const copyTextToClipboard: typeof Clipboard.copy = Clipboard.copy;

/** @deprecated Use `Clipboard.paste` instead. */
export const pasteText: typeof Clipboard.paste = Clipboard.paste;

/** @deprecated Use `LocalStorage.removeItem` instead. */
export const removeLocalStorageItem: typeof LocalStorage.removeItem = LocalStorage.removeItem;

/** @deprecated Use `LocalStorage.clear` instead. */
export const clearLocalStorage: typeof LocalStorage.clear = LocalStorage.clear;

/** @deprecated Use `LocalStorage.getItem` instead. */
export const getLocalStorageItem: typeof LocalStorage.getItem = LocalStorage.getItem;

/** @deprecated Use `LocalStorage.setItem` instead. */
export const setLocalStorageItem: typeof LocalStorage.setItem = LocalStorage.setItem;

/**
 * Synchronous LRU cache compatible with Raycast's command-facing API.
 *
 * V2 deliberately keeps this fallback in the extension process for now. The
 * namespace is shared by commands in the same extension/runtime realm, while
 * `storageDirectory` remains a stable compatibility value until a persistent
 * cache capability is added to the host contract.
 */
export class Cache {
  static get DEFAULT_CAPACITY(): number {
    return 10 * 1024 * 1024;
  }

  static get STORAGE_DIRECTORY_NAME(): string {
    return "cache";
  }

  readonly #state: CacheState;
  readonly #capacity: number;
  readonly #directory: string;

  constructor(options?: CacheOptions) {
    const context = requireContext();
    const namespace = options?.namespace === undefined || options.namespace === "" ? "default" : options.namespace;
    if (typeof namespace !== "string") {
      unsupported("Cache namespace", { namespace });
    }
    const capacity = options?.capacity ?? Cache.DEFAULT_CAPACITY;
    if (typeof capacity !== "number" || !Number.isSafeInteger(capacity) || capacity < 0) {
      unsupported("Cache capacity", { capacity });
    }
    let directory: string;
    if (options?.directory !== undefined) {
      directory = requireNonEmptyString(options.directory, "Cache directory");
    } else {
      directory = `memory://blast-${Cache.STORAGE_DIRECTORY_NAME}/${encodeURIComponent(context.descriptor.extensionId)}/${encodeURIComponent(namespace)}`;
    }

    compatGlobals.cacheStores ??= new Map();
    const storeKey = `${context.descriptor.extensionId}\u0000${namespace}`;
    let state = compatGlobals.cacheStores.get(storeKey);
    if (state === undefined) {
      state = { storage: new Map(), subscribers: new Set() };
      compatGlobals.cacheStores.set(storeKey, state);
    }
    this.#state = state;
    this.#capacity = capacity;
    this.#directory = directory;
  }

  get storageDirectory(): string {
    return this.#directory;
  }

  get(key: string): string | undefined {
    this.assertKey(key);
    if (!this.#state.storage.has(key)) {
      return undefined;
    }
    const value = this.#state.storage.get(key);
    this.#state.storage.delete(key);
    this.#state.storage.set(key, value as string);
    return value;
  }

  has(key: string): boolean {
    this.assertKey(key);
    return this.#state.storage.has(key);
  }

  get isEmpty(): boolean {
    return this.#state.storage.size === 0;
  }

  set(key: string, data: string): void {
    this.assertKey(key);
    if (typeof data !== "string") {
      unsupported("Cache data", { data });
    }
    this.#state.storage.delete(key);
    this.#state.storage.set(key, data);
    this.maintainCapacity();
    this.notifySubscribers(key, data);
  }

  remove(key: string): boolean {
    this.assertKey(key);
    if (!this.#state.storage.delete(key)) {
      return false;
    }
    this.notifySubscribers(key, undefined);
    return true;
  }

  clear(options?: { readonly notifySubscribers?: boolean }): void {
    this.#state.storage.clear();
    if (options?.notifySubscribers !== false) {
      this.notifySubscribers(undefined, undefined);
    }
  }

  subscribe(subscriber: CacheSubscriber): CacheSubscription {
    if (typeof subscriber !== "function") {
      unsupported("Cache subscriber", { subscriber });
    }
    this.#state.subscribers.add(subscriber);
    return () => {
      this.#state.subscribers.delete(subscriber);
    };
  }

  private assertKey(key: string): void {
    if (typeof key !== "string") {
      unsupported("Cache key", { key });
    }
  }

  private maintainCapacity(): void {
    let totalSize = 0;
    for (const data of this.#state.storage.values()) {
      totalSize += cacheByteLength(data);
    }
    while (totalSize > this.#capacity && this.#state.storage.size > 0) {
      const oldest = this.#state.storage.entries().next().value as [string, string];
      this.#state.storage.delete(oldest[0]);
      totalSize -= cacheByteLength(oldest[1]);
      this.notifySubscribers(oldest[0], undefined);
    }
  }

  private notifySubscribers(key: string | undefined, data: string | undefined): void {
    for (const subscriber of [...this.#state.subscribers]) {
      subscriber(key, data);
    }
  }
}

function cacheByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
