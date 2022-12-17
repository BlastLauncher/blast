import Reconciler from 'react-reconciler';
import React from 'react';
import { DefaultEventPriority } from 'react-reconciler/constants.js';
import Component from '../examples/todo-list/src/index';
import { createDebug } from './debug';
import { runServer } from './server';
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
} from './types';

const server = runServer();

const debug = createDebug('blast:renderer');

const JSONRPCRenderer = Reconciler<
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
    internalInstanceHandle: InternalInstanceHandle,
  ) {
    debug(`createInstance(${type}, ${props})`);

    // Convert the type and props to a JSON-RPC object
    const jsonRpcElement: any = {
      type,
      props,
    };

    // Add event handlers to the JSON-RPC object
    // for (const propName in props) {
    //   if (typeof props[propName] === 'function') {
    //     jsonRpcElement[propName] = function (...args: any[]) {
    //       // Call the event handler from the client
    //       return internalInstanceHandle.hostContext.callEventHandler(
    //         propName,
    //         args,
    //       );
    //     };
    //   }
    // }

    return jsonRpcElement;
  },

  // The `createTextInstance` method is called when a new text node is created.
  // It should return a JSON-RPC object representing the text node.
  createTextInstance(
    text: string,
    rootContainerInstance: Container,
    hostContext: object,
    internalInstanceHandle: object,
  ) {
    debug(`createTextInstance(${text})`);
    return {
      type: 'Text',
      text,
    };
  },

  // The `appendInitialChild` method is called when a new child is added to a parent element.
  // It should append the child to the parent in the JSON-RPC object.
  appendInitialChild(parentInstance: Instance, child: object) {
    debug(`appendInitialChild(${parentInstance}, ${child})`);
    // parentInstance.children.push(child);

    // TODO:
  },

  appendChildToContainer(container: Container, child: object) {
    debug(`appendChildToContainer(${container}, ${child})`);
    // container.children.push(child);
  },

  // The `finalizeInitialChildren` method is called after all the initial children of a parent element have been added.
  // It should return the final JSON-RPC object representing the parent element.
  finalizeInitialChildren(
    instance: Instance,
    type: Type,
    props: Props,
    rootContainer: Container,
    hostContext: HostContext,
  ) {
    debug(`finalizeInitialChildren(${instance}, ${type}, ${props})`);
    return instance;
  },

  // The `prepareUpdate` method is called when the props of an element are updated.
  // It should return an object containing the new props for the element.
  prepareUpdate(
    domElement: object,
    type: string,
    oldProps: object,
    newProps: object,
    rootContainerInstance: Container,
    hostContext: object,
  ) {
    debug(`prepareUpdate(${domElement}, ${type}, ${oldProps}, ${newProps})`);
    return {
      ...newProps,
    };
  },

  // The `commitUpdate` method is called after the props of an element have been updated.
  // It should update the props of the element in the JSON-RPC object.
  commitUpdate(
    instance: Instance,
    updatePayload: UpdatePayload,
    type: Type,
    prevProps: Props,
    nextProps: Props,
    internalHandle: InternalInstanceHandle,
  ) {
    debug(
      `commitUpdate(${instance}, ${updatePayload}, ${type}, ${prevProps}, ${nextProps})`,
    );

    // for (const propName in updatePayload) {
    //   instance.props[propName] = updatePayload[propName];
    // }
  },

  commitMount(
    instance: Instance,
    type: Type,
    newProps: Props,
    internalInstanceHandle: InternalInstanceHandle,
  ) {
    debug(`commitMount(${instance}, ${type}, ${newProps})`);
  },

  // The `appendChild` method is called when a new child is added to a parent element.
  // It should append the child to the parent in the JSON-RPC object.
  appendChild(parentInstance: object, child: object) {
    debug(`appendChild(${parentInstance}, ${child})`);
    // parentInstance.children.push(child);
  },

  // The `insertBefore` method is called when a new child is inserted before an existing child in a parent element.
  // It should insert the child into the parent in the JSON-RPC object.
  insertBefore(parentInstance: object, child: object, beforeChild: object) {
    debug(`insertBefore(${parentInstance}, ${child}, ${beforeChild})`);
    // const index = parentInstance.children.indexOf(beforeChild);
    // if (index >= 0) {
    //   parentInstance.children.splice(index, 0, child);
    // } else {
    //   parentInstance.children.push(child);
    // }
  },

  // The `removeChild` method is called when a child is removed from a parent element.
  // It should remove the child from the parent in the JSON-RPC object.
  removeChild(parentInstance: object, child: object) {
    debug(`removeChild(${parentInstance}, ${child})`);
    // const index = parentInstance.children.indexOf(child);
    // if (index >= 0) {
    //   parentInstance.children.splice(index, 1);
    // }
  },

  // The `resetTextContent` method is called when the text content of an element is reset.
  // It should reset the text content of the element in the JSON-RPC object.
  resetTextContent(domElement: object) {
    debug(`resetTextContent(${domElement})`);
    // domElement.text = '';
  },

  // The `commitTextUpdate` method is called when the text content of an element is updated.
  // It should update the text content of the element in the JSON-RPC object.
  commitTextUpdate(textInstance: object, oldText: string, newText: string) {
    debug(`commitTextUpdate(${textInstance}, ${oldText}, ${newText})`);
    // textInstance.text = newText;
  },

  // The `getRootHostContext` method is called when the root container is being prepared.
  // It should return the host context for the root container.
  getRootHostContext(rootContainerInstance: Container) {
    debug(`getRootHostContext(${JSON.stringify(rootContainerInstance)})`);

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
    debug(`shouldSetTextContent(${type}`);

    debug(props);

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
    debug('clearContainer');
  },

  // The `isPrimaryRenderer` property should be set to true if this renderer is the primary renderer.
  isPrimaryRenderer: true,

  // The `supportsMutation` property should be set to true if this renderer supports mutation.
  supportsMutation: true,

  // The `supportsPersistence` property should be set to true if this renderer supports persistence.
  supportsPersistence: false,

  // The `supportsHydration` property should be set to true if this renderer supports hydration.
  supportsHydration: false,
  getChildHostContext: function (
    parentHostContext: any,
    type: any,
    rootContainer: any,
  ) {
    debug('getChildHostContext', parentHostContext, type, rootContainer);

    return {};
  },
  getPublicInstance: function (instance: any) {
    debug('getPublicInstance');
    throw new Error('getPublicInstance not implemented.');
  },
  prepareForCommit: function (containerInfo: any): Record<string, any> | null {
    debug('prepareForCommit');
    return null;
  },
  resetAfterCommit: function (containerInfo: any): void {
    debug('resetAfterCommit');
  },
  preparePortalMount: function (containerInfo: any): void {
    throw new Error('preparePortalMount not implemented.');
  },
  scheduleTimeout: function (
    fn: (...args: unknown[]) => unknown,
    delay?: number | undefined,
  ) {
    throw new Error('scheduleTimeout not implemented.');
  },
  cancelTimeout: function (id: any): void {
    throw new Error('cancelTimeout not implemented.');
  },
  noTimeout: undefined,
  getCurrentEventPriority: function (): number {
    return DefaultEventPriority;
  },
  getInstanceFromNode: function (
    node: any,
  ): Reconciler.Fiber | null | undefined {
    throw new Error('getInstanceFromNode not implemented.');
  },
  prepareScopeUpdate: function (scopeInstance: any, instance: any): void {
    throw new Error('prepareScopeUpdate not implemented.');
  },
  getInstanceFromScope: function (scopeInstance: any) {
    throw new Error('getInstanceFromScope not implemented.');
  },
  detachDeletedInstance: function (node: any): void {
    throw new Error('detachDeletedInstance not implemented.');
  },
});

function render(component: any, container: any) {
  const root = JSONRPCRenderer.createContainer(
    container,
    0,
    null,
    true,
    null,
    '',
    () => {},
    null,
  );

  JSONRPCRenderer.updateContainer(component, root, null);
}

render(React.createElement(Component), {});
