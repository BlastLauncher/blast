import {
  Children,
  Fragment,
  createContext,
  createElement,
  isValidElement,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Context,
  type ReactElement,
  type ReactNode,
} from "react";

import type { SceneEventPayload, SceneTransaction, ToastPayload, ToastStyle } from "@blastlauncher/scene";
import { SceneRendererError, createSceneRenderer, type SceneRenderer } from "@blastlauncher/react-renderer";

export { Icon } from "./icon.js";
export type { IconName } from "./icon.js";

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
  renderer?: SceneRenderer;
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
export function runCommand(context: RaycastCompatContext, component: () => ReactElement): void {
  if (compatGlobals.renderer !== undefined) {
    throw new CompatibilityError("A Raycast command is already running in this runtime");
  }
  const { renderer, takeError } = createCompatRenderer(context);
  compatGlobals.renderer = renderer;
  renderLoudly(renderer, takeError, () => adaptRootElement(createElement(NavigationHost, { base: component() })));
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
export function renderCommand(context: RaycastCompatContext, component: () => ReactElement): SceneRenderer {
  const { renderer, takeError } = createCompatRenderer(context);
  renderLoudly(renderer, takeError, () => adaptRootElement(createElement(NavigationHost, { base: component() })));
  return renderer;
}

function renderLoudly(renderer: SceneRenderer, takeError: () => unknown, component: () => ReactElement): void {
  let renderError: unknown;
  try {
    renderer.render(component());
  } catch (error) {
    renderError = error;
  }
  const captured = takeError();
  if (captured !== undefined) {
    throw captured;
  }
  if (renderError !== undefined) {
    throw renderError;
  }
}

function createCompatRenderer(context: RaycastCompatContext): {
  renderer: SceneRenderer;
  takeError: () => unknown;
} {
  configureRaycastCompat(context);
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
    renderer.dispatchSceneEvent(payload);
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

export interface DetailProps {
  readonly markdown?: string;
  readonly navigationTitle?: string;
}

export interface ActionPanelProps {
  readonly children?: ReactNode;
  readonly title?: string;
}

export interface ActionProps {
  readonly title: string;
  readonly onAction?: () => void;
  readonly icon?: IconLike;
  readonly shortcut?: unknown;
  readonly style?: unknown;
}

export interface CopyToClipboardProps {
  readonly title: string;
  readonly content: string;
  readonly onCopy?: () => void;
  readonly icon?: IconLike;
}

export type IconLike = string;

function unsupported(what: string, details?: unknown): never {
  throw new CompatibilityError(`${what} is not supported by the Blast compatibility surface yet`, details);
}

function serializeIcon(icon: IconLike | undefined, where: string): string | undefined {
  if (icon === undefined) {
    return undefined;
  }
  if (typeof icon !== "string") {
    unsupported(`An object icon in ${where}`, { icon });
  }
  return icon;
}

export function List(props: ListProps): ReactElement {
  if (props.actions !== undefined) {
    unsupported("The List actions prop");
  }
  return createElement(
    "list",
    {
      ...(props.navigationTitle === undefined ? {} : { navigationTitle: props.navigationTitle }),
      ...(props.searchBarPlaceholder === undefined ? {} : { searchBarPlaceholder: props.searchBarPlaceholder }),
      ...(props.isLoading === undefined ? {} : { isLoading: props.isLoading }),
    },
    props.children,
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
      ...(icon === undefined ? {} : { icon }),
    },
    mapItemChildren(children, "List.Item"),
  );
}

export function Detail(props: DetailProps): ReactElement {
  return createElement("detail", {
    ...(props.markdown === undefined ? {} : { markdown: props.markdown }),
    ...(props.navigationTitle === undefined ? {} : { navigationTitle: props.navigationTitle }),
  });
}

export function ActionPanel(props: ActionPanelProps): ReactElement {
  if (props.title !== undefined) {
    unsupported("The ActionPanel title prop");
  }
  return createElement(Fragment, null, mapItemChildren(props.children, "ActionPanel"));
}

export function Action(props: ActionProps): ReactElement {
  if (props.shortcut !== undefined) {
    unsupported("The Action shortcut prop");
  }
  if (props.style !== undefined) {
    unsupported("The Action style prop");
  }
  const icon = serializeIcon(props.icon, "Action");
  return createElement("action", {
    title: props.title,
    ...(icon === undefined ? {} : { icon }),
    onAction: () => {
      props.onAction?.();
    },
  });
}

function Push(props: {
  readonly title: string;
  readonly target: ReactElement;
  readonly icon?: IconLike;
  readonly shortcut?: unknown;
}): ReactElement {
  if (props.shortcut !== undefined) {
    unsupported("The Action.Push shortcut prop");
  }
  const icon = serializeIcon(props.icon, "Action.Push");
  const navigation = useContext(NavigationContext);
  return createElement("action", {
    title: props.title,
    ...(icon === undefined ? {} : { icon }),
    onAction: () => {
      navigation.push(props.target);
    },
  });
}

function CopyToClipboard(props: CopyToClipboardProps): ReactElement {
  const icon = serializeIcon(props.icon, "Action.CopyToClipboard");
  return createElement("action", {
    title: props.title,
    ...(icon === undefined ? {} : { icon }),
    onAction: () => {
      void copyToClipboard(props.content).then(() => props.onCopy?.());
    },
  });
}

async function copyToClipboard(text: string): Promise<void> {
  const response = await requireContext().requestCapability({
    capability: "clipboard",
    operation: "write",
    arguments: { text },
  });
  if (response.outcome !== "succeeded") {
    throw new CompatibilityError("The clipboard write capability was not granted", response);
  }
}

function mapItemChildren(children: ReactNode, where: string): ReactNode {
  return Children.map(children, (child) => {
    if (child === null || child === undefined || typeof child === "boolean") {
      return null;
    }
    if (!isValidElement(child)) {
      return unsupported(`A ${where} text child`, { child });
    }
    if (child.type === ActionPanel || child.type === Action || child.type === CopyToClipboard || child.type === Push) {
      return child;
    }
    return unsupported(`A ${where} child that is not an action`, { childType: String(child.type) });
  });
}

export const Clipboard = {
  async copy(text: string): Promise<void> {
    await copyToClipboard(text);
  },
  async read(): Promise<string> {
    const response = await requireContext().requestCapability({ capability: "clipboard", operation: "read" });
    if (response.outcome !== "succeeded") {
      throw new CompatibilityError("The clipboard read capability was not granted", response);
    }
    return typeof response.value === "string" ? response.value : "";
  },
};

Object.assign(Action, { CopyToClipboard });
Object.assign(List, { Item: ListItem });

function normalizeToastStyle(style: unknown): ToastStyle {
  return style === "success" || style === "failure" ? style : "neutral";
}

export class Toast {
  static readonly Style = {
    Success: "success",
    Failure: "failure",
  } as const;

  readonly title: string;
  readonly message: string | undefined;
  readonly style: ToastStyle;

  constructor(options: { readonly title: string; readonly message?: string; readonly style?: unknown }) {
    this.title = options.title;
    this.message = options.message;
    this.style = normalizeToastStyle(options.style);
  }

  async show(): Promise<void> {
    await requireContext().showToast(this.toPayload());
  }

  async hide(): Promise<void> {
    unsupported("Toast.hide");
  }

  toPayload(): ToastPayload {
    return {
      title: this.title,
      ...(this.message === undefined ? {} : { message: this.message }),
      style: this.style,
    };
  }
}

export interface ToastOptions {
  readonly title: string;
  readonly message?: string;
  readonly style?: unknown;
}

/**
 * Shows a toast in the client and returns the instance.
 */
export async function showToast(options: ToastOptions | string): Promise<Toast> {
  const toast =
    typeof options === "string"
      ? new Toast({ title: options })
      : new Toast({
          title: options.title,
          ...(options.message === undefined ? {} : { message: options.message }),
          style: options.style,
        });
  await toast.show();
  return toast;
}

/**
 * Returns the command's preference values: manifest defaults resolved by the
 * trusted catalog today, user overrides once preference storage exists.
 */
export function getPreferenceValues<T = Record<string, string | number | boolean>>(): T {
  return requireContext().descriptor.preferences as T;
}

export interface NavigationApi {
  push(element: ReactElement): void;
  pop(): void;
  popToRoot(): void;
}

const NavigationContext: Context<NavigationApi> = createContext<NavigationApi>({
  push() {},
  pop() {},
  popToRoot() {},
});

/**
 * Navigation within a running command. Pushed views stay mounted, so their
 * state survives popping; only the top view contributes scene nodes.
 */
export function useNavigation(): NavigationApi {
  return useContext(NavigationContext);
}

let navigationEntryCounter = 0;

function NavigationHost({ base }: { readonly base: ReactElement }): ReactElement {
  const [entries, setEntries] = useState<{ readonly id: number; readonly element: ReactElement }[]>([
    { id: ++navigationEntryCounter, element: base },
  ]);
  const navigation = useMemo<NavigationApi>(
    () => ({
      push(element: ReactElement) {
        setEntries((current) => [...current, { id: ++navigationEntryCounter, element }]);
      },
      pop() {
        setEntries((current) => (current.length > 1 ? current.slice(0, -1) : current));
      },
      popToRoot() {
        setEntries((current) => (current.length > 1 ? current.slice(0, 1) : current));
      },
    }),
    [],
  );

  return createElement(
    NavigationContext.Provider,
    { value: navigation },
    entries.map((entry, index) =>
      createElement(Fragment, { key: entry.id }, index === entries.length - 1 ? entry.element : null),
    ),
  );
}

Object.assign(Action, { Push });

export const LaunchType = {
  InitialLaunch: "initial-launch",
  HotReload: "hot-reload",
  BackgroundCheck: "background-check",
} as const;

export type LaunchTypeName = (typeof LaunchType)[keyof typeof LaunchType];

export interface Environment {
  os: readonly [string];
  launchType: LaunchTypeName;
  commandName: string;
  extensionName: string;
  raycastVersion: string;
}

/**
 * Runtime environment for the running command. `raycastVersion` reports the
 * compatibility target the adapter implements.
 */
export function environment(): Environment {
  const context = requireContext();
  const osName = context.platform === "darwin" ? "macOS" : context.platform === "win32" ? "Windows" : "Linux";
  return {
    os: [osName],
    launchType: LaunchType.InitialLaunch,
    commandName: context.descriptor.commandName,
    extensionName: context.descriptor.extensionId,
    raycastVersion: "1.79.0",
  };
}

/**
 * Per-extension key-value storage, brokered through the capability boundary
 * with the extension identity attached by the host.
 */
export const LocalStorage = {
  async getItem<T extends string | number | boolean>(key: string): Promise<T | undefined> {
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

  async setItem(key: string, value: string | number | boolean): Promise<void> {
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
