import { Children, Fragment, createElement, isValidElement, type ReactElement, type ReactNode } from "react";

import type { SceneEventPayload, SceneTransaction } from "@blastlauncher/scene";
import { createSceneRenderer, type SceneRenderer } from "@blastlauncher/react-renderer";

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
  readonly publish: (transaction: SceneTransaction) => Promise<void>;
  readonly onEvent: (handler: (payload: SceneEventPayload) => void | Promise<void>) => void;
  readonly requestCapability: (request: {
    readonly capability: string;
    readonly operation: string;
    readonly arguments?: Readonly<Record<string, string | number | boolean>>;
  }) => Promise<{ readonly outcome: string; readonly value?: string | number | boolean | null }>;
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
  renderLoudly(renderer, takeError, component);
}

/**
 * Renders a Raycast-style scene with a command-provided component factory and
 * returns the renderer for direct observation. Used by tests.
 */
export function renderCommand(context: RaycastCompatContext, component: () => ReactElement): SceneRenderer {
  const { renderer, takeError } = createCompatRenderer(context);
  renderLoudly(renderer, takeError, component);
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
    if (child.type === ActionPanel || child.type === Action || child.type === CopyToClipboard) {
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
