import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent, type WebContents } from "electron";

import { CoreClientHost, serializeCoreClientSnapshot, type CoreClientSnapshot } from "@blastlauncher/client";
import type { CoreClient, CommandIdentity } from "@blastlauncher/core";
import { validateSceneEventPayload, type SceneEventPayload, type ToastPayload } from "@blastlauncher/scene";

import { V2ClientChannels } from "./v2ClientChannels";

export interface V2ClientIPCOptions {
  readonly connect: () => Promise<CoreClient>;
}

export interface V2ClientIPCRegistration {
  readonly host: CoreClientHost;
  close(reason?: string): Promise<void>;
  dispose(): Promise<void>;
}

interface Subscription {
  readonly unsubscribe: () => void;
  readonly onDestroyed: () => void;
}

/**
 * Registers the V2 main-process boundary. Renderer messages are
 * validated here and never receive a socket, protocol session, or path.
 */
export function registerV2ClientIPCEvents(options: V2ClientIPCOptions): V2ClientIPCRegistration {
  const subscriptions = new Map<WebContents, Subscription>();
  const host = new CoreClientHost({
    connect: options.connect,
    onToast: (toast) => broadcastToast(toast),
  });

  const onSubscribe = (event: IpcMainEvent): void => {
    attach(event.sender);
  };
  const onUnsubscribe = (event: IpcMainEvent): void => {
    detach(event.sender);
  };

  ipcMain.on(V2ClientChannels.subscribe, onSubscribe);
  ipcMain.on(V2ClientChannels.unsubscribe, onUnsubscribe);
  ipcMain.handle(V2ClientChannels.start, async () => serializeCoreClientSnapshot(await host.start()));
  ipcMain.handle(V2ClientChannels.refreshCommands, async () =>
    serializeCoreClientSnapshot(await host.refreshCommands()),
  );
  ipcMain.handle(V2ClientChannels.runCommand, async (_event: IpcMainInvokeEvent, value: unknown) => {
    await host.runCommand(parseCommandIdentity(value));
  });
  ipcMain.handle(V2ClientChannels.stopCommand, async (_event: IpcMainInvokeEvent, value: unknown) => {
    await host.stopCommand(parseOptionalReason(value));
  });
  ipcMain.handle(V2ClientChannels.sceneEvent, async (_event: IpcMainInvokeEvent, value: unknown) => {
    const event = parseSceneEvent(value);
    await host.sendSceneEvent(event.eventId, event.values);
  });
  ipcMain.handle(V2ClientChannels.close, async (_event: IpcMainInvokeEvent, value: unknown) => {
    await host.close(parseOptionalReason(value));
  });

  return {
    host,
    close: (reason) => host.close(reason),
    async dispose(): Promise<void> {
      ipcMain.off(V2ClientChannels.subscribe, onSubscribe);
      ipcMain.off(V2ClientChannels.unsubscribe, onUnsubscribe);
      ipcMain.removeHandler(V2ClientChannels.start);
      ipcMain.removeHandler(V2ClientChannels.refreshCommands);
      ipcMain.removeHandler(V2ClientChannels.runCommand);
      ipcMain.removeHandler(V2ClientChannels.stopCommand);
      ipcMain.removeHandler(V2ClientChannels.sceneEvent);
      ipcMain.removeHandler(V2ClientChannels.close);
      for (const sender of subscriptions.keys()) {
        detach(sender);
      }
      await host.close("Application shutdown");
    },
  };

  function attach(sender: WebContents): void {
    if (sender.isDestroyed()) {
      return;
    }
    detach(sender);
    const onDestroyed = (): void => {
      if (subscriptions.get(sender)?.onDestroyed === onDestroyed) {
        detach(sender);
      }
    };
    let unsubscribe = (): void => {};
    const subscription: Subscription = {
      unsubscribe: () => unsubscribe(),
      onDestroyed,
    };
    subscriptions.set(sender, subscription);
    unsubscribe = host.subscribe((snapshot) => sendSnapshot(sender, snapshot));
    if (subscriptions.get(sender) !== subscription) {
      unsubscribe();
      return;
    }
    sender.once("destroyed", onDestroyed);
  }

  function detach(sender: WebContents): void {
    const subscription = subscriptions.get(sender);
    if (subscription === undefined) {
      return;
    }
    subscriptions.delete(sender);
    subscription.unsubscribe();
    sender.off("destroyed", subscription.onDestroyed);
  }

  function broadcastToast(toast: ToastPayload): void {
    for (const sender of subscriptions.keys()) {
      if (sender.isDestroyed()) {
        detach(sender);
        continue;
      }
      try {
        sender.send(V2ClientChannels.toast, toast);
      } catch {
        detach(sender);
      }
    }
  }

  function sendSnapshot(sender: WebContents, snapshot: CoreClientSnapshot): void {
    if (sender.isDestroyed()) {
      detach(sender);
      return;
    }
    try {
      sender.send(V2ClientChannels.snapshot, serializeCoreClientSnapshot(snapshot));
    } catch {
      detach(sender);
    }
  }
}

function parseCommandIdentity(value: unknown): CommandIdentity {
  if (!isRecord(value) || !isNonEmptyString(value.extensionId) || !isNonEmptyString(value.commandName)) {
    throw new Error("V2 runCommand requires a stable extensionId and commandName");
  }
  return { extensionId: value.extensionId, commandName: value.commandName };
}

function parseOptionalReason(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error("V2 command reason must be a string");
  }
  return value;
}

function parseSceneEvent(value: unknown): SceneEventPayload {
  const validation = validateSceneEventPayload(value);
  if (validation.ok) {
    return validation.value;
  }
  const issues = "issues" in validation ? validation.issues : [];
  throw new Error(`Invalid V2 scene event: ${issues.map((issue) => issue.path).join(", ")}`);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
