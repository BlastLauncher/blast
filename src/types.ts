import type { Server } from "rpc-websockets";

export type BaseNode = {
  props: any;
  children: any;
};

export type Node = BaseNode;

export type Type = string;

export type Props = Record<string, any>;

export interface Container {
  appendChild(child: Instance): void;
  clear(): void;
  serialize(): any;
  server: Server | null;
  hostContext: HostContext;
}

export interface Instance {
  appendChild(child: Instance): void;
  children: Instance[];
  commitMount(): void;
  commitUpdate(newProps: Props): void;
  props: Props;
  removeChild(child: Instance): void;
  serialize(): any;
  propsForSerialize: string[];
  elementType: string;
  hostContext: HostContext;
}

export type TextInstance = null;

export type SuspenseInstance = any;

export type HydratableInstance = any;

export type PublicInstance = Instance;

export type HostContext = {
  server?: Server | null;
};

export type UpdatePayload = any;

export type ChildSet = any;

export type TimeoutHandle = any;

export type NoTimeout = any;

export type InternalInstanceHandle = {
  hostContext: HostContext;
};
