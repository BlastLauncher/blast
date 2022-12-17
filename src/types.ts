export type BaseNode = {
  props: any;
  children: any;
};

export type Node = BaseNode;

export type Type = string;

export type Props = Record<string, any>;

export type Container = any;

export interface Instance {
  appendChild(child: Instance | TextInstance): void;
  children: Instance[];
  commitMount(): void;
  commitUpdate(newProps: Props): void;
  node: Node;
  props: Props;
  removeChild(child: Instance | TextInstance): void;
}

export type TextInstance = null;

export type SuspenseInstance = any;

export type HydratableInstance = any;

export type PublicInstance = Instance | TextInstance;

export type HostContext = {
  [key: string]: any;
};

export type UpdatePayload = any;

export type ChildSet = any;

export type TimeoutHandle = any;

export type NoTimeout = any;

export type InternalInstanceHandle = {
  hostContext: HostContext;
};
