import { createContext, type ReactNode } from "react";
import Reconciler from "react-reconciler";
import {
  ConcurrentRoot,
  DiscreteEventPriority,
  NoEventPriority,
} from "react-reconciler/constants.js";
import { serializeProps, type Handler } from "./serialize.ts";
import type { SceneNode, ScenePatchOp, SceneRootOptions } from "./types.ts";
export type {
  JsonValue,
  SceneNode,
  ScenePatch,
  ScenePatchOp,
  SceneRootOptions,
  SceneSnapshot,
} from "./types.ts";

type Props = Record<string, unknown>;
interface Instance {
  id: string;
  type: string;
  props: Props;
  children: Instance[];
  hidden: boolean;
  parent: Instance | Container | null;
  propsDirty: boolean;
  childrenDirty: boolean;
  subtreeDirty: boolean;
  published: boolean;
  publishedCovered: boolean;
  publishedChildren: Instance[];
  lastCommitRev: number;
  cachedNode: SceneNode | undefined;
  ownHandlers: Map<string, Handler> | undefined;
}
interface Container {
  parent: null;
  children: Instance[];
  nextId: number;
  childrenDirty: boolean;
  subtreeDirty: boolean;
  commit(): void;
}
type Parent = Instance | Container;

function shallowRawPropsEqual(a: Props, b: Props): boolean {
  if (a === b) return true;
  let countA = 0;
  for (const key in a) {
    if (!Object.hasOwn(a, key) || key === "children" || key === "key") continue;
    countA++;
    if (!Object.hasOwn(b, key) || !Object.is(a[key], b[key])) return false;
  }
  let countB = 0;
  for (const key in b) {
    if (!Object.hasOwn(b, key) || key === "children" || key === "key") continue;
    countB++;
  }
  return countA === countB;
}

function jsonEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!jsonEqual(a[i], b[i])) return false;
    return true;
  }
  if (Array.isArray(b)) return false;
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  let countA = 0;
  for (const key in ao) {
    if (!Object.hasOwn(ao, key)) continue;
    countA++;
    if (!Object.hasOwn(bo, key) || !jsonEqual(ao[key], bo[key])) return false;
  }
  let countB = 0;
  for (const key in bo) {
    if (!Object.hasOwn(bo, key)) continue;
    countB++;
  }
  return countA === countB;
}

function markUp(node: Parent | null): void {
  let current: Parent | null = node;
  while (current !== null && !current.subtreeDirty) {
    current.subtreeDirty = true;
    current = current.parent;
  }
}

function remove(parent: Parent, child: Instance) {
  const index = parent.children.indexOf(child);
  if (index !== -1) {
    parent.children.splice(index, 1);
    if (child.parent === parent) child.parent = null;
    parent.childrenDirty = true;
    markUp(parent);
  }
}
function insert(parent: Parent, child: Instance, before?: Instance) {
  if (child.parent && child.parent !== parent) remove(child.parent, child);
  else {
    const existing = parent.children.indexOf(child);
    if (existing !== -1) parent.children.splice(existing, 1);
  }
  const index = before ? parent.children.indexOf(before) : -1;
  parent.children.splice(index === -1 ? parent.children.length : index, 0, child);
  child.parent = parent;
  parent.childrenDirty = true;
  markUp(parent);
}
function instance(container: Container, type: string, props: Props): Instance {
  return {
    id: String(container.nextId++),
    type,
    props,
    children: [],
    hidden: false,
    parent: null,
    propsDirty: true,
    childrenDirty: true,
    subtreeDirty: true,
    published: false,
    publishedCovered: false,
    publishedChildren: [],
    lastCommitRev: 0,
    cachedNode: undefined,
    ownHandlers: undefined,
  };
}
const noop = () => {};
let priority = NoEventPriority;
type Config = Reconciler.HostConfig<
  string,
  Props,
  Container,
  Instance,
  Instance,
  never,
  never,
  never,
  never,
  Instance,
  object,
  never,
  ReturnType<typeof setTimeout>,
  -1,
  null,
  null,
  never,
  never,
  never,
  never
>;
const config: Config = {
  rendererVersion: "0.0.0",
  rendererPackageName: "@blastlauncher/runtime",
  extraDevToolsConfig: null,
  bindToConsole: (_method, args) => () => console.log(...args),
  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,
  isPrimaryRenderer: true,
  getRootHostContext: () => ({}),
  getChildHostContext: (context) => context,
  getPublicInstance: (node) => node,
  createInstance: (type, props, container) => instance(container, type, props),
  createTextInstance: (text, container) => instance(container, "#text", { text }),
  appendInitialChild: insert,
  appendChild: insert,
  appendChildToContainer: insert,
  insertBefore: insert,
  insertInContainerBefore: insert,
  removeChild: remove,
  removeChildFromContainer: remove,
  finalizeInitialChildren: () => false,
  shouldSetTextContent: () => false,
  prepareForCommit: () => null,
  resetAfterCommit: (container) => container.commit(),
  commitUpdate: (node, _type, oldProps, props) => {
    node.props = props;
    if (!shallowRawPropsEqual(oldProps, props)) {
      node.propsDirty = true;
      markUp(node);
    }
  },
  commitTextUpdate: (node, oldText, text) => {
    node.props = { text };
    if (oldText !== text) {
      node.propsDirty = true;
      markUp(node);
    }
  },
  clearContainer: (container) => {
    for (const child of container.children) child.parent = null;
    container.children = [];
    container.childrenDirty = true;
    container.subtreeDirty = true;
  },
  hideInstance: (node) => {
    if (!node.hidden) {
      node.hidden = true;
      if (node.parent) {
        node.parent.childrenDirty = true;
        markUp(node.parent);
      }
    }
  },
  hideTextInstance: (node) => {
    if (!node.hidden) {
      node.hidden = true;
      if (node.parent) {
        node.parent.childrenDirty = true;
        markUp(node.parent);
      }
    }
  },
  unhideInstance: (node) => {
    if (node.hidden) {
      node.hidden = false;
      if (node.parent) {
        node.parent.childrenDirty = true;
        markUp(node.parent);
      }
    }
  },
  unhideTextInstance: (node) => {
    if (node.hidden) {
      node.hidden = false;
      if (node.parent) {
        node.parent.childrenDirty = true;
        markUp(node.parent);
      }
    }
  },
  scheduleTimeout: setTimeout,
  cancelTimeout: clearTimeout,
  noTimeout: -1,
  supportsMicrotasks: true,
  scheduleMicrotask: queueMicrotask,
  preparePortalMount: noop,
  getInstanceFromNode: () => null,
  beforeActiveInstanceBlur: noop,
  afterActiveInstanceBlur: noop,
  prepareScopeUpdate: noop,
  getInstanceFromScope: () => null,
  detachDeletedInstance: noop,
  NotPendingTransition: null,
  HostTransitionContext: createContext(null) as unknown as Config["HostTransitionContext"],
  setCurrentUpdatePriority: (next) => {
    priority = next;
  },
  getCurrentUpdatePriority: () => priority,
  // All ordinary updates use the sync lane so flush() needs no timers.
  resolveUpdatePriority: () => priority || DiscreteEventPriority,
  resetFormInstance: noop,
  requestPostPaintCallback: (callback) => callback(performance.now()),
  shouldAttemptEagerTransition: () => false,
  trackSchedulerEvent: noop,
  resolveEventType: () => null,
  resolveEventTimeStamp: () => performance.now(),
  maySuspendCommit: () => false,
  maySuspendCommitOnUpdate: () => false,
  maySuspendCommitInSyncRender: () => false,
  preloadInstance: () => true,
  startSuspendingCommit: () => null,
  suspendInstance: noop,
  suspendOnActiveViewTransition: noop,
  waitForCommitToBeReady: () => null,
  getSuspendedCommitReason: () => null,
};
const renderer = Reconciler(config);

export function createSceneRoot({
  publish,
  publishPatch,
  onWarning = noop,
  onError,
}: SceneRootOptions) {
  let revision = 0;
  let lastPublishedKind: "none" | "null" | "single" | "synthetic" = "none";
  let lastPublishedRootId: string | null = null;
  let lastTopChildren: Instance[] = [];
  const handlers = new Map<string, Map<string, Handler>>();
  const errors: unknown[] = [];
  // Errors raised while serializing or publishing a commit. Throwing inside
  // React's commit phase corrupts the reconciler for every later root in the
  // process, so they are held here and reported once React has finished.
  const commitErrors: unknown[] = [];
  function drainCommitErrors() {
    for (const error of commitErrors.splice(0)) reportError(error);
  }
  const container: Container = {
    parent: null,
    children: [],
    nextId: 1,
    childrenDirty: true,
    subtreeDirty: true,
    commit() {
      try {
        commitSnapshot();
      } catch (error) {
        commitErrors.push(error);
        // Async updates are not followed by flush(); report them on a microtask.
        queueMicrotask(drainCommitErrors);
      }
    },
  };

  function isCovered(node: Instance): boolean {
    return node.type === "Navigation.Entry" && node.props.active === false;
  }

  function unpublishSubtree(node: Instance, activeRev: number): void {
    if (!node.published || node.lastCommitRev === activeRev) return;
    node.published = false;
    handlers.delete(node.id);
    const prev = node.publishedChildren;
    node.publishedChildren = [];
    for (let i = 0; i < prev.length; i++) unpublishSubtree(prev[i]!, activeRev);
  }

  /** Serializes a subtree (reusing clean cached subtrees) and registers its handlers. */
  function serializeSubtree(node: Instance, activeRev: number, removed: Instance[]): SceneNode {
    node.lastCommitRev = activeRev;
    const covered = isCovered(node);
    const needsProps = node.propsDirty || !node.cachedNode;
    const needsChildren =
      node.childrenDirty ||
      node.subtreeDirty ||
      !node.cachedNode ||
      !node.published ||
      covered !== node.publishedCovered;

    let props: SceneNode["props"];
    if (needsProps) {
      const callbacks = new Map<string, Handler>();
      props = serializeProps(node.type, node.props, callbacks, onWarning);
      node.ownHandlers = callbacks;
      handlers.set(node.id, callbacks);
    } else {
      props = node.cachedNode!.props;
      if (!node.published && node.ownHandlers) handlers.set(node.id, node.ownHandlers);
    }

    let children: SceneNode[];
    if (covered) {
      if (node.publishedChildren.length > 0) {
        for (let i = 0; i < node.publishedChildren.length; i++) {
          removed.push(node.publishedChildren[i]!);
        }
        node.publishedChildren = [];
      }
      children = [];
    } else if (!needsChildren && node.cachedNode) {
      children = node.cachedNode.children;
    } else {
      const prevChildren = node.publishedChildren;
      const nextInstances: Instance[] = [];
      children = [];
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i]!;
        if (child.hidden) continue;
        nextInstances.push(child);
        children.push(serializeSubtree(child, activeRev, removed));
      }
      for (let i = 0; i < prevChildren.length; i++) {
        const prevChild = prevChildren[i]!;
        if (prevChild.lastCommitRev !== activeRev) removed.push(prevChild);
      }
      node.publishedChildren = nextInstances;
    }

    node.propsDirty = false;
    node.childrenDirty = false;
    node.subtreeDirty = false;
    node.published = true;
    node.publishedCovered = covered;
    const nextNode: SceneNode =
      !needsProps && !needsChildren && node.cachedNode
        ? node.cachedNode
        : { id: node.id, type: node.type, props, children };
    node.cachedNode = nextNode;
    return nextNode;
  }

  /** Collects minimal patch ops against the last published tree in O(dirty nodes). */
  function collectPatch(
    node: Instance,
    activeRev: number,
    ops: ScenePatchOp[],
    removed: Instance[],
  ): void {
    node.lastCommitRev = activeRev;
    if (!node.subtreeDirty) return;
    const covered = isCovered(node);
    const coveredChanged = covered !== node.publishedCovered;
    let nextProps = node.cachedNode!.props;

    let propsChanged = false;
    if (node.propsDirty) {
      const callbacks = new Map<string, Handler>();
      const serialized = serializeProps(node.type, node.props, callbacks, onWarning);
      node.ownHandlers = callbacks;
      handlers.set(node.id, callbacks);
      if (!jsonEqual(nextProps, serialized)) {
        nextProps = serialized;
        propsChanged = true;
        ops.push({ op: "props", id: node.id, props: nextProps });
      }
    }

    let childrenChanged = false;
    let nextChildrenNodes = node.cachedNode!.children;
    if (covered) {
      if (node.publishedChildren.length > 0 || coveredChanged) {
        for (let i = 0; i < node.publishedChildren.length; i++) {
          removed.push(node.publishedChildren[i]!);
        }
        node.publishedChildren = [];
        nextChildrenNodes = [];
        childrenChanged = true;
        ops.push({ op: "children", id: node.id, children: [] });
      }
    } else if (node.childrenDirty || coveredChanged) {
      const prevChildren = node.publishedChildren;
      const nextInstances: Instance[] = [];
      const patchChildren: (string | SceneNode)[] = [];
      nextChildrenNodes = [];
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i]!;
        if (child.hidden) continue;
        nextInstances.push(child);
        if (child.published) {
          child.lastCommitRev = activeRev;
          patchChildren.push(child.id);
          if (child.subtreeDirty) collectPatch(child, activeRev, ops, removed);
          nextChildrenNodes.push(child.cachedNode!);
        } else {
          const serialized = serializeSubtree(child, activeRev, removed);
          patchChildren.push(serialized);
          nextChildrenNodes.push(serialized);
        }
      }
      for (let i = 0; i < prevChildren.length; i++) {
        const prevChild = prevChildren[i]!;
        if (prevChild.lastCommitRev !== activeRev) removed.push(prevChild);
      }
      node.publishedChildren = nextInstances;
      childrenChanged = true;
      ops.push({ op: "children", id: node.id, children: patchChildren });
    } else {
      // Children list unchanged; recurse only into dirty existing children.
      const kids = node.publishedChildren;
      const prevNodes = node.cachedNode!.children;
      let anyChildChanged = false;
      for (let i = 0; i < kids.length; i++) {
        const child = kids[i]!;
        if (child.subtreeDirty) {
          collectPatch(child, activeRev, ops, removed);
          if (child.cachedNode !== prevNodes[i]) anyChildChanged = true;
        }
      }
      if (anyChildChanged) {
        childrenChanged = true;
        nextChildrenNodes = [];
        for (let i = 0; i < kids.length; i++) {
          nextChildrenNodes.push(kids[i]!.cachedNode!);
        }
      }
    }

    node.propsDirty = false;
    node.childrenDirty = false;
    node.subtreeDirty = false;
    node.published = true;
    node.publishedCovered = covered;
    if (propsChanged || childrenChanged) {
      node.cachedNode = {
        id: node.id,
        type: node.type,
        props: nextProps,
        children: nextChildrenNodes,
      };
    }
  }

  function commitSnapshot() {
    const activeRev = revision + 1;
    const removed: Instance[] = [];
    const visibleTop: Instance[] = [];
    for (let i = 0; i < container.children.length; i++) {
      const child = container.children[i]!;
      if (!child.hidden) visibleTop.push(child);
    }

    const nextKind: "null" | "single" | "synthetic" =
      visibleTop.length === 0 ? "null" : visibleTop.length === 1 ? "single" : "synthetic";
    const nextRootId = nextKind === "null" ? null : nextKind === "single" ? visibleTop[0]!.id : "0";

    const canPatch =
      publishPatch !== undefined &&
      lastPublishedKind !== "none" &&
      nextKind === lastPublishedKind &&
      nextRootId === lastPublishedRootId &&
      nextKind !== "null";

    if (canPatch) {
      const baseRevision = revision;
      const ops: ScenePatchOp[] = [];
      if (nextKind === "single") {
        collectPatch(visibleTop[0]!, activeRev, ops, removed);
      } else {
        // Synthetic `#root` ("0") with multiple top-level children.
        if (container.childrenDirty) {
          const patchChildren: (string | SceneNode)[] = [];
          for (let i = 0; i < visibleTop.length; i++) {
            const child = visibleTop[i]!;
            if (child.published) {
              child.lastCommitRev = activeRev;
              patchChildren.push(child.id);
              if (child.subtreeDirty) collectPatch(child, activeRev, ops, removed);
            } else {
              patchChildren.push(serializeSubtree(child, activeRev, removed));
            }
          }
          for (let i = 0; i < lastTopChildren.length; i++) {
            const prevTop = lastTopChildren[i]!;
            if (prevTop.lastCommitRev !== activeRev) removed.push(prevTop);
          }
          lastTopChildren = visibleTop;
          ops.push({ op: "children", id: "0", children: patchChildren });
        } else {
          for (let i = 0; i < visibleTop.length; i++) {
            const child = visibleTop[i]!;
            if (child.subtreeDirty) collectPatch(child, activeRev, ops, removed);
          }
        }
      }
      for (let i = 0; i < removed.length; i++) unpublishSubtree(removed[i]!, activeRev);
      container.childrenDirty = false;
      container.subtreeDirty = false;
      revision = activeRev;
      publishPatch({ revision, baseRevision, ops });
      return;
    }

    // Full snapshot path (initial commit, root shape/id change, or unmount to null).
    const serializedTop: SceneNode[] = [];
    for (let i = 0; i < visibleTop.length; i++) {
      serializedTop.push(serializeSubtree(visibleTop[i]!, activeRev, removed));
    }
    for (let i = 0; i < lastTopChildren.length; i++) {
      const prevTop = lastTopChildren[i]!;
      if (prevTop.lastCommitRev !== activeRev) removed.push(prevTop);
    }
    for (let i = 0; i < removed.length; i++) unpublishSubtree(removed[i]!, activeRev);
    lastTopChildren = visibleTop;
    container.childrenDirty = false;
    container.subtreeDirty = false;
    const root =
      serializedTop.length > 1
        ? { id: "0", type: "#root", props: {}, children: serializedTop }
        : (serializedTop[0] ?? null);
    const prevKind = lastPublishedKind;
    lastPublishedKind = nextKind;
    lastPublishedRootId = nextRootId;
    if (publishPatch !== undefined && prevKind !== "none" && nextKind === "null") {
      const baseRevision = revision;
      revision = activeRev;
      publishPatch({ revision, baseRevision, ops: [{ op: "root", root: null }] });
      return;
    }
    revision = activeRev;
    publish({ revision, root });
  }
  function reportError(error: unknown) {
    if (onError) onError(error);
    else errors.push(error);
  }
  const root = renderer.createContainer(
    container,
    ConcurrentRoot,
    null,
    false,
    null,
    "",
    reportError,
    renderer.defaultOnCaughtError,
    reportError,
    noop,
    null,
  );
  function flush() {
    renderer.flushSyncWork();
    while (renderer.flushPassiveEffects()) renderer.flushSyncWork();
    drainCommitErrors();
    if (errors.length) throw errors.shift();
  }
  function render(element: ReactNode) {
    renderer.updateContainerSync(element, root, null, null);
    flush();
  }
  return {
    render,
    unmount() {
      render(null);
    },
    dispatch(nodeId: string, handler: string, args: unknown[]): unknown {
      const callbacks = handlers.get(nodeId);
      if (!callbacks) throw new Error(`Unknown scene node: ${nodeId}`);
      const callback = callbacks.get(handler);
      if (!callback) throw new Error(`Unknown handler ${handler} on scene node ${nodeId}`);
      return callback(...args);
    },
    flush,
  };
}
