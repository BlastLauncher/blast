import type { SceneMessage, ScenePatchMessage } from "@blastlauncher/protocol";
export type { JsonValue, SceneNode, ScenePatchOp } from "@blastlauncher/protocol";

export type SceneSnapshot = Omit<SceneMessage, "type">;
export type ScenePatch = Omit<ScenePatchMessage, "type">;

export interface SceneRootOptions {
  publish(snapshot: SceneSnapshot): void;
  /** Optional incremental patch sink; called instead of `publish` when a patch is possible. */
  publishPatch?(patch: ScenePatch): void;
  onWarning?(message: string): void;
  onError?(error: unknown): void;
}
