import { createDebug } from "@blastlauncher/utils/src";
import Reconciler from "react-reconciler";
import { DefaultEventPriority } from "react-reconciler/constants.js";

import createElement from "./elements/createElement";
import {
  Type,
  Props,
  Container,
  Instance,
  TextInstance,
  SuspenseInstance,
  HydratableInstance,
  FormInstance,
  PublicInstance,
  HostContext,
  ChildSet,
  TimeoutHandle,
  NoTimeout,
  TransitionStatus,
  InternalInstanceHandle,
} from "./types";

const debug = createDebug("blast:reconciler");

export const JSONTreeRenderer = Reconciler<
  Type,
  Props,
  Container,
  Instance,
  TextInstance,
  SuspenseInstance,
  HydratableInstance,
  FormInstance,
  PublicInstance,
  HostContext,
  ChildSet,
  TimeoutHandle,
  NoTimeout,
  TransitionStatus
>({
  // The `createInstance` method is called when a new React element is created.
  // It should return a JSON-RPC object representing the element.
  createInstance(
    type: Type,
    props: Props,
    rootContainerInstance: Container,
    hostContext: HostContext,
    internalInstanceHandle: InternalInstanceHandle,
  ) {
    debug(`createInstance(${type}, ${props})`);

    return createElement(type, props, hostContext);
  },

  createTextInstance(
    text: string,
    rootContainerInstance: Container,
    hostContext: object,
    internalInstanceHandle: object,
  ) {
    debug(`createTextInstance(${text})`);

    return null;
  },

  // The `appendInitialChild` method is called when a new child is added to a parent element.
  // It should append the child to the parent in the JSON-RPC object.
  appendInitialChild(parentInstance: Instance, child: Instance) {
    debug(`appendInitialChild`, parentInstance.elementType, child?.elementType);

    parentInstance.appendChild(child);
  },

  appendChildToContainer(container: Container, child: Instance) {
    debug(`appendChildToContainer`, child.elementType);

    container.appendChild(child);
  },

  finalizeInitialChildren(
    instance: Instance,
    type: Type,
    props: Props,
    rootContainer: Container,
    hostContext: HostContext,
  ) {
    debug(`finalizeInitialChildren`, instance.elementType, type);

    return true;
  },

  // The `commitUpdate` method is called after the props of an element have been updated.
  // It should update the props of the element in the JSON-RPC object.
  commitUpdate(
    instance: Instance,
    type: Type,
    prevProps: Props,
    nextProps: Props,
    internalHandle: InternalInstanceHandle,
  ) {
    debug(`commitUpdate`);

    instance.commitUpdate(nextProps);
  },

  commitMount(instance: Instance, type: Type, newProps: Props, internalInstanceHandle: InternalInstanceHandle) {
    debug(`commitMount`, instance.elementType);
    instance.commitMount();
  },

  // The `appendChild` method is called when a new child is added to a parent element.
  // It should append the child to the parent in the JSON-RPC object.
  appendChild(parentInstance: Instance, child: Instance) {
    debug(`appendChild`, parentInstance.elementType, child.elementType);

    parentInstance.appendChild(child);
  },

  insertBefore(parentInstance: Instance, child: Instance, beforeChild: Instance) {
    debug(`insertBefore`, parentInstance.elementType, child.elementType, beforeChild.elementType);

    parentInstance.insertBefore(child, beforeChild);
  },

  insertInContainerBefore(container: Container, child: Instance, beforeChild: Instance) {
    debug(`insertInContainerBefore`, child.elementType, beforeChild.elementType);

    container.insertBefore(child, beforeChild);
  },

  // The `removeChild` method is called when a child is removed from a parent element.
  // It should remove the child from the parent in the JSON-RPC object.
  removeChild(parentInstance: Instance, child: Instance) {
    debug(`removeChild`, parentInstance.elementType, child.elementType);

    parentInstance.removeChild(child);
  },

  removeChildFromContainer(container: Container, child: Instance) {
    debug(`removeChildFromContainer`);

    container.removeChild(child);
  },

  // The `resetTextContent` method is called when the text content of an element is reset.
  // It should reset the text content of the element in the JSON-RPC object.
  resetTextContent(domElement: object) {
    debug(`resetTextContent`);
    // domElement.text = '';
  },

  // The `commitTextUpdate` method is called when the text content of an element is updated.
  // It should update the text content of the element in the JSON-RPC object.
  commitTextUpdate(textInstance: null, oldText: string, newText: string) {
    debug(`commitTextUpdate(${textInstance}, ${oldText}, ${newText})`);

    throw new Error("commitTextUpdate should not be called");
  },

  // The `getRootHostContext` method is called when the root container is being prepared.
  // It should return the host context for the root container.
  getRootHostContext(rootContainerInstance: Container) {
    debug(`getRootHostContext`);

    return {
      server: rootContainerInstance.server,
    };
  },

  // The `shouldSetTextContent` method is called when a parent element is being updated.
  // It should return true if the text content of the element should be reset.
  shouldSetTextContent(type: string, props: object) {
    debug("shouldSetTextContent", type);

    return false;
  },

  // The `now` method is called to get the current time.
  // It should return the current time in milliseconds.
  afterActiveInstanceBlur() {
    // Noop
  },

  beforeActiveInstanceBlur() {
    // Noop
  },

  clearContainer(container: Container) {
    debug("clearContainer");

    container.clear();
  },

  // The `isPrimaryRenderer` property should be set to true if this renderer is the primary renderer.
  isPrimaryRenderer: true,

  // The `supportsMutation` property should be set to true if this renderer supports mutation.
  supportsMutation: true,

  // The `supportsPersistence` property should be set to true if this renderer supports persistence.
  supportsPersistence: false,

  // The `supportsHydration` property should be set to true if this renderer supports hydration.
  supportsHydration: false,

  getChildHostContext: function (parentHostContext: HostContext, type: Type) {
    debug("getChildHostContext", type);

    return parentHostContext;
  },
  getPublicInstance: function (instance: any) {
    debug("getPublicInstance");
    return instance;
  },
  prepareForCommit: function (containerInfo: Container): Record<string, any> | null {
    debug("prepareForCommit");
    return null;
  },
  resetAfterCommit: function (containerInfo: Container): void {
    debug("resetAfterCommit");

    const jsonTree = containerInfo.serialize();
    const server = containerInfo.hostContext.server;

    if (server) {
      debug("Emitting commit event: updateTree");
      server.emit("updateTree", jsonTree);
      // debug(JSON.stringify(jsonTree, null, 2));
    }
  },
  preparePortalMount: function (containerInfo: Container): void {
    throw new Error("preparePortalMount not implemented.");
  },
  scheduleTimeout: function (fn: (...args: unknown[]) => unknown, delay?: number | undefined) {
    return setTimeout(fn, delay);
  },
  cancelTimeout: function (id: any): void {
    clearTimeout(id);
  },
  noTimeout: -1,
  supportsMicrotasks: true,
  scheduleMicrotask: queueMicrotask,
  setCurrentUpdatePriority: function (): void {
    // No host-level event priority state is needed for the JSON renderer.
  },
  getCurrentUpdatePriority: function (): number {
    return DefaultEventPriority;
  },
  resolveUpdatePriority: function (): number {
    return DefaultEventPriority;
  },
  shouldAttemptEagerTransition: function (): boolean {
    return false;
  },
  NotPendingTransition: null as TransitionStatus | null,
  HostTransitionContext: null as any,
  resetFormInstance: function (_form: FormInstance): void {
    // Forms are represented as serialized nodes and do not need host cleanup.
  },
  requestPostPaintCallback: function (_callback: (time: number) => void): void {
    // Post-paint callbacks are not observable in this non-DOM renderer.
  },
  trackSchedulerEvent: function (): void {
    // No scheduler integration is required by the host.
  },
  resolveEventType: function (): string | null {
    return null;
  },
  resolveEventTimeStamp: function (): number {
    return 0;
  },
  maySuspendCommit: function (): boolean {
    return false;
  },
  preloadInstance: function (): boolean {
    return true;
  },
  startSuspendingCommit: function (): void {
    // Commits are synchronous for this renderer.
  },
  suspendInstance: function (): void {
    // Commits are synchronous for this renderer.
  },
  waitForCommitToBeReady: function (): null {
    return null;
  },
  getInstanceFromNode: function (node: any): Reconciler.Fiber | null | undefined {
    throw new Error("getInstanceFromNode not implemented.");
  },
  prepareScopeUpdate: function (scopeInstance: any, instance: any): void {
    throw new Error("prepareScopeUpdate not implemented.");
  },
  getInstanceFromScope: function (scopeInstance: any) {
    throw new Error("getInstanceFromScope not implemented.");
  },
  detachDeletedInstance: function (node: any): void {
    debug("detachDeletedInstance");
    // throw new Error("detachDeletedInstance not implemented.");
  },
});

export default JSONTreeRenderer;
