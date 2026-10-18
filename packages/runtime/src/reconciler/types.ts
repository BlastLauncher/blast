// Kept local until the protocol package lands (task 0004).
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface SceneNode {
  id: string;
  type: string;
  props: Record<string, JsonValue>;
  children: SceneNode[];
}

export interface SceneSnapshot {
  revision: number;
  root: SceneNode | null;
}

export interface SceneRootOptions {
  publish(snapshot: SceneSnapshot): void;
  onWarning?(message: string): void;
}
