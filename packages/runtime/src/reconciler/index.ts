import { createContext, type ReactNode } from "react";
import Reconciler from "react-reconciler";
import {
  ConcurrentRoot,
  DiscreteEventPriority,
  NoEventPriority,
} from "react-reconciler/constants.js";
import { serializeProps, type Handler } from "./serialize.ts";
import type { SceneNode, SceneRootOptions } from "./types.ts";
export type { JsonValue, SceneNode, SceneRootOptions, SceneSnapshot } from "./types.ts";

type Props = Record<string, unknown>;
interface Instance {
  id: string;
  type: string;
  props: Props;
  children: Instance[];
  hidden: boolean;
}
interface Container {
  children: Instance[];
  nextId: number;
  commit(): void;
}
type Parent = Pick<Container, "children">;

function remove(parent: Parent, child: Instance) {
  const index = parent.children.indexOf(child);
  if (index !== -1) parent.children.splice(index, 1);
}
function insert(parent: Parent, child: Instance, before?: Instance) {
  remove(parent, child);
  const index = before ? parent.children.indexOf(before) : -1;
  parent.children.splice(index === -1 ? parent.children.length : index, 0, child);
}
function instance(container: Container, type: string, props: Props): Instance {
  return { id: String(container.nextId++), type, props, children: [], hidden: false };
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
  commitUpdate: (node, _type, _old, props) => {
    node.props = props;
  },
  commitTextUpdate: (node, _old, text) => {
    node.props = { text };
  },
  clearContainer: (container) => {
    container.children = [];
  },
  hideInstance: (node) => {
    node.hidden = true;
  },
  hideTextInstance: (node) => {
    node.hidden = true;
  },
  unhideInstance: (node) => {
    node.hidden = false;
  },
  unhideTextInstance: (node) => {
    node.hidden = false;
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

export function createSceneRoot({ publish, onWarning = noop }: SceneRootOptions) {
  let revision = 0;
  let handlers = new Map<string, Map<string, Handler>>();
  const errors: unknown[] = [];
  const container: Container = {
    children: [],
    nextId: 1,
    commit() {
      const nextHandlers = new Map<string, Map<string, Handler>>();
      function snapshot(node: Instance): SceneNode {
        const callbacks = new Map<string, Handler>();
        const props = serializeProps(node.type, node.props, callbacks, onWarning);
        nextHandlers.set(node.id, callbacks);
        return {
          id: node.id,
          type: node.type,
          props,
          children: node.children.filter((child) => !child.hidden).map(snapshot),
        };
      }
      const children = container.children.filter((child) => !child.hidden).map(snapshot);
      // A fragment with multiple top-level nodes needs a serializable parent.
      const root =
        children.length > 1
          ? { id: "0", type: "#root", props: {}, children }
          : (children[0] ?? null);
      handlers = nextHandlers;
      publish({ revision: ++revision, root });
    },
  };
  const root = renderer.createContainer(
    container,
    ConcurrentRoot,
    null,
    false,
    null,
    "",
    (error) => {
      errors.push(error);
    },
    renderer.defaultOnCaughtError,
    (error) => {
      errors.push(error);
    },
    noop,
    null,
  );
  function flush() {
    renderer.flushSyncWork();
    while (renderer.flushPassiveEffects()) renderer.flushSyncWork();
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
