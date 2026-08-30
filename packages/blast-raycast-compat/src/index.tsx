import {
  Children,
  Fragment,
  cloneElement,
  createContext,
  createElement,
  forwardRef,
  isValidElement,
  useContext,
  useEffect,
  useId as useReactId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Context,
  type ForwardedRef,
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
import type { ColorLike, IconName } from "./icon.js";

export { Color, Icon } from "./icon.js";
export type { ColorLike, ColorName, IconName } from "./icon.js";
export type { DynamicColor } from "./icon.js";

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

export type RaycastEntryPointMode = "no-view" | "view" | "menu-bar";
export type RaycastEntryPointType = "command" | "tool";
export type RaycastAppearance = "light" | "dark";
export type RaycastTextSize = "medium" | "large";

export interface RaycastEnvironmentMetadata {
  readonly raycastVersion?: string;
  readonly entryPointType?: RaycastEntryPointType;
  readonly isDevelopment?: boolean;
  readonly appearance?: RaycastAppearance;
  readonly textSize?: RaycastTextSize;
}

export interface RaycastCompatContext {
  readonly descriptor: {
    readonly extensionId: string;
    readonly commandName: string;
    readonly preferences?: Readonly<Record<string, string | number | boolean>>;
    readonly preferenceMetadata?: Readonly<Record<string, RaycastPreferenceMetadata>>;
    readonly rootDirectory?: string;
    /** Optional manifest title used by environment.extensionName. */
    readonly extensionName?: string;
    /** Optional manifest owner/author used by environment.ownerOrAuthorName. */
    readonly ownerOrAuthorName?: string;
    /** Optional for compatibility with manually-created legacy contexts. */
    readonly entryPointMode?: RaycastEntryPointMode;
    /** Optional host-owned scalar environment values. */
    readonly environment?: RaycastEnvironmentMetadata;
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
  /**
   * Answers the Raycast environment.canAccess policy query. The optional
   * second argument is a stable adapter name for known API tokens; it is
   * useful when the extension bundle carries a separate adapter copy.
   */
  readonly canAccess?: (api: unknown, apiName?: string) => boolean;
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

const RAYCAST_API_ACCESS = Symbol.for("blastlauncher.raycast-api-access");

function markRaycastApiAccess<T extends object>(value: T, name: string): T {
  Object.defineProperty(value, RAYCAST_API_ACCESS, {
    configurable: false,
    enumerable: false,
    value: name,
    writable: false,
  });
  return value;
}

function getRaycastApiAccessName(api: unknown): string | undefined {
  if (typeof api === "string") {
    return api;
  }
  if ((typeof api !== "object" || api === null) && typeof api !== "function") {
    return undefined;
  }
  const name = Reflect.get(api, RAYCAST_API_ACCESS);
  return typeof name === "string" ? name : undefined;
}

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
  readonly isShowingDetail?: boolean;
  readonly searchText?: string;
  readonly filtering?: boolean | { readonly keepSectionOrder: boolean };
  /** @deprecated Use `filtering` instead. */
  readonly enableFiltering?: boolean;
  readonly throttle?: boolean;
  readonly selectedItemId?: string;
  readonly onSelectionChange?: (id: string | null) => void;
  readonly onSearchTextChange?: (text: string) => void;
  readonly searchBarAccessory?: ReactNode;
  readonly pagination?: {
    readonly pageSize: number;
    readonly hasMore: boolean;
    readonly onLoadMore: () => void;
  };
  readonly children?: ReactNode;
  readonly actions?: ReactNode;
}

export interface ListItemTitleDescriptor {
  readonly value: string;
  readonly tooltip?: string | null;
}

export interface ListItemSubtitleDescriptor {
  readonly value?: string | null;
  readonly tooltip?: string | null;
}

export interface ListItemIconWithTooltip {
  readonly value: IconLike | null | undefined;
  readonly tooltip: string;
}

export interface QuickLookProps {
  readonly name?: string | null;
  readonly path: PathLike;
}

export interface ListItemProps {
  readonly id?: string;
  readonly title: string | ListItemTitleDescriptor;
  readonly subtitle?: string | ListItemSubtitleDescriptor;
  readonly keywords?: string[];
  readonly icon?: IconLike | ListItemIconWithTooltip;
  readonly accessoryIcon?: IconLike;
  readonly accessoryTitle?: string;
  readonly accessories?: readonly ListItemAccessoryProps[] | null;
  readonly quickLook?: QuickLookProps;
  readonly detail?: ReactNode;
  readonly children?: ReactNode;
  readonly actions?: ReactNode;
}

export type ListItemAccessoryValue =
  | string
  | Date
  | null
  | {
      readonly value: string | Date | null;
      readonly color?: ColorLike | null;
    };

export interface ListItemAccessoryProps {
  readonly text?: ListItemAccessoryValue;
  readonly date?: ListItemAccessoryValue;
  readonly tag?: ListItemAccessoryValue;
  readonly icon?: IconLike | null;
  readonly tooltip?: string | null;
}

export interface ListSectionProps {
  readonly id?: string;
  readonly title?: string;
  readonly subtitle?: string;
  readonly children?: ReactNode;
}

export interface ListEmptyViewProps {
  readonly icon?: IconLike | null;
  readonly title?: string;
  readonly description?: string;
  readonly actions?: ReactNode;
}

export interface ListDropdownItemProps {
  readonly value: string;
  readonly title: string;
  readonly icon?: IconLike | null;
  readonly keywords?: string[];
}

export interface ListDropdownSectionProps {
  readonly title?: string;
  readonly children?: ReactNode;
}

export interface ListDropdownProps {
  readonly id?: string;
  readonly tooltip: string;
  readonly placeholder?: string;
  readonly isLoading?: boolean;
  readonly filtering?: boolean | { readonly keepSectionOrder: boolean };
  readonly throttle?: boolean;
  readonly storeValue?: boolean;
  readonly value?: string;
  readonly defaultValue?: string;
  readonly onChange?: (value: string) => void;
  readonly onSearchTextChange?: (text: string) => void;
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
  /** @deprecated Use `filtering` instead. */
  readonly enableFiltering?: boolean;
  readonly throttle?: boolean;
  readonly selectedItemId?: string;
  readonly onSelectionChange?: (id: string | null) => void;
  readonly onSearchTextChange?: (text: string) => void;
  readonly pagination?: {
    readonly pageSize: number;
    readonly hasMore: boolean;
    readonly onLoadMore: () => void;
  };
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
  readonly quickLook?: QuickLookProps;
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
  readonly isLoading?: boolean;
  readonly filtering?: boolean | { readonly keepSectionOrder: boolean };
  readonly throttle?: boolean;
  readonly storeValue?: boolean;
  readonly value?: string;
  readonly defaultValue?: string;
  readonly onChange?: (value: string) => void;
  readonly onSearchTextChange?: (text: string) => void;
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

const MenuBarExtraAlternateContext: Context<boolean> = createContext(false);

function MenuBarExtraAlternateBoundary({ children }: { readonly children: ReactElement }): ReactElement {
  return createElement(MenuBarExtraAlternateContext.Provider, { value: true }, children);
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
  readonly markdown?: string | null;
  readonly navigationTitle?: string;
  readonly isLoading?: boolean;
  readonly metadata?: ReactNode;
  readonly actions?: ReactNode;
}

export interface DetailMetadataProps {
  readonly children?: ReactNode;
}

export interface DetailMetadataLabelTextDescriptor {
  readonly value: string;
  readonly color?: GridColorLike | null;
}

export interface DetailMetadataLabelProps {
  readonly title: string;
  readonly icon?: IconLike | null;
  readonly text?: string | DetailMetadataLabelTextDescriptor;
}

export interface DetailMetadataLinkProps {
  readonly title: string;
  readonly target: string;
  readonly text: string;
}

export interface DetailMetadataTagListProps {
  readonly title: string;
  readonly children?: ReactNode;
}

export interface DetailMetadataTagListItemProps {
  readonly icon?: IconLike | null;
  readonly text?: string;
  readonly color?: GridColorLike | null;
  readonly onAction?: () => void;
}

export interface ActionPanelProps {
  readonly children?: ReactNode;
  readonly title?: string;
}

/** @deprecated Use `ActionPanel` children directly. */
export type ActionPanelChildren = ReactNode;

/** @deprecated Use `ActionPanel.Item` instead. */
export interface ActionPanelItemProps extends ActionProps {}

/** @deprecated Use `ActionPanel.Section` children directly. */
export type ActionPanelSectionChildren = ReactNode;

/** @deprecated Use `ActionPanel.Section` instead. */
export interface ActionPanelSectionProps extends ActionPanelProps {}

/** @deprecated There is no direct replacement in the modern API. */
export interface ActionPanelState {
  readonly update: (actionPanel: ReactNode) => void;
}

export interface SubmenuProps {
  /** @deprecated This is an internal prop which should not have been exposed. */
  readonly id?: string;
  readonly title: string;
  readonly icon?: IconLike;
  readonly shortcut?: ShortcutLike;
  readonly filtering?: boolean | { readonly keepSectionOrder: boolean };
  readonly isLoading?: boolean;
  readonly throttle?: boolean;
  readonly onSearchTextChange?: (text: string) => void;
  readonly onOpen?: () => void;
  readonly autoFocus?: boolean;
  readonly children?: ReactNode;
}

/** @deprecated Use `ActionPanel.Submenu` instead. */
export interface ActionPanelSubmenuProps extends SubmenuProps {}

export interface ActionProps {
  /** @deprecated This is an internal prop which should not have been exposed. */
  readonly id?: string;
  readonly title: string;
  readonly onAction?: (event?: SceneEventPayload) => void;
  readonly icon?: IconLike;
  readonly shortcut?: ShortcutLike;
  readonly style?: ActionStyleLike;
  readonly autoFocus?: boolean;
}

export interface MCPServer {
  readonly name: string;
  readonly description?: string;
  readonly icon?: IconLike;
}

export interface StdioMCPServer extends MCPServer {
  readonly transport: "stdio";
  readonly command: string;
  readonly args?: string[];
  readonly env?: Record<string, string>;
}

export interface SSEMCPServer extends MCPServer {
  readonly transport: "sse";
  readonly url: string;
  readonly headers?: Record<string, string>;
}

export interface InstallMCPServerProps {
  readonly server: StdioMCPServer | SSEMCPServer;
  readonly title?: string;
  readonly icon?: IconLike;
  readonly shortcut?: ShortcutLike;
}

export interface Quicklink {
  readonly icon?: IconLike;
  readonly link: string;
  readonly name?: string;
  readonly application?: string | ApplicationLike;
}

export interface CreateQuicklinkProps {
  readonly quicklink: Quicklink;
  readonly title?: string;
  readonly icon?: IconLike;
  readonly shortcut?: ShortcutLike;
}

export interface Snippet {
  readonly text: string;
  readonly name?: string;
  readonly keyword?: string;
}

export interface CreateSnippetProps {
  readonly snippet: Snippet;
  readonly title?: string;
  readonly icon?: IconLike;
  readonly shortcut?: ShortcutLike;
}

export interface PickDateProps {
  readonly title: string;
  readonly icon?: IconLike;
  readonly shortcut?: ShortcutLike;
  readonly onChange: (date: Date | null) => void;
  readonly type?: DatePickerType;
  readonly min?: Date;
  readonly max?: Date;
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

export interface ShowInFinderProps {
  readonly path: PathLike;
  readonly title?: string;
  readonly icon?: IconLike;
  readonly shortcut?: ShortcutLike;
  readonly onShow?: (path: PathLike) => void;
}

/** @deprecated Use `ShowInFinderProps` or `Action.ShowInFinder` instead. */
export interface ShowInFinderActionProps extends ShowInFinderProps {}

export interface TrashProps {
  readonly paths: PathLike | PathLike[];
  readonly title?: string;
  readonly icon?: IconLike;
  readonly shortcut?: ShortcutLike;
  readonly onTrash?: (paths: PathLike | PathLike[]) => void;
}

/** @deprecated Use `TrashProps` or `Action.Trash` instead. */
export interface TrashActionProps extends TrashProps {}

export interface PasteProps {
  readonly content: string | number | Clipboard.Content;
  readonly title?: string;
  readonly icon?: IconLike;
  readonly shortcut?: ShortcutLike;
  readonly onPaste?: (content: string | number | Clipboard.Content) => void;
}

/** @deprecated Use `PasteProps` or `Action.Paste` instead. */
export interface PasteActionProps extends PasteProps {}

export interface Image {
  readonly source: Image.Source;
  readonly fallback?: Image.Fallback | null;
  readonly mask?: Image.Mask | null;
  readonly tintColor?: ColorLike | null;
}

export interface IconObject extends Image {}

export interface FileIcon {
  readonly fileIcon: string;
}

export type IconLike = string | IconObject | FileIcon;

/** Runtime constants and type namespace for Raycast image descriptors. */
export namespace Image {
  export type URL = string;
  export type Asset = string;
  export type Source = URL | Asset | IconName | { readonly light: URL | Asset; readonly dark: URL | Asset };
  export type Fallback = Asset | IconName | { readonly light: Asset; readonly dark: Asset };
  export type ImageLike = URL | Asset | IconName | FileIcon | Image;

  export enum Mask {
    Circle = "circle",
    RoundedRectangle = "roundedRectangle",
  }
}

/** @deprecated Use `Image.Mask` instead. */
export type ImageMask = Image.Mask;
/** @deprecated Use `Image.ImageLike` instead. */
export type ImageLike = Image.ImageLike;
/** @deprecated Use `Image.Source` instead. */
export type ImageSource = Image.Source;

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

/** @deprecated Use `LaunchProps` directly. */
export interface FormLaunchProps {
  readonly draftValues?: FormValues;
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
type KeyboardShortcutType = ShortcutLike;
type KeyboardKeyModifierType = KeyModifier;
type KeyboardKeyEquivalentType = KeyEquivalent;
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
export type PreferenceMetadataScalar = string | number | boolean;
export type PreferenceMetadataPlatformValue = Readonly<Record<string, PreferenceMetadataScalar>>;
export type PreferenceMetadataValue = PreferenceMetadataScalar | PreferenceMetadataPlatformValue;

export interface PreferenceDataItem {
  readonly title: string;
  readonly value: string;
}

/** JSON-safe measured declaration metadata carried by the trusted catalog. */
export interface RaycastPreferenceMetadata {
  readonly name: string;
  readonly type: PreferenceType;
  readonly required: boolean;
  readonly title: string;
  readonly description: string;
  readonly value?: PreferenceMetadataValue;
  readonly default?: PreferenceMetadataValue;
  readonly placeholder?: string;
  readonly label?: string;
  readonly data?: readonly PreferenceDataItem[];
}

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
        const cssSelector = requireNonEmptyString(options.cssSelector, "BrowserExtension.getContent cssSelector");
        if (argumentsValue.format === "markdown") {
          unsupported("BrowserExtension.getContent cssSelector with markdown format", {
            format: argumentsValue.format,
            cssSelector,
          });
        }
        argumentsValue.cssSelector = cssSelector;
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

/** @deprecated Use `AI` directly. */
export const unstable_AI = AI;

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

export namespace Keyboard {
  export type Shortcut = KeyboardShortcutType;
  export type KeyModifier = KeyboardKeyModifierType;
  export type KeyEquivalent = KeyboardKeyEquivalentType;
}

/** @deprecated Use `Keyboard.KeyEquivalent` values directly. */
export const specialKeys = {
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

export namespace Alert {
  export type Options = AlertOptions;
  export type ActionOptions = AlertActionOptions;
  export type ActionStyle = AlertActionStyleLike;
  export namespace ActionStyle {
    export type Default = "default";
    export type Cancel = "cancel";
    export type Destructive = "destructive";
  }
}

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
      ...serializeIconProperties(icon),
      ...(props.isLoading === undefined ? {} : { isLoading: props.isLoading }),
    },
    mapMenuBarChildren(props.children, "MenuBarExtra"),
  );
}

function MenuBarExtraItem(props: MenuBarExtraItemProps): ReactElement {
  const isAlternate = useContext(MenuBarExtraAlternateContext);
  const icon = serializeIcon(props.icon, "MenuBarExtra.Item");
  const shortcut = serializeShortcut(props.shortcut, "MenuBarExtra.Item");
  const alternate = props.alternate as unknown;
  let alternateChild: ReactElement | undefined;
  if (alternate !== undefined && alternate !== null && alternate !== false) {
    if (!isValidElement(alternate)) {
      unsupported("MenuBarExtra.Item alternate", { alternate });
    }
    alternateChild = createElement(MenuBarExtraAlternateBoundary, { children: alternate });
  }
  if (props.onAction !== undefined && typeof props.onAction !== "function") {
    unsupported("MenuBarExtra.Item onAction", { onAction: props.onAction });
  }
  const itemProps = {
    ...(isAlternate ? { isAlternate: true } : {}),
    title: requireNonEmptyString(props.title, "MenuBarExtra.Item title"),
    ...(props.subtitle === undefined ? {} : { subtitle: props.subtitle }),
    ...(props.tooltip === undefined ? {} : { tooltip: props.tooltip }),
    ...serializeIconProperties(icon),
    ...(shortcut === undefined ? {} : { shortcut }),
    ...(props.onAction === undefined
      ? {}
      : {
          onAction: () => {
            void props.onAction?.({ type: isAlternate ? "right-click" : "left-click" });
          },
        }),
  };
  return alternateChild === undefined
    ? createElement("menu-bar-item", itemProps)
    : createElement("menu-bar-item", itemProps, alternateChild);
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
      ...serializeIconProperties(icon),
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

export namespace MenuBarExtra {
  export type Props = MenuBarExtraProps;
  export type ActionEvent = MenuBarExtraActionEvent;
  export namespace Item {
    export type Props = MenuBarExtraItemProps;
  }
  export namespace Section {
    export type Props = MenuBarExtraSectionProps;
  }
  export namespace Submenu {
    export type Props = MenuBarExtraSubmenuProps;
  }
}

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

export interface LinkAccessoryProps {
  readonly target: string;
  readonly text: string;
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

/** Handle exposed by Form items for focusing and resetting their value. */
export interface FormItemRef {
  focus: () => void;
  reset: () => void;
}

/**
 * Form refs are part of Raycast's component contract. The scene has no
 * control-command channel yet, so expose stable handles while keeping their
 * host-facing behavior for a later protocol slice.
 */
function useFormItemRef(ref: ForwardedRef<FormItemRef>): void {
  useImperativeHandle(
    ref,
    () => ({
      focus: () => {},
      reset: () => {},
    }),
    [],
  );
}

/** Deprecated top-level Form prop aliases retained for declaration parity. */
export interface FormTextFieldProps extends TextFieldProps {}
export interface FormTextAreaProps extends TextAreaProps {}
export interface FormCheckboxProps extends CheckboxProps {}
export interface FormDropdownProps extends DropdownProps {}
export interface FormDropdownItemProps extends DropdownItemProps {}
export interface FormDropdownSectionProps extends DropdownSectionProps {}
export interface FormDatePickerProps extends DatePickerProps {}
export interface FormTagPickerProps extends TagPickerProps {}
export interface FormTagPickerItemProps extends TagPickerItemProps {}
export interface FormSeparatorProps extends SeparatorProps {}

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
  readonly isLoading?: boolean;
  readonly filtering?: boolean | { readonly keepSectionOrder: boolean };
  readonly throttle?: boolean;
  readonly onSearchTextChange?: (text: string) => void;
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
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 8) {
    unsupported(`${where} must be an integer between 1 and 8`, { value });
  }
  return value;
}

function normalizePaginationPageSize(value: unknown, where: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    unsupported(`${where} must be a non-negative safe integer`, { value });
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
  value: GridProps["filtering"] | ListProps["filtering"],
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

type SerializedIcon = {
  readonly icon: string;
  readonly iconDark?: string;
  readonly iconFallback?: string;
  readonly iconFallbackDark?: string;
  readonly iconMask?: string;
  readonly iconTintColor?: string;
  readonly iconTintColorDark?: string;
  readonly iconTintColorAdjustContrast?: boolean;
};

type SerializedIconProperties = Record<string, string | boolean>;

function serializeIconProperties(icon: Partial<SerializedIcon> | undefined, prefix = "icon"): SerializedIconProperties {
  if (icon === undefined || icon.icon === undefined) {
    return {};
  }
  return {
    [prefix]: icon.icon,
    ...(icon.iconDark === undefined ? {} : { [`${prefix}Dark`]: icon.iconDark }),
    ...(icon.iconFallback === undefined ? {} : { [`${prefix}Fallback`]: icon.iconFallback }),
    ...(icon.iconFallbackDark === undefined ? {} : { [`${prefix}FallbackDark`]: icon.iconFallbackDark }),
    ...(icon.iconMask === undefined ? {} : { [`${prefix}Mask`]: icon.iconMask }),
    ...(icon.iconTintColor === undefined ? {} : { [`${prefix}TintColor`]: icon.iconTintColor }),
    ...(icon.iconTintColorDark === undefined ? {} : { [`${prefix}TintColorDark`]: icon.iconTintColorDark }),
    ...(icon.iconTintColorAdjustContrast === undefined
      ? {}
      : { [`${prefix}TintColorAdjustContrast`]: icon.iconTintColorAdjustContrast }),
  };
}

function serializeGridContent(content: unknown, where: string): SerializedIconProperties {
  if (typeof content === "string") {
    return { content };
  }
  if (!isRecord(content)) {
    unsupported(`${where} content`, { content });
  }
  if ("value" in content) {
    return {
      ...serializeGridContent(content.value, where),
      contentTooltip: requireString(content.tooltip, `${where} content tooltip`),
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
    return serializeIconProperties(icon, "content");
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

function serializeIcon(icon: IconLike | null | undefined, where: string): SerializedIcon | undefined {
  if (icon === undefined || icon === null) {
    return undefined;
  }
  if (typeof icon === "string") {
    return { icon };
  }
  if (typeof icon === "object" && icon !== null && "source" in icon) {
    const record = icon as unknown as Record<string, unknown>;
    const source = serializeImageVariant(record.source, `An icon source in ${where}`);
    const fallback =
      record.fallback === undefined || record.fallback === null
        ? undefined
        : serializeImageVariant(record.fallback, `An image fallback in ${where}`);
    const mask =
      record.mask === undefined || record.mask === null
        ? undefined
        : record.mask === Image.Mask.Circle || record.mask === Image.Mask.RoundedRectangle
          ? record.mask
          : unsupported(`An image mask in ${where}`, { mask: record.mask });
    const tintColor =
      record.tintColor === undefined || record.tintColor === null
        ? undefined
        : serializeIconTintColor(record.tintColor, where);
    return {
      icon: source.light,
      ...(source.dark === undefined ? {} : { iconDark: source.dark }),
      ...(fallback === undefined ? {} : { iconFallback: fallback.light }),
      ...(fallback?.dark === undefined ? {} : { iconFallbackDark: fallback.dark }),
      ...(mask === undefined ? {} : { iconMask: mask }),
      ...(tintColor === undefined ? {} : { iconTintColor: tintColor.light }),
      ...(tintColor?.dark === undefined ? {} : { iconTintColorDark: tintColor.dark }),
      ...(tintColor?.adjustContrast === undefined ? {} : { iconTintColorAdjustContrast: tintColor.adjustContrast }),
    };
  }
  if (typeof icon === "object" && icon !== null && "fileIcon" in icon) {
    const fileIcon = (icon as unknown as Record<string, unknown>).fileIcon;
    return { icon: `fileIcon:${requireNonEmptyString(fileIcon, `${where} fileIcon`)}` };
  }
  unsupported(`An icon in ${where}`, { icon });
}

function serializeListItemIcon(
  icon: ListItemProps["icon"] | null | undefined,
  where: string,
): (Partial<SerializedIcon> & { readonly iconTooltip?: string }) | undefined {
  if (isRecord(icon) && "value" in icon) {
    const serialized = serializeIcon(icon.value as IconLike | null | undefined, where);
    return {
      ...(serialized === undefined ? {} : serialized),
      iconTooltip: requireString(icon.tooltip, `${where} tooltip`),
    };
  }
  return serializeIcon(icon as IconLike | null | undefined, where);
}

function serializeImageVariant(value: unknown, where: string): { light: string; dark?: string } {
  if (typeof value === "string") {
    return { light: value };
  }
  if (
    isRecord(value) &&
    typeof value.light === "string" &&
    typeof value.dark === "string" &&
    value.light.length > 0 &&
    value.dark.length > 0
  ) {
    return { light: value.light, dark: value.dark };
  }
  unsupported(`${where} must be a string or a light/dark descriptor`, { value });
}

function serializeIconTintColor(
  value: unknown,
  where: string,
): { light: string; dark?: string; adjustContrast?: boolean } {
  if (typeof value === "string") {
    return { light: value };
  }
  if (isRecord(value) && typeof value.light === "string" && typeof value.dark === "string") {
    if (
      value.adjustContrast !== undefined &&
      value.adjustContrast !== null &&
      typeof value.adjustContrast !== "boolean"
    ) {
      unsupported(`${where} tintColor adjustContrast`, { value: value.adjustContrast });
    }
    return {
      light: value.light,
      dark: value.dark,
      ...(value.adjustContrast === undefined || value.adjustContrast === null
        ? {}
        : { adjustContrast: value.adjustContrast }),
    };
  }
  unsupported(`${where} tintColor`, { value });
}

function serializeListItemText(
  value: string | ListItemTitleDescriptor | ListItemSubtitleDescriptor | undefined,
  where: string,
  required: boolean,
): { value?: string; tooltip?: string } {
  if (value === undefined) {
    if (required) {
      unsupported(`${where} is required`, { value });
    }
    return {};
  }
  if (typeof value === "string") {
    return { value };
  }
  if (!isRecord(value)) {
    unsupported(`${where} must be a string or descriptor`, { value });
  }
  const descriptorValue = value.value;
  const textValue =
    descriptorValue === undefined || descriptorValue === null
      ? required
        ? unsupported(`${where} value is required`, { value })
        : undefined
      : requireString(descriptorValue, `${where} value`);
  const tooltip =
    value.tooltip === undefined || value.tooltip === null
      ? undefined
      : requireString(value.tooltip, `${where} tooltip`);
  return {
    ...(textValue === undefined ? {} : { value: textValue }),
    ...(tooltip === undefined ? {} : { tooltip }),
  };
}

function serializeListItemAccessories(accessories: ListItemProps["accessories"], where: string): string | undefined {
  if (accessories === undefined || accessories === null) {
    return undefined;
  }
  if (!Array.isArray(accessories)) {
    unsupported(`${where} must be an array`, { accessories });
  }
  const serialized = accessories.map((accessory, index) => {
    if (!isRecord(accessory)) {
      unsupported(`${where}[${index}] must be an object`, { accessory });
    }
    const result: Record<string, string | boolean> = {};
    for (const field of ["text", "date", "tag"] as const) {
      if (!(field in accessory) || accessory[field] === undefined || accessory[field] === null) {
        continue;
      }
      const value = serializeListItemAccessoryValue(accessory[field], `${where}[${index}].${field}`);
      if (value.value !== undefined) {
        result[field] = value.value;
      }
      if (value.color !== undefined) {
        result[`${field}Color`] = value.color;
      }
    }
    if (accessory.icon !== undefined && accessory.icon !== null) {
      const icon = serializeIcon(accessory.icon as IconLike, `${where}[${index}] icon`);
      if (icon !== undefined) {
        Object.assign(result, serializeIconProperties(icon));
      }
    }
    if (accessory.tooltip !== undefined && accessory.tooltip !== null) {
      result.tooltip = requireString(accessory.tooltip, `${where}[${index}] tooltip`);
    }
    return result;
  });
  return JSON.stringify(serialized);
}

function serializeListItemAccessoryValue(value: unknown, where: string): { value?: string; color?: string } {
  if (typeof value === "string") {
    return { value };
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      unsupported(`${where} must be a valid Date`, { value });
    }
    return { value: value.toISOString() };
  }
  if (!isRecord(value)) {
    unsupported(`${where} must be a string, Date, or descriptor`, { value });
  }
  const rawValue = value.value;
  const serializedValue =
    rawValue === undefined || rawValue === null
      ? undefined
      : rawValue instanceof Date
        ? rawValue.toISOString()
        : requireString(rawValue, `${where} value`);
  const color =
    value.color === undefined || value.color === null ? undefined : serializeTintColor(value.color, `${where} color`);
  return {
    ...(serializedValue === undefined ? {} : { value: serializedValue }),
    ...(color === undefined ? {} : { color }),
  };
}

function serializeListPagination(
  pagination: ListProps["pagination"],
  where: string,
): { paginationPageSize: number; paginationHasMore: boolean; onLoadMore: () => void } | undefined {
  if (pagination === undefined || pagination === null) {
    return undefined;
  }
  if (!isRecord(pagination)) {
    unsupported(`${where} must be an object`, { pagination });
  }
  const pageSize = normalizePaginationPageSize(pagination.pageSize, `${where} pageSize`);
  if (typeof pagination.hasMore !== "boolean") {
    unsupported(`${where} hasMore must be a boolean`, { hasMore: pagination.hasMore });
  }
  if (typeof pagination.onLoadMore !== "function") {
    unsupported(`${where} onLoadMore must be a function`, { onLoadMore: pagination.onLoadMore });
  }
  return {
    paginationPageSize: pageSize,
    paginationHasMore: pagination.hasMore,
    onLoadMore: () => pagination.onLoadMore(),
  };
}

function serializeQuickLook(
  quickLook: QuickLookProps | null | undefined,
  where: string,
): { quickLookPath: string; quickLookName?: string } | undefined {
  if (quickLook === undefined) {
    return undefined;
  }
  if (!isRecord(quickLook)) {
    unsupported(`${where} quickLook`, { quickLook });
  }
  const path = serializePathLike(quickLook.path as PathLike, `${where} quickLook path`);
  const name =
    quickLook.name === undefined || quickLook.name === null
      ? undefined
      : requireString(quickLook.name, `${where} quickLook name`);
  return {
    quickLookPath: path,
    ...(name === undefined ? {} : { quickLookName: name }),
  };
}

function serializeQuicklink(quicklink: unknown, where: string): string {
  if (!isRecord(quicklink)) {
    unsupported(`${where} must be an object`, { quicklink });
  }
  const serialized: Record<string, string | boolean> = {
    link: requireNonEmptyString(quicklink.link, `${where} link`),
  };
  if (quicklink.name !== undefined) {
    serialized.name = requireString(quicklink.name, `${where} name`);
  }
  if (quicklink.application !== undefined) {
    serialized.application = serializeApplication(
      quicklink.application as string | ApplicationLike,
      `${where} application`,
    );
  }
  if (quicklink.icon !== undefined) {
    const icon = serializeIcon(quicklink.icon as IconLike, `${where} icon`);
    if (icon !== undefined) {
      Object.assign(serialized, serializeIconProperties(icon));
    }
  }
  return JSON.stringify(serialized);
}

function serializeSnippet(snippet: unknown, where: string): string {
  if (!isRecord(snippet)) {
    unsupported(`${where} must be an object`, { snippet });
  }
  const serialized: Record<string, string> = {
    text: requireString(snippet.text, `${where} text`),
  };
  if (snippet.name !== undefined) {
    serialized.name = requireString(snippet.name, `${where} name`);
  }
  if (snippet.keyword !== undefined) {
    serialized.keyword = requireString(snippet.keyword, `${where} keyword`);
  }
  return JSON.stringify(serialized);
}

function serializeMCPServer(server: unknown, where: string): string {
  if (!isRecord(server)) {
    unsupported(`${where} must be an object`, { server });
  }
  const serialized: Record<string, unknown> = {
    name: requireNonEmptyString(server.name, `${where} name`),
    transport: server.transport,
  };
  if (server.description !== undefined) {
    serialized.description = requireString(server.description, `${where} description`);
  }
  if (server.icon !== undefined) {
    const icon = serializeIcon(server.icon as IconLike, `${where} icon`);
    if (icon !== undefined) {
      Object.assign(serialized, serializeIconProperties(icon));
    }
  }
  if (server.transport === "stdio") {
    serialized.transport = "stdio";
    serialized.command = requireNonEmptyString(server.command, `${where} command`);
    if (server.args !== undefined) {
      serialized.args = normalizeStringArray(server.args, `${where} args`);
    }
    if (server.env !== undefined) {
      serialized.env = serializeStringRecord(server.env, `${where} env`);
    }
  } else if (server.transport === "sse") {
    serialized.transport = "sse";
    serialized.url = requireNonEmptyString(server.url, `${where} url`);
    if (server.headers !== undefined) {
      serialized.headers = serializeStringRecord(server.headers, `${where} headers`);
    }
  } else {
    unsupported(`${where} transport`, { transport: server.transport });
  }
  return JSON.stringify(serialized);
}

function serializeStringRecord(value: unknown, where: string): Record<string, string> {
  if (!isRecord(value)) {
    unsupported(`${where} must be an object`, { value });
  }
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    result[key] = requireString(entry, `${where}.${key}`);
  }
  return result;
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
  Item: typeof ListItemComponent & { Detail: typeof ListItemDetail };
  Section: typeof ListSection;
  EmptyView: typeof ListEmptyView;
  Dropdown: typeof ListDropdown & {
    Item: typeof ListDropdownItem;
    Section: typeof ListDropdownSection;
  };
}

function ListComponent(props: ListProps): ReactElement {
  const filtering =
    props.filtering !== undefined
      ? normalizeGridFiltering(props.filtering, "List filtering")
      : props.enableFiltering === undefined
        ? undefined
        : normalizeGridFiltering(props.enableFiltering, "List enableFiltering");
  const pagination = serializeListPagination(props.pagination, "List pagination");
  return createElement(
    "list",
    {
      ...(props.navigationTitle === undefined ? {} : { navigationTitle: props.navigationTitle }),
      ...(props.searchBarPlaceholder === undefined ? {} : { searchBarPlaceholder: props.searchBarPlaceholder }),
      ...(props.isLoading === undefined ? {} : { isLoading: props.isLoading }),
      ...(props.isShowingDetail === undefined ? {} : { isShowingDetail: props.isShowingDetail }),
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
      ...(pagination === undefined ? {} : pagination),
    },
    mapListChildren(Children.toArray([props.searchBarAccessory, props.children, props.actions])),
  );
}

function ListItemComponent(props: ListItemProps): ReactElement {
  const title = serializeListItemText(props.title, "List.Item title", true);
  const subtitle = serializeListItemText(props.subtitle, "List.Item subtitle", false);
  const icon = serializeListItemIcon(props.icon, "List.Item");
  const accessoryIcon = serializeIcon(props.accessoryIcon, "List.Item accessoryIcon");
  const accessories = serializeListItemAccessories(props.accessories, "List.Item accessories");
  const quickLook = serializeQuickLook(props.quickLook, "List.Item");
  const children = Children.toArray([props.actions, props.children, props.detail]);
  return createElement(
    "list-item",
    {
      ...(props.id === undefined ? {} : { id: requireNonEmptyString(props.id, "List.Item id") }),
      title: title.value,
      ...(title.tooltip === undefined ? {} : { titleTooltip: title.tooltip }),
      ...(subtitle.value === undefined ? {} : { subtitle: subtitle.value }),
      ...(subtitle.tooltip === undefined ? {} : { subtitleTooltip: subtitle.tooltip }),
      ...serializeIconProperties(icon),
      ...(icon?.iconTooltip === undefined ? {} : { iconTooltip: icon.iconTooltip }),
      ...(props.keywords === undefined ? {} : { keywords: normalizeStringArray(props.keywords, "List.Item keywords") }),
      ...(accessories === undefined ? {} : { accessories }),
      ...serializeIconProperties(accessoryIcon, "accessoryIcon"),
      ...(props.accessoryTitle === undefined
        ? {}
        : { accessoryTitle: requireString(props.accessoryTitle, "List.Item accessoryTitle") }),
      ...(quickLook === undefined ? {} : quickLook),
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

function ListEmptyView(props: ListEmptyViewProps): ReactElement {
  const icon = serializeIcon(props.icon, "List.EmptyView");
  return createElement(
    "list-empty-view",
    {
      ...serializeIconProperties(icon),
      ...(props.title === undefined ? {} : { title: props.title }),
      ...(props.description === undefined ? {} : { description: props.description }),
    },
    mapItemChildren(props.actions, "List.EmptyView actions"),
  );
}

function ListDropdown(props: ListDropdownProps): ReactElement {
  if (props.onChange !== undefined && typeof props.onChange !== "function") {
    unsupported("List.Dropdown onChange", { onChange: props.onChange });
  }
  if (props.onSearchTextChange !== undefined && typeof props.onSearchTextChange !== "function") {
    unsupported("List.Dropdown onSearchTextChange", { onSearchTextChange: props.onSearchTextChange });
  }
  const filtering = normalizeGridFiltering(props.filtering, "List.Dropdown filtering");
  const eventKey = props.id ?? "value";
  return createElement(
    "list-dropdown",
    {
      ...(props.id === undefined ? {} : { id: requireNonEmptyString(props.id, "List.Dropdown id") }),
      tooltip: requireNonEmptyString(props.tooltip, "List.Dropdown tooltip"),
      ...(props.placeholder === undefined ? {} : { placeholder: props.placeholder }),
      ...(props.isLoading === undefined ? {} : { isLoading: props.isLoading }),
      ...(filtering === undefined ? {} : filtering),
      ...(props.throttle === undefined ? {} : { throttle: props.throttle }),
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
      ...(props.onSearchTextChange === undefined
        ? {}
        : {
            onSearchTextChange: (event: SceneEventPayload) => {
              const value = event.values?.searchText;
              props.onSearchTextChange?.(typeof value === "string" ? value : "");
            },
          }),
    },
    mapListDropdownChildren(props.children),
  );
}

function ListDropdownItem(props: ListDropdownItemProps): ReactElement {
  const icon = serializeIcon(props.icon, "List.Dropdown.Item");
  return createElement("list-dropdown-item", {
    value: requireString(props.value, "List.Dropdown.Item value"),
    title: requireString(props.title, "List.Dropdown.Item title"),
    ...serializeIconProperties(icon),
    ...(props.keywords === undefined
      ? {}
      : { keywords: normalizeStringArray(props.keywords, "List.Dropdown.Item keywords") }),
  });
}

function ListDropdownSection(props: ListDropdownSectionProps): ReactElement {
  return createElement(
    "list-dropdown-section",
    { ...(props.title === undefined ? {} : { title: props.title }) },
    mapListDropdownChildren(props.children),
  );
}

export const List: ListComponent = Object.assign(ListComponent, {
  Item: ListItemComponent as typeof ListItemComponent & { Detail: typeof ListItemDetail },
  Section: ListSection,
  EmptyView: ListEmptyView,
  Dropdown: Object.assign(ListDropdown, { Item: ListDropdownItem, Section: ListDropdownSection }),
});

export namespace List {
  export type Props = ListProps;
  export namespace EmptyView {
    export type Props = ListEmptyViewProps;
  }
  export namespace Dropdown {
    export type Props = ListDropdownProps;
    export namespace Item {
      export type Props = ListDropdownItemProps;
    }
    export namespace Section {
      export type Props = ListDropdownSectionProps;
    }
  }
  export namespace Item {
    export type Accessory = ListItemAccessoryProps;
    export type Props = ListItemProps;
    export namespace Detail {
      export type Props = DetailProps;
      export namespace Metadata {
        export type Props = DetailMetadataProps;
        export namespace Label {
          export type Props = DetailMetadataLabelProps;
        }
        export namespace Separator {
          export type Props = Record<string, never>;
        }
        export namespace Link {
          export type Props = DetailMetadataLinkProps;
        }
        export namespace TagList {
          export type Props = DetailMetadataTagListProps;
          export namespace Item {
            export type Props = DetailMetadataTagListItemProps;
          }
        }
      }
    }
  }
  export namespace Section {
    export type Props = ListSectionProps;
  }
}

/** @deprecated Use `List.Item` instead. */
export const ListItem = List.Item;

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
  const filtering =
    props.filtering !== undefined
      ? normalizeGridFiltering(props.filtering, "Grid filtering")
      : props.enableFiltering === undefined
        ? undefined
        : normalizeGridFiltering(props.enableFiltering, "Grid enableFiltering");
  const pagination = serializeListPagination(props.pagination, "Grid pagination");
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
      ...(pagination === undefined ? {} : pagination),
    },
    mapGridChildren(Children.toArray([props.searchBarAccessory, props.children, props.actions])),
  );
}

function GridItem(props: GridItemProps): ReactElement {
  const content = serializeGridContent(props.content, "Grid.Item");
  const quickLook = serializeQuickLook(props.quickLook, "Grid.Item");
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
      ...content,
      ...(props.title === undefined ? {} : { title: props.title }),
      ...(props.subtitle === undefined ? {} : { subtitle: props.subtitle }),
      ...(props.keywords === undefined ? {} : { keywords: normalizeStringArray(props.keywords, "Grid.Item keywords") }),
      ...serializeIconProperties(icon, "accessoryIcon"),
      ...(props.accessory?.tooltip === undefined ? {} : { accessoryTooltip: props.accessory.tooltip }),
      ...(quickLook === undefined ? {} : quickLook),
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
      ...serializeIconProperties(icon),
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
  if (props.onSearchTextChange !== undefined && typeof props.onSearchTextChange !== "function") {
    unsupported("Grid.Dropdown onSearchTextChange", { onSearchTextChange: props.onSearchTextChange });
  }
  const filtering = normalizeGridFiltering(props.filtering, "Grid.Dropdown filtering");
  const eventKey = props.id ?? "value";
  return createElement(
    "grid-dropdown",
    {
      ...(props.id === undefined ? {} : { id: requireNonEmptyString(props.id, "Grid.Dropdown id") }),
      tooltip: requireNonEmptyString(props.tooltip, "Grid.Dropdown tooltip"),
      ...(props.placeholder === undefined ? {} : { placeholder: props.placeholder }),
      ...(props.isLoading === undefined ? {} : { isLoading: props.isLoading }),
      ...(filtering === undefined ? {} : filtering),
      ...(props.throttle === undefined ? {} : { throttle: props.throttle }),
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
      ...(props.onSearchTextChange === undefined
        ? {}
        : {
            onSearchTextChange: (event: SceneEventPayload) => {
              const value = event.values?.searchText;
              props.onSearchTextChange?.(typeof value === "string" ? value : "");
            },
          }),
    },
    mapGridDropdownChildren(props.children),
  );
}

function GridDropdownItem(props: GridDropdownItemProps): ReactElement {
  const icon = serializeIcon(props.icon, "Grid.Dropdown.Item");
  return createElement("grid-dropdown-item", {
    value: requireString(props.value, "Grid.Dropdown.Item value"),
    title: requireString(props.title, "Grid.Dropdown.Item title"),
    ...serializeIconProperties(icon),
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

export namespace Grid {
  export type Props = GridProps;
  export type AspectRatio = GridAspectRatio;
  export type Inset = GridInset;
  export type Fit = GridFit;
  export type ItemSize = GridItemSize;
  export namespace EmptyView {
    export type Props = GridEmptyViewProps;
  }
  export namespace Dropdown {
    export type Props = GridDropdownProps;
    export namespace Item {
      export type Props = GridDropdownItemProps;
    }
    export namespace Section {
      export type Props = GridDropdownSectionProps;
    }
  }
  export namespace Item {
    export type Accessory = GridItemAccessoryProps;
    export type Props = GridItemProps;
  }
  export namespace Section {
    export type Props = GridSectionProps;
  }
}

function serializeDetailMetadataLabelText(
  text: string | DetailMetadataLabelTextDescriptor | undefined,
  where: string,
): { text?: string; textColor?: string } {
  if (text === undefined) {
    return {};
  }
  if (typeof text === "string") {
    return { text };
  }
  if (!isRecord(text)) {
    unsupported(`${where} text must be a string or descriptor`, { text });
  }
  const value = requireString(text.value, `${where} text value`);
  const color =
    text.color === undefined || text.color === null ? undefined : serializeTintColor(text.color, `${where} text`);
  return {
    text: value,
    ...(color === undefined ? {} : { textColor: color }),
  };
}

function DetailMetadataLabel(props: DetailMetadataLabelProps): ReactElement {
  const icon = serializeIcon(props.icon, "Detail.Metadata.Label");
  const text = serializeDetailMetadataLabelText(props.text, "Detail.Metadata.Label");
  return createElement("detail-metadata-label", {
    title: requireString(props.title, "Detail.Metadata.Label title"),
    ...serializeIconProperties(icon),
    ...(text.text === undefined ? {} : { text: text.text }),
    ...(text.textColor === undefined ? {} : { textColor: text.textColor }),
  });
}

function DetailMetadataSeparator(_props: Record<string, never>): ReactElement {
  return createElement("detail-metadata-separator");
}

function DetailMetadataLink(props: DetailMetadataLinkProps): ReactElement {
  return createElement("detail-metadata-link", {
    title: requireString(props.title, "Detail.Metadata.Link title"),
    target: requireNonEmptyString(props.target, "Detail.Metadata.Link target"),
    text: requireString(props.text, "Detail.Metadata.Link text"),
  });
}

function DetailMetadataTagListItem(props: DetailMetadataTagListItemProps): ReactElement {
  const icon = serializeIcon(props.icon, "Detail.Metadata.TagList.Item");
  const text = props.text === undefined ? undefined : requireString(props.text, "Detail.Metadata.TagList.Item text");
  if (icon === undefined && text === undefined) {
    unsupported("Detail.Metadata.TagList.Item requires an icon or text");
  }
  if (props.onAction !== undefined && typeof props.onAction !== "function") {
    unsupported("Detail.Metadata.TagList.Item onAction", { onAction: props.onAction });
  }
  const color =
    props.color === undefined || props.color === null
      ? undefined
      : serializeTintColor(props.color, "Detail.Metadata.TagList.Item");
  return createElement("detail-metadata-tag-list-item", {
    ...serializeIconProperties(icon),
    ...(text === undefined ? {} : { text }),
    ...(color === undefined ? {} : { color }),
    ...(props.onAction === undefined ? {} : { onAction: props.onAction }),
  });
}

function mapDetailMetadataChildren(children: ReactNode, where: string): ReactNode {
  return Children.toArray(children).map((child, index) => {
    if (isIgnorableChild(child)) {
      return null;
    }
    if (!isValidElement(child)) {
      return unsupported(`A ${where} text child`, { child });
    }
    if (
      child.type === DetailMetadataLabel ||
      child.type === DetailMetadataSeparator ||
      child.type === DetailMetadataLink ||
      child.type === DetailMetadataTagList
    ) {
      return keyedElement(child, `${where}-${index}`);
    }
    if (isCompositeElement(child)) {
      return keyedElement(child, `${where}-${index}`);
    }
    return unsupported(`A ${where} child that is not a measured metadata item`, { childType: String(child.type) });
  });
}

function DetailMetadataTagList(props: DetailMetadataTagListProps): ReactElement {
  return createElement(
    "detail-metadata-tag-list",
    { title: requireString(props.title, "Detail.Metadata.TagList title") },
    Children.toArray(props.children).map((child, index) => {
      if (isIgnorableChild(child)) {
        return null;
      }
      if (!isValidElement(child)) {
        return unsupported("A Detail.Metadata.TagList text child", { child });
      }
      if (child.type === DetailMetadataTagListItem || isCompositeElement(child)) {
        return keyedElement(child, `detail-metadata-tag-list-${index}`);
      }
      return unsupported("A Detail.Metadata.TagList child that is not an item", {
        childType: String(child.type),
      });
    }),
  );
}

interface DetailMetadataComponent {
  (props: DetailMetadataProps): ReactElement;
  Label: typeof DetailMetadataLabel;
  Separator: typeof DetailMetadataSeparator;
  Link: typeof DetailMetadataLink;
  TagList: typeof DetailMetadataTagList & { Item: typeof DetailMetadataTagListItem };
}

const Metadata: DetailMetadataComponent = Object.assign(
  function MetadataComponent(props: DetailMetadataProps): ReactElement {
    return createElement("detail-metadata", null, mapDetailMetadataChildren(props.children, "Detail.Metadata"));
  },
  {
    Label: DetailMetadataLabel,
    Separator: DetailMetadataSeparator,
    Link: DetailMetadataLink,
    TagList: Object.assign(DetailMetadataTagList, { Item: DetailMetadataTagListItem }),
  },
);

function mapDetailChildren(children: ReactNode): ReactNode {
  return Children.toArray(children).map((child, index) => {
    if (isIgnorableChild(child)) {
      return null;
    }
    if (!isValidElement(child)) {
      return unsupported("A Detail text child", { child });
    }
    if (child.type === Metadata || child.type === ActionPanel) {
      return keyedElement(child, `detail-${index}`);
    }
    if (isCompositeElement(child)) {
      return keyedElement(child, `detail-${index}`);
    }
    return unsupported("A Detail child that is not metadata or an ActionPanel", { childType: String(child.type) });
  });
}

interface DetailComponent {
  (props: DetailProps): ReactElement;
  Metadata: typeof Metadata;
}

export const Detail: DetailComponent = Object.assign(
  function DetailComponent(props: DetailProps): ReactElement {
    return createElement(
      "detail",
      {
        ...(props.markdown === undefined || props.markdown === null
          ? {}
          : { markdown: requireString(props.markdown, "Detail markdown") }),
        ...(props.navigationTitle === undefined ? {} : { navigationTitle: props.navigationTitle }),
        ...(props.isLoading === undefined ? {} : { isLoading: props.isLoading }),
      },
      mapDetailChildren([props.metadata, props.actions]),
    );
  },
  { Metadata },
);

export namespace Detail {
  export type Props = DetailProps;
  export namespace Metadata {
    export type Props = DetailMetadataProps;
    export namespace Label {
      export type Props = DetailMetadataLabelProps;
    }
    export namespace Separator {
      export type Props = Record<string, never>;
    }
    export namespace Link {
      export type Props = DetailMetadataLinkProps;
    }
    export namespace TagList {
      export type Props = DetailMetadataTagListProps;
      export namespace Item {
        export type Props = DetailMetadataTagListItemProps;
      }
    }
  }
}

const ListItemDetail = Detail;
Object.assign(List.Item, { Detail: ListItemDetail });

interface FormCodec {
  readonly accepts: (value: unknown) => boolean;
  readonly acceptsWire: (value: SceneFormValue) => boolean;
  readonly serialize: (value: unknown) => SceneFormValue;
  readonly deserialize: (value: SceneFormValue) => FormValue;
  readonly normalizeInitial?: (value: unknown) => unknown;
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
  const initialValue = normalizeFormInitialValue(props.value !== undefined ? props.value : props.defaultValue, codec);
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

/**
 * Raycast extensions commonly use nullable state while an async form value is
 * loading. The public item types only admit null for DatePicker, but the
 * native controls treat null as an empty/omitted initial value at runtime.
 * Preserve strict validation for every other wrong type, including null array
 * members and invalid objects.
 */
function normalizeFormInitialValue(value: unknown, codec: FormCodec): FormValue | undefined {
  const normalized = codec.normalizeInitial === undefined ? value : codec.normalizeInitial(value);
  return normalized === null && !codec.accepts(normalized) ? undefined : (normalized as FormValue | undefined);
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
  normalizeInitial: (value) => {
    if (
      !Array.isArray(value) ||
      !value.some((entry) => entry === undefined) ||
      !value.every((entry) => entry === undefined || typeof entry === "string")
    ) {
      return value;
    }
    return value.filter((entry): entry is string => entry !== undefined);
  },
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
  const value = normalizeFormInitialValue(props.value, codec);
  const defaultValue = normalizeFormInitialValue(props.defaultValue, codec);
  const serializedValue = value === undefined ? undefined : codec.serialize(value);
  const serializedDefaultValue = defaultValue === undefined ? undefined : codec.serialize(defaultValue);
  return {
    id: props.id,
    ...(props.title === undefined ? {} : { title: props.title }),
    ...(props.info === undefined ? {} : { info: props.info }),
    ...(props.error === undefined ? {} : { error: props.error }),
    ...(props.storeValue === undefined ? {} : { storeValue: props.storeValue }),
    ...(props.autoFocus === undefined ? {} : { autoFocus: props.autoFocus }),
    ...(serializedValue === undefined || serializedValue === null ? {} : { value: serializedValue }),
    ...(serializedDefaultValue === undefined || serializedDefaultValue === null
      ? {}
      : { defaultValue: serializedDefaultValue }),
    onChange,
    ...(onFocus === undefined ? {} : { onFocus }),
    ...(onBlur === undefined ? {} : { onBlur }),
  };
}

const FormTextField = forwardRef<FormItemRef, TextFieldProps>(function FormTextField(props, ref): ReactElement {
  const onChange = useFormChange(props, "Form.TextField", stringFormCodec);
  const onFocus = useFormEvent(props, "Form.TextField", stringFormCodec, "focus");
  const onBlur = useFormEvent(props, "Form.TextField", stringFormCodec, "blur");
  useFormItemRef(ref);
  return createElement("form-text-field", {
    ...commonFormProps(props, onChange, stringFormCodec, onFocus, onBlur),
    ...(props.placeholder === undefined ? {} : { placeholder: props.placeholder }),
  });
});

const FormTextArea = forwardRef<FormItemRef, TextAreaProps>(function FormTextArea(props, ref): ReactElement {
  const onChange = useFormChange(props, "Form.TextArea", stringFormCodec);
  const onFocus = useFormEvent(props, "Form.TextArea", stringFormCodec, "focus");
  const onBlur = useFormEvent(props, "Form.TextArea", stringFormCodec, "blur");
  useFormItemRef(ref);
  const enableMarkdown = props.enableMarkdown === null ? undefined : props.enableMarkdown;
  return createElement("form-text-area", {
    ...commonFormProps(props, onChange, stringFormCodec, onFocus, onBlur),
    ...(props.placeholder === undefined ? {} : { placeholder: props.placeholder }),
    ...(enableMarkdown === undefined ? {} : { enableMarkdown }),
  });
});

const FormPasswordField = forwardRef<FormItemRef, PasswordFieldProps>(
  function FormPasswordField(props, ref): ReactElement {
    const onChange = useFormChange(props, "Form.PasswordField", stringFormCodec);
    const onFocus = useFormEvent(props, "Form.PasswordField", stringFormCodec, "focus");
    const onBlur = useFormEvent(props, "Form.PasswordField", stringFormCodec, "blur");
    useFormItemRef(ref);
    return createElement("form-password-field", {
      ...commonFormProps(props, onChange, stringFormCodec, onFocus, onBlur),
      ...(props.placeholder === undefined ? {} : { placeholder: props.placeholder }),
    });
  },
);

const FormCheckbox = forwardRef<FormItemRef, CheckboxProps>(function FormCheckbox(props, ref): ReactElement {
  assertFormString(props.label, "Form.Checkbox label");
  const normalized = props.defaultValue === undefined ? { ...props, defaultValue: false } : props;
  const onChange = useFormChange(normalized, "Form.Checkbox", booleanFormCodec);
  const onFocus = useFormEvent(normalized, "Form.Checkbox", booleanFormCodec, "focus");
  const onBlur = useFormEvent(normalized, "Form.Checkbox", booleanFormCodec, "blur");
  useFormItemRef(ref);
  return createElement("form-checkbox", {
    ...commonFormProps(normalized, onChange, booleanFormCodec, onFocus, onBlur),
    label: props.label,
  });
});

const FormDropdownComponent = forwardRef<FormItemRef, DropdownProps>(function FormDropdown(props, ref): ReactElement {
  const onChange = useFormChange(props, "Form.Dropdown", stringFormCodec);
  const onFocus = useFormEvent(props, "Form.Dropdown", stringFormCodec, "focus");
  const onBlur = useFormEvent(props, "Form.Dropdown", stringFormCodec, "blur");
  useFormItemRef(ref);
  if (props.onSearchTextChange !== undefined && typeof props.onSearchTextChange !== "function") {
    unsupported("Form.Dropdown onSearchTextChange", { onSearchTextChange: props.onSearchTextChange });
  }
  const filtering = normalizeGridFiltering(props.filtering, "Form.Dropdown filtering");
  return createElement(
    "form-dropdown",
    {
      ...commonFormProps(props, onChange, stringFormCodec, onFocus, onBlur),
      ...(props.placeholder === undefined ? {} : { placeholder: props.placeholder }),
      ...(props.isLoading === undefined ? {} : { isLoading: props.isLoading }),
      ...(filtering === undefined ? {} : filtering),
      ...(props.throttle === undefined ? {} : { throttle: props.throttle }),
      ...(props.onSearchTextChange === undefined
        ? {}
        : {
            onSearchTextChange: (event: SceneEventPayload) => {
              const value = event.values?.searchText;
              props.onSearchTextChange?.(typeof value === "string" ? value : "");
            },
          }),
    },
    mapDropdownChildren(props.children),
  );
});

function FormDropdownItem(props: DropdownItemProps): ReactElement {
  assertFormString(props.value, "Form.Dropdown.Item value");
  assertFormString(props.title, "Form.Dropdown.Item title");
  const icon = serializeIcon(props.icon, "Form.Dropdown.Item");
  return createElement("form-dropdown-item", {
    value: props.value,
    title: props.title,
    ...serializeIconProperties(icon),
  });
}

function FormDropdownSection(props: DropdownSectionProps): ReactElement {
  return createElement("form-dropdown-section", { title: props.title }, mapDropdownChildren(props.children));
}

const FormDropdown = Object.assign(FormDropdownComponent, {
  Item: FormDropdownItem,
  Section: FormDropdownSection,
});

function FormDescription(props: DescriptionProps): ReactElement {
  assertFormString(props.text, "Form.Description text");
  return createElement("form-description", {
    title: props.title,
    text: props.text,
  });
}

function FormLinkAccessory(props: LinkAccessoryProps): ReactElement {
  const target = requireNonEmptyString(props.target, "Form.LinkAccessory target");
  const text = requireNonEmptyString(props.text, "Form.LinkAccessory text");
  return createElement("form-link-accessory", {
    target,
    text,
    onOpen: () => {
      void open(target);
    },
  });
}

function FormSeparator(_props: SeparatorProps): ReactElement {
  return createElement("form-separator");
}

function assertFormString(value: unknown, where: string): asserts value is string {
  if (typeof value !== "string") {
    throw new CompatibilityError(`${where} must be a string`, { value });
  }
}

const DATE_PICKER_TYPES = {
  Date: "date",
  DateTime: "date_time",
} as const;

function normalizeDatePickerType(type: unknown, where = "Form.DatePicker"): DatePickerType {
  if (type === undefined) {
    return DATE_PICKER_TYPES.DateTime;
  }
  if (type === DATE_PICKER_TYPES.Date || type === DATE_PICKER_TYPES.DateTime) {
    return type;
  }
  throw new CompatibilityError(`${where} type must be Type.Date or DateTime`, { type });
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

const FormDatePickerComponent = forwardRef<FormItemRef, DatePickerProps>(
  function FormDatePicker(props, ref): ReactElement {
    const normalized = props.defaultValue === undefined ? { ...props, defaultValue: null } : props;
    const onChange = useFormChange(normalized, "Form.DatePicker", dateFormCodec);
    const onFocus = useFormEvent(normalized, "Form.DatePicker", dateFormCodec, "focus");
    const onBlur = useFormEvent(normalized, "Form.DatePicker", dateFormCodec, "blur");
    useFormItemRef(ref);
    const type = normalizeDatePickerType(props.type);
    const min = props.min === undefined ? undefined : serializeDatePickerValue(props.min, "Form.DatePicker min");
    const max = props.max === undefined ? undefined : serializeDatePickerValue(props.max, "Form.DatePicker max");
    return createElement("form-date-picker", {
      ...commonFormProps(normalized, onChange, dateFormCodec, onFocus, onBlur),
      type,
      ...(min === undefined ? {} : { min }),
      ...(max === undefined ? {} : { max }),
    });
  },
);

const FormDatePicker = Object.assign(FormDatePickerComponent, {
  Type: DATE_PICKER_TYPES,
  isFullDay: isFullDayDate,
});

const DatePicker = FormDatePicker;

function FormTagPickerItem(props: TagPickerItemProps): ReactElement {
  assertFormString(props.value, "Form.TagPicker.Item value");
  assertFormString(props.title, "Form.TagPicker.Item title");
  const icon = serializeIcon(props.icon, "Form.TagPicker.Item");
  return createElement("form-tag-picker-item", {
    value: props.value,
    title: props.title,
    ...serializeIconProperties(icon),
  });
}

const FormTagPickerComponent = forwardRef<FormItemRef, TagPickerProps>(
  function FormTagPicker(props, ref): ReactElement {
    const normalized = props.defaultValue === undefined ? { ...props, defaultValue: [] } : props;
    const onChange = useFormChange(normalized, "Form.TagPicker", stringArrayFormCodec);
    const onFocus = useFormEvent(normalized, "Form.TagPicker", stringArrayFormCodec, "focus");
    const onBlur = useFormEvent(normalized, "Form.TagPicker", stringArrayFormCodec, "blur");
    useFormItemRef(ref);
    return createElement(
      "form-tag-picker",
      {
        ...commonFormProps(normalized, onChange, stringArrayFormCodec, onFocus, onBlur),
        ...(props.placeholder === undefined ? {} : { placeholder: props.placeholder }),
      },
      mapTagPickerChildren(props.children),
    );
  },
);

const FormTagPicker = Object.assign(FormTagPickerComponent, { Item: FormTagPickerItem });
const TagPicker = FormTagPicker;

const FormFilePicker = forwardRef<FormItemRef, FilePickerProps>(function FormFilePicker(props, ref): ReactElement {
  const normalized = props.defaultValue === undefined ? { ...props, defaultValue: [] } : props;
  const onChange = useFormChange(normalized, "Form.FilePicker", stringArrayFormCodec);
  const onFocus = useFormEvent(normalized, "Form.FilePicker", stringArrayFormCodec, "focus");
  const onBlur = useFormEvent(normalized, "Form.FilePicker", stringArrayFormCodec, "blur");
  useFormItemRef(ref);
  return createElement("form-file-picker", {
    ...commonFormProps(normalized, onChange, stringArrayFormCodec, onFocus, onBlur),
    ...(props.canChooseFiles === undefined ? {} : { canChooseFiles: props.canChooseFiles }),
    ...(props.canChooseDirectories === undefined ? {} : { canChooseDirectories: props.canChooseDirectories }),
    ...(props.showHiddenFiles === undefined ? {} : { showHiddenFiles: props.showHiddenFiles }),
    ...(props.allowMultipleSelection === undefined ? {} : { allowMultipleSelection: props.allowMultipleSelection }),
  });
});

function mapFormChildren(children: ReactNode): ReactNode {
  return Children.toArray(children).map((child, index) => {
    if (isIgnorableChild(child)) {
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
      child.type === FormLinkAccessory ||
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
    if (isIgnorableChild(child)) {
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
    if (isIgnorableChild(child)) {
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
  DropdownItem: typeof FormDropdownItem;
  DropdownSection: typeof FormDropdownSection;
  TagPickerItem: typeof FormTagPickerItem;
  Description: typeof FormDescription;
  Separator: typeof FormSeparator;
  DatePicker: typeof DatePicker;
  TagPicker: typeof TagPicker;
  FilePicker: typeof FormFilePicker;
  LinkAccessory: typeof FormLinkAccessory;
}

function FormComponent(props: FormProps): ReactElement {
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
      mapFormChildren(Children.toArray([props.searchBarAccessory, props.actions, props.children])),
    ),
  );
}

export const Form: FormComponent = Object.assign(FormComponent, {
  TextField: FormTextField,
  TextArea: FormTextArea,
  PasswordField: FormPasswordField,
  Checkbox: FormCheckbox,
  Dropdown: Object.assign(FormDropdown, { Item: FormDropdownItem, Section: FormDropdownSection }),
  DropdownItem: FormDropdownItem,
  DropdownSection: FormDropdownSection,
  TagPickerItem: FormTagPickerItem,
  Description: FormDescription,
  Separator: FormSeparator,
  DatePicker,
  TagPicker,
  FilePicker: FormFilePicker,
  LinkAccessory: FormLinkAccessory,
});

/** @deprecated Use `Form.Checkbox` instead. */
export { FormCheckbox };
/** @deprecated Use `Form.DatePicker` instead. */
export { FormDatePicker };
/** @deprecated Use `Form.Dropdown` instead. */
export { FormDropdown };
/** @deprecated Use `Form.Dropdown.Item` instead. */
export { FormDropdownItem };
/** @deprecated Use `Form.Dropdown.Section` instead. */
export { FormDropdownSection };
/** @deprecated Use `Form.Separator` instead. */
export { FormSeparator };
/** @deprecated Use `Form.TagPicker` instead. */
export { FormTagPicker };
/** @deprecated Use `Form.TagPicker.Item` instead. */
export { FormTagPickerItem };
/** @deprecated Use `Form.TextArea` instead. */
export { FormTextArea };
/** @deprecated Use `Form.TextField` instead. */
export { FormTextField };

export namespace Form {
  export type Props = FormProps;
  export type ItemProps<T extends FormValue> = FormItemProps<T>;
  export type ItemReference = FormItemRef;
  export type Value = FormValue;
  export type Values = FormValues;
  export type Event<T extends FormValue = FormValue> = FormEvent<T>;
  export type TextField = FormItemRef;
  export namespace TextField {
    export type Props = TextFieldProps;
  }
  export type TextArea = FormItemRef;
  export namespace TextArea {
    export type Props = TextAreaProps;
  }
  export type PasswordField = FormItemRef;
  export namespace PasswordField {
    export type Props = PasswordFieldProps;
  }
  export type Checkbox = FormItemRef;
  export namespace Checkbox {
    export type Props = CheckboxProps;
  }
  export type DatePicker = FormItemRef;
  export namespace DatePicker {
    export type Props = DatePickerProps;
    export type Type = DatePickerType;
  }
  export type Dropdown = FormItemRef;
  export namespace Dropdown {
    export type Props = DropdownProps;
    export namespace Item {
      export type Props = DropdownItemProps;
    }
    export namespace Section {
      export type Props = DropdownSectionProps;
    }
  }
  export type TagPicker = FormItemRef;
  export namespace TagPicker {
    export type Props = TagPickerProps;
    export namespace Item {
      export type Props = TagPickerItemProps;
    }
  }
  export type FilePicker = FormItemRef;
  export namespace FilePicker {
    export type Props = FilePickerProps;
  }
  export namespace Description {
    export type Props = DescriptionProps;
  }
  export namespace Separator {
    export type Props = SeparatorProps;
  }
  export namespace LinkAccessory {
    export type Props = LinkAccessoryProps;
  }
  export namespace Event {
    export type Type = FormEventType;
  }
}

function ActionPanelComponent(props: ActionPanelProps): ReactElement {
  return createElement("action-group", { title: props.title }, mapItemChildren(props.children, "ActionPanel"));
}

function Submenu(props: SubmenuProps): ReactElement {
  if (props.onOpen !== undefined && typeof props.onOpen !== "function") {
    unsupported("ActionPanel.Submenu onOpen", { onOpen: props.onOpen });
  }
  if (props.onSearchTextChange !== undefined && typeof props.onSearchTextChange !== "function") {
    unsupported("ActionPanel.Submenu onSearchTextChange", { onSearchTextChange: props.onSearchTextChange });
  }
  const icon = serializeIcon(props.icon, "ActionPanel.Submenu");
  const shortcut = serializeShortcut(props.shortcut, "ActionPanel.Submenu");
  const filtering = normalizeGridFiltering(props.filtering, "ActionPanel.Submenu filtering");
  return createElement(
    "action-group",
    {
      ...(props.id === undefined ? {} : { id: requireNonEmptyString(props.id, "ActionPanel.Submenu id") }),
      title: props.title,
      ...serializeIconProperties(icon),
      ...(shortcut === undefined ? {} : { shortcut }),
      ...(filtering === undefined ? {} : filtering),
      ...(props.isLoading === undefined ? {} : { isLoading: props.isLoading }),
      ...(props.throttle === undefined ? {} : { throttle: props.throttle }),
      ...(props.onSearchTextChange === undefined
        ? {}
        : {
            onSearchTextChange: (event: SceneEventPayload) => {
              const value = event.values?.searchText;
              props.onSearchTextChange?.(typeof value === "string" ? value : "");
            },
          }),
      ...(props.onOpen === undefined ? {} : { onOpen: () => props.onOpen?.() }),
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
  Item: typeof ActionComponent;
  Section: typeof Section;
  Submenu: typeof Submenu;
}

export const ActionPanel: ActionPanelComponent = Object.assign(ActionPanelComponent, {
  Item: ActionComponent,
  Section,
  Submenu,
});

export namespace ActionPanel {
  export type Props = ActionPanelProps;
  export type Children = ReactNode;
  export namespace Section {
    export type Props = ActionPanelSectionProps;
    export type Children = ReactNode;
  }
  export namespace Submenu {
    export type Props = SubmenuProps;
    export type Children = ReactNode;
  }
}

/** @deprecated Use `ActionPanel.Section` instead. */
export const ActionPanelSection = Section;
/** @deprecated Use `ActionPanel.Submenu` instead. */
export const ActionPanelSubmenu = Submenu;

function ActionComponent(props: ActionProps): ReactElement {
  const icon = serializeIcon(props.icon, "Action");
  const shortcut = serializeShortcut(props.shortcut, "Action");
  const style = normalizeActionStyle(props.style, "Action");
  return createElement("action", {
    ...(props.id === undefined ? {} : { id: requireNonEmptyString(props.id, "Action id") }),
    title: props.title,
    ...serializeIconProperties(icon),
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
  const form = useContext(FormContext);
  return createElement(Action, {
    title: props.title ?? "Submit Form",
    ...(props.icon === undefined ? {} : { icon: props.icon }),
    ...(props.shortcut === undefined ? {} : { shortcut: props.shortcut }),
    ...(props.style === undefined ? {} : { style: props.style }),
    onAction: (event) => {
      // The measured corpus also uses SubmitForm as a generic action from
      // Detail. There is no form state in that position, so preserve the
      // callback contract with an empty value bag.
      const values = form === undefined ? {} : form.submit(event?.values);
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
    ...serializeIconProperties(icon),
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

function CreateQuicklink(props: CreateQuicklinkProps): ReactElement {
  const quicklinkJSON = serializeQuicklink(props.quicklink, "Action.CreateQuicklink quicklink");
  return createElement(Action, {
    title: props.title ?? "Create Quicklink",
    icon: props.icon ?? "link",
    ...(props.shortcut === undefined ? {} : { shortcut: props.shortcut }),
    onAction: () => {
      void callCapability("quicklink", "create", { quicklinkJSON }, "The Action.CreateQuicklink");
    },
  });
}

function CreateSnippet(props: CreateSnippetProps): ReactElement {
  const snippetJSON = serializeSnippet(props.snippet, "Action.CreateSnippet snippet");
  return createElement(Action, {
    title: props.title ?? "Create Snippet",
    icon: props.icon ?? "snippets-16",
    ...(props.shortcut === undefined ? {} : { shortcut: props.shortcut }),
    onAction: () => {
      void callCapability("snippet", "create", { snippetJSON }, "The Action.CreateSnippet");
    },
  });
}

function InstallMCPServer(props: InstallMCPServerProps): ReactElement {
  const serverJSON = serializeMCPServer(props.server, "Action.InstallMCPServer server");
  return createElement(Action, {
    title: props.title ?? "Install MCP Server",
    ...(props.icon === undefined ? {} : { icon: props.icon }),
    ...(props.shortcut === undefined ? {} : { shortcut: props.shortcut }),
    onAction: () => {
      void callCapability("mcp-server", "install", { serverJSON }, "The Action.InstallMCPServer");
    },
  });
}

export interface ToggleQuickLookProps {
  readonly title?: string;
  readonly icon?: IconLike;
  readonly shortcut?: ShortcutLike;
}

function ToggleQuickLook(props: ToggleQuickLookProps): ReactElement {
  return createElement(Action, {
    title: props.title ?? "Quick Look",
    icon: props.icon ?? "eye",
    ...(props.shortcut === undefined ? {} : { shortcut: props.shortcut }),
    onAction: () => {
      void callCapability("quick-look", "toggle", undefined, "The Action.ToggleQuickLook");
    },
  });
}

function deserializePickedDate(value: unknown): Date | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new CompatibilityError("The Action.PickDate capability returned an invalid date", { value });
  }
  return new Date(value);
}

function PickDate(props: PickDateProps): ReactElement {
  const title = requireNonEmptyString(props.title, "Action.PickDate title");
  if (typeof props.onChange !== "function") {
    throw new CompatibilityError("Action.PickDate onChange must be a function", { onChange: props.onChange });
  }
  const type = normalizeDatePickerType(props.type, "Action.PickDate");
  const min = props.min === undefined ? undefined : serializeDatePickerValue(props.min, "Action.PickDate min");
  const max = props.max === undefined ? undefined : serializeDatePickerValue(props.max, "Action.PickDate max");
  const icon = props.icon ?? "calendar";
  const argumentsValue: Record<string, string | number | boolean> = { title, type };
  const serializedIcon = serializeIcon(icon, "Action.PickDate");
  if (serializedIcon !== undefined) {
    Object.assign(argumentsValue, serializeIconProperties(serializedIcon));
  }
  if (props.shortcut !== undefined) {
    argumentsValue.shortcutJSON = JSON.stringify(serializeShortcut(props.shortcut, "Action.PickDate"));
  }
  if (min !== undefined) {
    argumentsValue.min = min;
  }
  if (max !== undefined) {
    argumentsValue.max = max;
  }
  return createElement(Action, {
    title,
    icon,
    ...(props.shortcut === undefined ? {} : { shortcut: props.shortcut }),
    onAction: () => {
      void callCapability("date-picker", "pick", argumentsValue, "The Action.PickDate").then((response) => {
        props.onChange(deserializePickedDate(response.value));
      });
    },
  });
}

const PickDateAction = Object.assign(PickDate, {
  Type: DATE_PICKER_TYPES,
  isFullDay: isFullDayDate,
});

function ShowInFinder(props: ShowInFinderProps): ReactElement {
  const path = serializePathLike(props.path, "Action.ShowInFinder path");
  if (props.onShow !== undefined && typeof props.onShow !== "function") {
    throw new CompatibilityError("Action.ShowInFinder onShow must be a function", { onShow: props.onShow });
  }
  return createElement(Action, {
    title: props.title ?? "Show in Finder",
    icon: props.icon ?? "finder",
    ...(props.shortcut === undefined ? {} : { shortcut: props.shortcut }),
    onAction: () => {
      void callCapability("finder", "show", { path }, "The Action.ShowInFinder").then(() => {
        props.onShow?.(props.path);
      });
    },
  });
}

function Trash(props: TrashProps): ReactElement {
  if (props.onTrash !== undefined && typeof props.onTrash !== "function") {
    throw new CompatibilityError("Action.Trash onTrash must be a function", { onTrash: props.onTrash });
  }
  const paths = (Array.isArray(props.paths) ? props.paths : [props.paths]).map((path) =>
    serializePathLike(path, "Action.Trash path"),
  );
  return createElement(Action, {
    title: props.title ?? "Move to Trash",
    icon: props.icon ?? "trash",
    ...(props.shortcut === undefined ? {} : { shortcut: props.shortcut }),
    onAction: () => {
      void callCapability("filesystem", "trash", { pathsJSON: JSON.stringify(paths) }, "The Action.Trash").then(() => {
        props.onTrash?.(props.paths);
      });
    },
  });
}

/** @deprecated Use `Action.ShowInFinder` instead. */
export const ShowInFinderAction = ShowInFinder;

/** @deprecated Use `Action.Trash` instead. */
export const TrashAction = Trash;

function CopyToClipboard(props: CopyToClipboardProps): ReactElement {
  const icon = serializeIcon(props.icon, "Action.CopyToClipboard");
  const shortcut = serializeShortcut(props.shortcut, "Action.CopyToClipboard");
  const style = normalizeActionStyle(props.style, "Action.CopyToClipboard");
  return createElement("action", {
    title: props.title ?? "Copy to Clipboard",
    ...(icon === undefined ? { icon: "clipboard" } : serializeIconProperties(icon)),
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

function OpenInBrowser(props: OpenInBrowserProps): ReactElement | null {
  if (props.url === undefined) {
    return null;
  }
  const url = requireString(props.url, "Action.OpenInBrowser url");
  const icon = serializeIcon(props.icon ?? "globe", "Action.OpenInBrowser");
  const shortcut = serializeShortcut(props.shortcut, "Action.OpenInBrowser");
  return createElement("action", {
    title: props.title ?? "Open in Browser",
    ...serializeIconProperties(icon),
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
    ...serializeIconProperties(icon),
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
    ...serializeIconProperties(icon),
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
    ...serializeIconProperties(icon),
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

function mapListChildren(children: ReactNode): ReactNode {
  return Children.toArray(children).map((child, index) => {
    if (isIgnorableChild(child)) {
      return null;
    }
    if (!isValidElement(child)) {
      return unsupported("A List text child", { child });
    }
    if (
      child.type === ListItem ||
      child.type === ListSection ||
      child.type === ListEmptyView ||
      child.type === ListDropdown ||
      child.type === GridDropdown ||
      child.type === ActionPanel
    ) {
      return keyedElement(child, `list-${index}`);
    }
    if (isCompositeElement(child)) {
      return keyedElement(child, `list-${index}`);
    }
    return unsupported("A List child that is not a measured item, section, empty view, dropdown, or ActionPanel", {
      childType: String(child.type),
    });
  });
}

function mapListSectionChildren(children: ReactNode): ReactNode {
  return Children.toArray(children).map((child, index) => {
    if (isIgnorableChild(child)) {
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

function mapListDropdownChildren(children: ReactNode): ReactNode {
  return Children.toArray(children).map((child, index) => {
    if (isIgnorableChild(child)) {
      return null;
    }
    if (!isValidElement(child)) {
      return unsupported("A List.Dropdown text child", { child });
    }
    if (child.type === ListDropdownItem || child.type === ListDropdownSection) {
      return keyedElement(child, `list-dropdown-${index}`);
    }
    if (isCompositeElement(child)) {
      return keyedElement(child, `list-dropdown-${index}`);
    }
    return unsupported("A List.Dropdown child that is not an item or section", {
      childType: String(child.type),
    });
  });
}

function mapGridChildren(children: ReactNode): ReactNode {
  return Children.toArray(children).map((child, index) => {
    if (isIgnorableChild(child)) {
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
      child.type === ListDropdown ||
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
    if (isIgnorableChild(child)) {
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
    if (isIgnorableChild(child)) {
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
    if (isIgnorableChild(child)) {
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
  CreateQuicklink: typeof CreateQuicklink;
  CreateSnippet: typeof CreateSnippet;
  InstallMCPServer: typeof InstallMCPServer;
  ToggleQuickLook: typeof ToggleQuickLook;
  PickDate: typeof PickDateAction;
  ShowInFinder: typeof ShowInFinder;
  Trash: typeof Trash;
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
  CreateQuicklink,
  CreateSnippet,
  InstallMCPServer,
  ToggleQuickLook,
  PickDate: PickDateAction,
  ShowInFinder,
  Trash,
  SubmitForm,
  Style: ActionStyle,
});

export namespace Action {
  export type Props = ActionProps;
  export type Style = ActionStyleLike;
  export namespace CopyToClipboard {
    export type Props = CopyToClipboardProps;
  }
  export namespace CreateQuicklink {
    export type Props = CreateQuicklinkProps;
  }
  export namespace CreateSnippet {
    export type Props = CreateSnippetProps;
  }
  export namespace InstallMCPServer {
    export type Props = InstallMCPServerProps;
  }
  export namespace Open {
    export type Props = OpenProps;
  }
  export namespace OpenInBrowser {
    export type Props = OpenInBrowserProps;
  }
  export namespace OpenWith {
    export type Props = OpenWithProps;
  }
  export namespace Paste {
    export type Props = PasteProps;
  }
  export namespace Push {
    export type Props = PushProps;
  }
  export namespace ShowInFinder {
    export type Props = ShowInFinderProps;
  }
  export namespace SubmitForm {
    export type Props<T extends FormValues = FormValues> = SubmitFormProps<T>;
  }
  export namespace Trash {
    export type Props = TrashProps;
  }
  export namespace ToggleQuickLook {
    export type Props = ToggleQuickLookProps;
  }
  export namespace PickDate {
    export type Props = PickDateProps;
    export type Type = DatePickerType;
  }
}

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
    if (isIgnorableChild(child)) {
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
      child.type === Push ||
      child.type === CreateQuicklink ||
      child.type === CreateSnippet ||
      child.type === InstallMCPServer ||
      child.type === ToggleQuickLook ||
      child.type === PickDateAction ||
      child.type === ShowInFinder ||
      child.type === Trash ||
      child.type === Detail
    ) {
      return keyedElement(child, `${where}-${index}`);
    }
    if (isCompositeElement(child)) {
      return keyedElement(child, `${where}-${index}`);
    }
    return unsupported(`A ${where} child that is not an action`, { childType: String(child.type) });
  });
}

function isIgnorableChild(child: ReactNode): boolean {
  return (
    child === null ||
    child === undefined ||
    typeof child === "boolean" ||
    (typeof child === "number" && child === 0) ||
    (typeof child === "string" && child.trim().length === 0)
  );
}

const REACT_EXOTIC_COMPONENT_TYPES = new Set([
  Symbol.for("react.context"),
  Symbol.for("react.consumer"),
  Symbol.for("react.memo"),
  Symbol.for("react.forward_ref"),
  Symbol.for("react.lazy"),
]);

function isCompositeElement(element: ReactElement): boolean {
  const type = element.type as unknown;
  if (typeof type === "function" || type === Fragment) {
    return true;
  }
  if (typeof type !== "object" || type === null) {
    return false;
  }
  const tag = (type as { readonly $$typeof?: unknown }).$$typeof;
  return typeof tag === "symbol" && REACT_EXOTIC_COMPONENT_TYPES.has(tag);
}

function keyedElement(child: ReactNode, key: string): ReactNode {
  return isValidElement(child) ? cloneElement(child, { key }) : child;
}

function serializeClipboardReadOptions(options: Clipboard.ReadOptions | undefined): CapabilityArguments | undefined {
  if (options === undefined) {
    return undefined;
  }
  if (!isRecord(options)) {
    unsupported("Clipboard.read options", { options });
  }
  if (options.offset === undefined) {
    return undefined;
  }
  if (!Number.isSafeInteger(options.offset) || options.offset < 0 || options.offset > 5) {
    unsupported("Clipboard.read offset", { offset: options.offset });
  }
  return { offset: options.offset };
}

function deserializeClipboardReadContent(value: unknown): Clipboard.ReadContent {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (isRecord(parsed)) {
        const content: Clipboard.ReadContent = {
          text: requireString(parsed.text ?? "", "Clipboard.read result text"),
          ...(parsed.file === undefined ? {} : { file: requireString(parsed.file, "Clipboard.read result file") }),
          ...(parsed.html === undefined ? {} : { html: requireString(parsed.html, "Clipboard.read result html") }),
        };
        const allowedKeys = new Set(["text", "file", "html"]);
        if (Object.keys(parsed).every((key) => allowedKeys.has(key))) {
          return content;
        }
      }
    } catch {
      // Providers may return the plain text directly for compatibility with
      // older fixtures. Treat a non-JSON string as the text representation.
    }
    return { text: value };
  }
  if (value === undefined || value === null) {
    return { text: "" };
  }
  throw new CompatibilityError("The clipboard read capability returned an invalid content value", { value });
}

async function readClipboardContent(options?: Clipboard.ReadOptions): Promise<Clipboard.ReadContent> {
  const argumentsValue = serializeClipboardReadOptions(options);
  const response = await requireContext().requestCapability({
    capability: "clipboard",
    operation: "read",
    ...(argumentsValue === undefined ? {} : { arguments: argumentsValue }),
  });
  if (response.outcome !== "succeeded") {
    throw new CompatibilityError("The clipboard read capability was not granted", response);
  }
  return deserializeClipboardReadContent(response.value);
}

async function readClipboardText(options?: Clipboard.ReadOptions): Promise<string | undefined> {
  const content = await readClipboardContent(options);
  return content.text;
}

export const Clipboard = {
  async copy(content: string | number | Clipboard.Content, options?: Clipboard.CopyOptions): Promise<void> {
    await copyToClipboard(content, options);
  },
  async paste(content: string | number | Clipboard.Content): Promise<void> {
    await pasteToClipboard(content);
  },
  async clear(): Promise<void> {
    const response = await requireContext().requestCapability({ capability: "clipboard", operation: "clear" });
    if (response.outcome !== "succeeded") {
      throw new CompatibilityError("The clipboard clear capability was not granted", response);
    }
  },
  read: readClipboardContent,
  readText: readClipboardText,
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

  export type ReadOptions = {
    readonly offset?: number;
  };

  export type ReadContent = {
    readonly text: string;
    readonly file?: string;
    readonly html?: string;
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
    Success: "SUCCESS",
    Failure: "FAILURE",
    Animated: "ANIMATED",
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

export namespace Toast {
  export type Options = ToastOptions;
  export type ActionOptions = ToastActionOptions;
  export type Style = ToastStyle;
  export namespace Style {
    export type Success = "SUCCESS";
    export type Failure = "FAILURE";
    export type Animated = "ANIMATED";
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

/** Reports a memory snapshot without allowing telemetry availability to affect a command. */
export function captureMemorySnapshot(label: string): void {
  const normalizedLabel = requireNonEmptyString(label, "captureMemorySnapshot label");
  void callCapability(
    "telemetry",
    "captureMemorySnapshot",
    { label: normalizedLabel },
    "The captureMemorySnapshot",
  ).catch(() => {});
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
    Object.assign(args, serializeIconProperties(icon));
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

function preferenceTypeForValue(value: string | number | boolean | undefined): PreferenceType {
  if (typeof value === "boolean") {
    return "checkbox";
  }
  if (typeof value === "number") {
    return "dropdown";
  }
  return "textfield";
}

function createLegacyPreference(
  name: string,
  values: Readonly<Record<string, string | number | boolean>>,
  metadata?: RaycastPreferenceMetadata,
): Preference {
  if (metadata !== undefined) {
    const value = Object.hasOwn(values, name) ? values[name] : metadata.value;
    return {
      name: metadata.name,
      type: metadata.type,
      required: metadata.required,
      title: metadata.title,
      description: metadata.description,
      ...(value === undefined ? {} : { value }),
      ...(metadata.default === undefined ? {} : { default: metadata.default }),
      ...(metadata.placeholder === undefined ? {} : { placeholder: metadata.placeholder }),
      ...(metadata.label === undefined ? {} : { label: metadata.label }),
      ...(metadata.data === undefined ? {} : { data: [...metadata.data] }),
    };
  }
  const value = values[name];
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

function currentPreferenceMetadata(): Readonly<Record<string, RaycastPreferenceMetadata>> {
  return requireContext().descriptor.preferenceMetadata ?? {};
}

function currentPreferenceNames(): string[] {
  const names = new Set<string>(Object.keys(currentPreferenceMetadata()));
  for (const name of Object.keys(currentPreferenceValues())) {
    names.add(name);
  }
  return [...names];
}

/**
 * Deprecated preference metadata view. Declared metadata comes from the
 * trusted descriptor, with resolved manifest values overlaid on `.value`;
 * manually-created legacy contexts still receive inferred metadata.
 */
const preferenceTarget = Object.create(null) as Preferences;
export const preferences: Preferences = new Proxy(preferenceTarget, {
  get(target, property, receiver) {
    if (typeof property !== "string") {
      return Reflect.get(target, property, receiver);
    }
    const values = currentPreferenceValues();
    const metadata = currentPreferenceMetadata()[property];
    if (metadata === undefined && !Object.hasOwn(values, property)) {
      return undefined;
    }
    return createLegacyPreference(property, values, metadata);
  },
  has(_target, property) {
    return (
      typeof property === "string" &&
      (Object.hasOwn(currentPreferenceValues(), property) || Object.hasOwn(currentPreferenceMetadata(), property))
    );
  },
  ownKeys() {
    return currentPreferenceNames();
  },
  getOwnPropertyDescriptor(_target, property) {
    if (typeof property !== "string") {
      return undefined;
    }
    const values = currentPreferenceValues();
    const metadata = currentPreferenceMetadata()[property];
    if (metadata === undefined && !Object.hasOwn(values, property)) {
      return undefined;
    }
    return {
      configurable: true,
      enumerable: true,
      value: createLegacyPreference(property, values, metadata),
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

/** @deprecated There is no direct replacement in the modern API. */
export function useActionPanel(): ActionPanelState {
  return {
    update() {
      unsupported("useActionPanel.update");
    },
  };
}

/** @deprecated Use `useId` from React or `nanoid` instead. */
export const useId = useReactId;

/** @deprecated Use `useAI` from `@raycast/utils` instead. */
export const useUnstableAI = (): undefined => undefined;

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
  readonly entryPointType: RaycastEntryPointType;
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
  const metadata = context.descriptor.environment;
  const appearance = metadata?.appearance ?? "dark";
  const entryPointMode = context.descriptor.entryPointMode ?? "view";
  const rootDirectory = context.descriptor.rootDirectory;
  const pathUnderExtension = (name: string) =>
    rootDirectory === undefined ? name : `${rootDirectory.replace(/[\\/]$/, "")}/${name}`;
  return {
    raycastVersion: metadata?.raycastVersion ?? "1.79.0",
    ownerOrAuthorName: context.descriptor.ownerOrAuthorName ?? context.descriptor.extensionId,
    extensionName: context.descriptor.extensionName ?? context.descriptor.extensionId,
    entryPointType: metadata?.entryPointType ?? "command",
    entryPointName: context.descriptor.commandName,
    entryPointMode,
    assetsPath: pathUnderExtension("assets"),
    supportPath: pathUnderExtension("support"),
    isDevelopment: metadata?.isDevelopment ?? true,
    appearance,
    textSize: metadata?.textSize ?? "medium",
    launchType: compatGlobals.launchProps?.launchType ?? LaunchType.UserInitiated,
    canAccess: environmentCanAccess,
    theme: appearance,
    ...(compatGlobals.launchProps?.launchContext === undefined
      ? {}
      : { launchContext: compatGlobals.launchProps.launchContext }),
    commandName: context.descriptor.commandName,
    commandMode: entryPointMode,
    os: [osName],
  };
}

function environmentCanAccess(api: unknown): boolean {
  const context = requireContext();
  if (context.canAccess === undefined) {
    return false;
  }
  const apiName = getRaycastApiAccessName(api);
  const result = context.canAccess(api, apiName);
  if (typeof result !== "boolean") {
    throw new CompatibilityError("The environment.canAccess provider must return a boolean", {
      apiName,
      result,
    });
  }
  return result;
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

  /** @deprecated Use `LocalStorage.clear` instead. */
  async removeAllItems(): Promise<void> {
    await LocalStorage.clear();
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

/** @deprecated Use `Clipboard.clear` instead. */
export const clearClipboard: typeof Clipboard.clear = Clipboard.clear;

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
    // Raycast utilities pass this method directly to React's external-store
    // hooks. Bind it so the private cache state remains available when the
    // callback is invoked without its instance.
    this.subscribe = this.subscribe.bind(this);
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

export namespace Cache {
  export type Options = CacheOptions;
  export type Subscriber = CacheSubscriber;
  export type Subscription = CacheSubscription;
}

function cacheByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

// Extension bundles inline their own adapter copy, so environment.canAccess
// identifies measured API tokens with a realm-stable marker rather than
// relying on object identity across the host and extension modules.
markRaycastApiAccess(AI, "AI");
markRaycastApiAccess(BrowserExtension, "BrowserExtension");
markRaycastApiAccess(WindowManagement, "WindowManagement");
markRaycastApiAccess(Clipboard, "Clipboard");
markRaycastApiAccess(getSelectedText, "getSelectedText");
markRaycastApiAccess(getSelectedFinderItems, "getSelectedFinderItems");
