import Reconciler from "react-reconciler";
import { ConcurrentRoot, DiscreteEventPriority } from "react-reconciler/constants.js";
import { createElement, type ReactElement, type ReactNode } from "react";

import type {
  SceneEventPayload,
  SceneNode,
  SceneNodeType,
  SceneOperation,
  ScenePropValue,
  SceneTransaction,
  SceneTransactionSink,
} from "@blastlauncher/scene";
import { SCENE_PROP_WHITELIST } from "@blastlauncher/scene";

export const SCENE_LIST_TYPE = "list";
export const SCENE_LIST_ITEM_TYPE = "list-item";
export const SCENE_ACTION_TYPE = "action";
export const SCENE_DETAIL_TYPE = "detail";

export interface SceneListProps {
  readonly navigationTitle?: string;
  readonly searchBarPlaceholder?: string;
  readonly isLoading?: boolean;
  readonly children?: ReactNode;
}

export interface SceneListItemProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly children?: ReactNode;
}

export interface SceneActionProps {
  readonly title: string;
  readonly onAction?: () => void;
}

export function SceneList(props: SceneListProps): ReactElement {
  return createElement(SCENE_LIST_TYPE, props);
}

export function SceneListItem(props: SceneListItemProps): ReactElement {
  return createElement(SCENE_LIST_ITEM_TYPE, props);
}

export function SceneAction(props: SceneActionProps): ReactElement {
  return createElement(SCENE_ACTION_TYPE, props);
}

export class SceneRendererError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "SceneRendererError";
    this.code = code;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

export interface SceneRendererOptions {
  readonly sink: SceneTransactionSink;
  readonly createNodeId?: () => string;
  readonly createEventId?: () => string;
  readonly createTransactionId?: () => string;
  /** Receives uncaught React render errors and sink publish failures. */
  readonly onError?: (error: unknown) => void;
}

export interface SceneRenderer {
  /** Renders (or re-renders) the extension scene and publishes one transaction per commit. */
  render(element: ReactNode): void;
  /** Routes a `scene.event` payload to the callback registered for its identifier. */
  dispatchSceneEvent(payload: SceneEventPayload): void;
  /** Resolves after every queued sink publish has settled. */
  flush(): Promise<void>;
  /** Clears the scene without publishing; the renderer cannot render afterwards. */
  unmount(): void;
}

interface SceneContainer {
  children: HostNode[];
}

interface HostContext {}

const SCENE_HOST_CONTEXT: HostContext = {};

interface HostNode {
  readonly id: string;
  readonly type: SceneNodeType;
  props: Readonly<Record<string, ScenePropValue>>;
  callbacks: Map<string, { eventId: string; callback: () => void }>;
  children: HostNode[];
  parent: HostNode | null;
}

export function createSceneRenderer(options: SceneRendererOptions): SceneRenderer {
  const eventRegistry = new Map<string, () => void>();
  let nodeCounter = 0;
  let eventCounter = 0;
  let transactionCounter = 0;
  let unmounted = false;
  let hasPublished = false;
  let pendingOperations: SceneOperation[] = [];
  let rootMutated = false;
  let publishQueue: Promise<void> = Promise.resolve();
  let contractViolation: SceneRendererError | undefined;
  let renderErrored = false;

  const nextNodeId = options.createNodeId ?? (() => `node-${++nodeCounter}`);
  const nextEventId = options.createEventId ?? (() => `event-${++eventCounter}`);
  const nextTransactionId = options.createTransactionId ?? (() => `transaction-${++transactionCounter}`);

  const reconciler = Reconciler<
    string,
    Record<string, unknown>,
    SceneContainer,
    HostNode,
    HostNode,
    HostNode,
    HostNode,
    HostNode,
    HostNode,
    HostContext,
    null,
    NodeJS.Timeout,
    -1,
    null
  >({
    isPrimaryRenderer: true,
    supportsMutation: true,
    supportsPersistence: false,
    supportsHydration: false,

    createInstance(type: string, props: Record<string, unknown>): HostNode {
      return createHostNode(type, props);
    },

    createTextInstance(): HostNode {
      throw contractViolationError(
        new SceneRendererError(
          "text_not_supported",
          "The scene contract has no text nodes; put text into node properties",
        ),
      );
    },

    appendInitialChild(parentInstance: HostNode, child: HostNode): void {
      attachChild(parentInstance, child);
    },

    appendChild(parentInstance: HostNode, child: HostNode): void {
      attachChild(parentInstance, child);
      if (hasPublished) {
        pendingOperations.push({ type: "insert", node: materialize(child), parentId: parentInstance.id });
      }
    },

    appendChildToContainer(container: SceneContainer, child: HostNode): void {
      container.children.push(child);
      child.parent = null;
      if (hasPublished) {
        rootMutated = true;
      }
    },

    finalizeInitialChildren(): boolean {
      return false;
    },

    commitUpdate(
      instance: HostNode,
      _type: string,
      _prevProps: Record<string, unknown>,
      nextProps: Record<string, unknown>,
      _internalHandle: unknown,
    ): void {
      const diff = applyProps(instance, nextProps);
      if (diff !== null && hasPublished) {
        pendingOperations.push({ type: "update", nodeId: instance.id, props: diff });
      }
    },

    commitMount(): void {},

    insertBefore(parentInstance: HostNode, child: HostNode, beforeChild: HostNode): void {
      const index = parentInstance.children.indexOf(beforeChild);
      parentInstance.children.splice(index, 0, child);
      child.parent = parentInstance;
      if (hasPublished) {
        pendingOperations.push({
          type: "insert",
          node: materialize(child),
          parentId: parentInstance.id,
          index,
        });
      }
    },

    insertInContainerBefore(container: SceneContainer, child: HostNode, beforeChild: HostNode): void {
      const index = container.children.indexOf(beforeChild);
      container.children.splice(index, 0, child);
      child.parent = null;
      if (hasPublished) {
        rootMutated = true;
      }
    },

    removeChild(parentInstance: HostNode, child: HostNode): void {
      const index = parentInstance.children.indexOf(child);
      parentInstance.children.splice(index, 1);
      child.parent = null;
      releaseCallbacks(child);
      if (hasPublished) {
        pendingOperations.push({ type: "remove", nodeId: child.id });
      }
    },

    removeChildFromContainer(container: SceneContainer, child: HostNode): void {
      const index = container.children.indexOf(child);
      container.children.splice(index, 1);
      child.parent = null;
      releaseCallbacks(child);
      if (hasPublished) {
        rootMutated = true;
      }
    },

    clearContainer(container: SceneContainer): void {
      for (const child of container.children) {
        releaseCallbacks(child);
      }
      container.children.length = 0;
      if (hasPublished) {
        rootMutated = true;
      }
    },

    resetTextContent(): void {},

    commitTextUpdate(): void {
      throw new SceneRendererError("text_not_supported", "The scene contract has no text nodes");
    },

    getRootHostContext(): HostContext {
      return SCENE_HOST_CONTEXT;
    },

    getChildHostContext(parentHostContext: HostContext): HostContext {
      return parentHostContext;
    },

    shouldSetTextContent(): boolean {
      return false;
    },

    getPublicInstance(instance: HostNode): HostNode {
      return instance;
    },

    prepareForCommit(): null {
      return null;
    },

    resetAfterCommit(container: SceneContainer): void {
      publish(container);
    },

    preparePortalMount(): void {
      throw new SceneRendererError("portals_not_supported", "Scene rendering does not support portals");
    },

    scheduleTimeout(fn: (...args: unknown[]) => unknown, delay?: number): NodeJS.Timeout {
      return setTimeout(fn, delay);
    },

    cancelTimeout(id: NodeJS.Timeout): void {
      clearTimeout(id);
    },

    noTimeout: -1 as const,
    supportsMicrotasks: true,
    scheduleMicrotask: queueMicrotask,
    setCurrentUpdatePriority(): void {},
    getCurrentUpdatePriority(): number {
      return DiscreteEventPriority;
    },
    resolveUpdatePriority(): number {
      return DiscreteEventPriority;
    },
    shouldAttemptEagerTransition(): boolean {
      return false;
    },
    NotPendingTransition: null,
    HostTransitionContext: null as never,
    resetFormInstance(): void {},
    requestPostPaintCallback(): void {},
    trackSchedulerEvent(): void {},
    resolveEventType(): string | null {
      return null;
    },
    resolveEventTimeStamp(): number {
      return 0;
    },
    maySuspendCommit(): boolean {
      return false;
    },
    preloadInstance(): boolean {
      return true;
    },
    startSuspendingCommit(): void {},
    suspendInstance(): void {},
    waitForCommitToBeReady(): null {
      return null;
    },
    getInstanceFromNode(): null {
      return null;
    },
    prepareScopeUpdate(): void {},
    getInstanceFromScope(): null {
      return null;
    },
    detachDeletedInstance(): void {},
    beforeActiveInstanceBlur(): void {},
    afterActiveInstanceBlur(): void {},
  });

  const container: SceneContainer = { children: [] };
  let root: object | null = null;

  function createHostNode(type: string, props: Record<string, unknown>): HostNode {
    if (
      type !== SCENE_LIST_TYPE &&
      type !== SCENE_LIST_ITEM_TYPE &&
      type !== SCENE_ACTION_TYPE &&
      type !== SCENE_DETAIL_TYPE
    ) {
      throw contractViolationError(new SceneRendererError("unknown_node_type", "Unknown scene node type", { type }));
    }
    const node: HostNode = {
      id: nextNodeId(),
      type,
      props: {},
      callbacks: new Map(),
      children: [],
      parent: null,
    };
    applyProps(node, props);
    return node;
  }

  function applyProps(node: HostNode, props: Record<string, unknown>): Record<string, ScenePropValue | null> | null {
    const nextSceneProps: Record<string, ScenePropValue> = {};
    const nextCallbacks = new Map<string, { eventId: string; callback: () => void }>();
    const diff: Record<string, ScenePropValue | null> = {};

    for (const key of Object.keys(props)) {
      if (key === "children") {
        continue;
      }
      const value = props[key];
      if (node.type === SCENE_ACTION_TYPE && key === "onAction") {
        if (value === undefined) {
          continue;
        }
        if (typeof value !== "function") {
          throw contractViolationError(
            new SceneRendererError("invalid_callback", "Scene callbacks must be functions", {
              nodeId: node.id,
              property: key,
            }),
          );
        }
        const existing = node.callbacks.get(key);
        if (existing !== undefined && existing.callback === value) {
          nextCallbacks.set(key, existing);
          nextSceneProps[key] = existing.eventId;
          continue;
        }
        const eventId = nextEventId();
        const callback = value as () => void;
        nextCallbacks.set(key, { eventId, callback });
        eventRegistry.set(eventId, callback);
        nextSceneProps[key] = eventId;
        continue;
      }
      if (!SCENE_PROP_WHITELIST[node.type].includes(key)) {
        throw contractViolationError(
          new SceneRendererError("unknown_prop", "Property is not in the scene whitelist", {
            nodeType: node.type,
            property: key,
          }),
        );
      }
      if (value === undefined) {
        continue;
      }
      if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
        throw contractViolationError(
          new SceneRendererError("invalid_prop", "Expected a string, number, or boolean property value", {
            nodeId: node.id,
            property: key,
          }),
        );
      }
      nextSceneProps[key] = value;
    }

    for (const [key, before] of Object.entries(node.props)) {
      const after = nextSceneProps[key];
      if (before !== after) {
        diff[key] = after === undefined ? null : after;
      }
    }
    for (const [key, after] of Object.entries(nextSceneProps)) {
      if (!(key in node.props)) {
        diff[key] = after;
      }
    }
    for (const [key, existing] of node.callbacks) {
      const next = nextCallbacks.get(key);
      if (next === undefined || next.eventId !== existing.eventId) {
        eventRegistry.delete(existing.eventId);
      }
    }

    node.props = nextSceneProps;
    node.callbacks = nextCallbacks;
    return Object.keys(diff).length === 0 ? null : diff;
  }

  function releaseCallbacks(node: HostNode): void {
    for (const [, existing] of node.callbacks) {
      eventRegistry.delete(existing.eventId);
    }
    node.callbacks = new Map();
    for (const child of node.children) {
      releaseCallbacks(child);
    }
  }

  function rootList(sceneContainer: SceneContainer): HostNode {
    if (sceneContainer.children.length > 1) {
      throw new SceneRendererError("invalid_scene_root", "The scene must render exactly one root node", {
        children: sceneContainer.children.length,
      });
    }
    const rootChild = sceneContainer.children[0] as HostNode;
    if (rootChild.type !== SCENE_LIST_TYPE && rootChild.type !== SCENE_DETAIL_TYPE) {
      throw new SceneRendererError("invalid_scene_root", "The scene root must be a list or a detail", {
        type: rootChild.type,
      });
    }
    return rootChild;
  }

  function publish(sceneContainer: SceneContainer): void {
    if (unmounted) {
      return;
    }
    if (renderErrored) {
      // React errored while rendering this commit; keep the client's last
      // good scene instead of publishing a broken tree.
      renderErrored = false;
      pendingOperations = [];
      rootMutated = false;
      return;
    }
    if (sceneContainer.children.length === 0) {
      // An errored commit leaves an empty root; report it and keep the
      // client's last good scene.
      pendingOperations = [];
      rootMutated = false;
      options.onError?.(new SceneRendererError("empty_scene_root", "The commit produced an empty scene"));
      return;
    }
    const rootChild = rootList(sceneContainer);
    if (!hasPublished || rootMutated) {
      queuePublish({
        transactionId: nextTransactionId(),
        operations: [{ type: "snapshot", root: materialize(rootChild) }],
      });
      hasPublished = true;
      rootMutated = false;
      pendingOperations = [];
      return;
    }
    if (pendingOperations.length === 0) {
      return;
    }
    queuePublish({ transactionId: nextTransactionId(), operations: pendingOperations });
    pendingOperations = [];
  }

  function queuePublish(transaction: SceneTransaction): void {
    publishQueue = publishQueue
      .then(() => options.sink.publish(transaction))
      .then(
        () => undefined,
        (error: unknown) => {
          options.onError?.(error);
        },
      );
  }

  function contractViolationError(error: SceneRendererError): SceneRendererError {
    contractViolation ??= error;
    return error;
  }

  return {
    render(element: ReactNode): void {
      if (unmounted) {
        throw new SceneRendererError("renderer_unmounted", "The scene renderer was unmounted");
      }
      if (root === null) {
        root = reconciler.createContainer(
          container,
          ConcurrentRoot,
          null,
          false,
          null,
          "",
          (error: unknown) => {
            renderErrored = true;
            options.onError?.(error);
          },
          (error: unknown) => {
            renderErrored = true;
            options.onError?.(error);
          },
          (error: unknown) => {
            renderErrored = true;
            options.onError?.(error);
          },
          () => {},
        );
      }
      contractViolation = undefined;
      try {
        reconciler.updateContainerSync(element, root, null, () => {});
        reconciler.flushSyncWork();
      } catch (error) {
        contractViolation = undefined;
        throw error;
      }
      const violation = contractViolation;
      contractViolation = undefined;
      if (violation !== undefined) {
        throw violation;
      }
    },

    dispatchSceneEvent(payload: SceneEventPayload): void {
      const callback = eventRegistry.get(payload.eventId);
      if (callback === undefined) {
        throw new SceneRendererError("unknown_event", "No scene callback is registered for the event identifier", {
          eventId: payload.eventId,
        });
      }
      callback();
    },

    flush(): Promise<void> {
      reconciler.flushSyncWork();
      reconciler.flushPassiveEffects();
      return publishQueue;
    },

    unmount(): void {
      if (unmounted) {
        return;
      }
      unmounted = true;
      if (root !== null) {
        reconciler.updateContainerSync(null, root, null, () => {});
        reconciler.flushSyncWork();
      }
      eventRegistry.clear();
    },
  };
}

function attachChild(parent: HostNode, child: HostNode): void {
  parent.children.push(child);
  child.parent = parent;
}

function materialize(node: HostNode): SceneNode {
  return {
    id: node.id,
    type: node.type,
    props: { ...node.props },
    children: node.children.map(materialize),
  };
}
