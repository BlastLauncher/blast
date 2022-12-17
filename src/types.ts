export type BaseNode = {
  props: any;
  children: any;
};

export interface Node extends BaseNode {}

export type Type = string;
export type Props = Record<string, any>;
export type Container = any;
export type Instance = any;
export type TextInstance = any;
export type SuspenseInstance = any;
export type HydratableInstance = any;
export type PublicInstance = any;
export type HostContext = {};
export type UpdatePayload = any;
export type ChildSet = any;
export type TimeoutHandle = any;
export type NoTimeout = any;
export type InternalInstanceHandle = {
  hostContext: HostContext;
};
