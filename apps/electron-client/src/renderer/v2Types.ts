import type { CommandIdentity } from "@blastlauncher/core";
import type { CoreClientSnapshot } from "@blastlauncher/client";
import type { SceneFormValues, ToastPayload } from "@blastlauncher/scene";

export type V2ClientSnapshotListener = (snapshot: CoreClientSnapshot) => void;
export type V2ClientToastListener = (toast: ToastPayload) => void;

export interface V2ClientRendererAPI {
  subscribeSnapshots(listener: V2ClientSnapshotListener): () => void;
  subscribeToasts(listener: V2ClientToastListener): () => void;
  start(): Promise<CoreClientSnapshot>;
  refreshCommands(): Promise<CoreClientSnapshot>;
  runCommand(identity: CommandIdentity): Promise<void>;
  stopCommand(reason?: string): Promise<void>;
  sendSceneEvent(eventId: string, values?: SceneFormValues): Promise<void>;
  close(reason?: string): Promise<void>;
}
