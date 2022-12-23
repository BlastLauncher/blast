import Reconciler from "react-reconciler";
import { DefaultEventPriority } from "react-reconciler/constants.js";
import { createDebug } from "./utils/debug";
import {
  Type,
  Props,
  Container,
  Instance,
  TextInstance,
  SuspenseInstance,
  HydratableInstance,
  PublicInstance,
  HostContext,
  UpdatePayload,
  ChildSet,
  TimeoutHandle,
  NoTimeout,
  InternalInstanceHandle,
} from "./types";
import createElement from "./elements/createElement";

const debug = createDebug("blast:reconciler");

export const JSONTreeRenderer = Reconciler<
  Type,
  Props,
  Container,
  Instance,
  TextInstance,
  SuspenseInstance,
  HydratableInstance,
  PublicInstance,
  HostContext,
  UpdatePayload,
  ChildSet,
  TimeoutHandle,
  NoTimeout
>({
  // The `createInstance` method is called when a new React element is created.
  // It should return a JSON-RPC object representing the element.
  createInstance(
    type: Type,
    props: Props,
    rootContainerInstance: Container,
    hostContext: HostContext,
    internalInstanceHandle: InternalInstanceHandle
  ) {
    debug(`createInstance(${type}, ${props})`);

    return createElement(type, props);
  },

  createTextInstance(
    text: string,
    rootContainerInstance: Container,
    hostContext: object,
    internalInstanceHandle: object
  ) {
    debug(`createTextInstance(${text})`);

    return null;
  },

  // The `appendInitialChild` method is called when a new child is added to a parent element.
  // It should append the child to the parent in the JSON-RPC object.
  appendInitialChild(parentInstance: Instance, child: Instance) {
    debug(`appendInitialChild`, parentInstance.elementType, child.elementType);

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
    hostContext: HostContext
  ) {
    debug(`finalizeInitialChildren`, instance.elementType, type);

    return true;
  },

  // The `prepareUpdate` method is called when the props of an element are updated.
  // It should return an object containing the new props for the element.
  prepareUpdate(
    domElement: object,
    type: string,
    oldProps: object,
    newProps: object,
    rootContainerInstance: Container,
    hostContext: object
  ) {
    debug(`prepareUpdate`);
    return true;
  },

  // The `commitUpdate` method is called after the props of an element have been updated.
  // It should update the props of the element in the JSON-RPC object.
  commitUpdate(
    instance: Instance,
    updatePayload: UpdatePayload,
    type: Type,
    prevProps: Props,
    nextProps: Props,
    internalHandle: InternalInstanceHandle
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

  // The `insertBefore` method is called when a new child is inserted before an existing child in a parent element.
  // It should insert the child into the parent in the JSON-RPC object.
  insertBefore(parentInstance: Instance, child: Instance, beforeChild: Instance) {
    debug(`insertBefore`, parentInstance.elementType, child.elementType, beforeChild.elementType);
  },

  // The `removeChild` method is called when a child is removed from a parent element.
  // It should remove the child from the parent in the JSON-RPC object.
  removeChild(parentInstance: Instance, child: Instance) {
    debug(`removeChild`, parentInstance.elementType, child.elementType);
  },

  removeChildFromContainer(container: Container, child: Instance) {
    debug(`removeChildFromContainer`);
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
    debug(`getRootHostContext`, rootContainerInstance);

    return {
      callEventHandler: (name: string, args: any[]) => {
        debug(`callEventHandler(${name}, ${JSON.stringify(args)})`);
        return null;
      },
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

  getChildHostContext: function (parentHostContext: any, type: any, rootContainer: any) {
    debug("getChildHostContext", parentHostContext, type, rootContainer);

    return {};
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

    debug(JSON.stringify(containerInfo.serialize(), null, 2));
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
  getCurrentEventPriority: function (): number {
    return DefaultEventPriority;
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
