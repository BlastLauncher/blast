import type { SceneMessage } from "@blastlauncher/protocol";
export type { JsonValue, SceneNode } from "@blastlauncher/protocol";

export type SceneSnapshot = Omit<SceneMessage, "type">;

export interface SceneRootOptions {
  publish(snapshot: SceneSnapshot): void;
  onWarning?(message: string): void;
  onError?(error: unknown): void;
}
