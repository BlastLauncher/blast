import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

import type { V2ClientRendererAPI, V2ClientSnapshotListener, V2ClientToastListener } from "./renderer/v2Types";
import { EventTypes } from "./renderer/types";
import { V2ClientChannels } from "./v2ClientChannels";

let v2SubscriptionCount = 0;

const v2: V2ClientRendererAPI = {
  subscribeSnapshots(listener: V2ClientSnapshotListener): () => void {
    const handler = (_event: IpcRendererEvent, snapshot: Parameters<V2ClientSnapshotListener>[0]): void => {
      listener(snapshot);
    };
    ipcRenderer.on(V2ClientChannels.snapshot, handler);
    const release = retainV2Subscription();
    return () => {
      ipcRenderer.removeListener(V2ClientChannels.snapshot, handler);
      release();
    };
  },
  subscribeToasts(listener: V2ClientToastListener): () => void {
    const handler = (_event: IpcRendererEvent, toast: Parameters<V2ClientToastListener>[0]): void => {
      listener(toast);
    };
    ipcRenderer.on(V2ClientChannels.toast, handler);
    const release = retainV2Subscription();
    return () => {
      ipcRenderer.removeListener(V2ClientChannels.toast, handler);
      release();
    };
  },
  start: () => ipcRenderer.invoke(V2ClientChannels.start),
  refreshCommands: () => ipcRenderer.invoke(V2ClientChannels.refreshCommands),
  runCommand: (identity) => ipcRenderer.invoke(V2ClientChannels.runCommand, identity),
  stopCommand: (reason) => ipcRenderer.invoke(V2ClientChannels.stopCommand, reason),
  sendSceneEvent: (eventId, values) => ipcRenderer.invoke(V2ClientChannels.sceneEvent, { eventId, values }),
  close: (reason) => ipcRenderer.invoke(V2ClientChannels.close, reason),
};

function retainV2Subscription(): () => void {
  if (v2SubscriptionCount++ === 0) {
    ipcRenderer.send(V2ClientChannels.subscribe);
  }
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    v2SubscriptionCount -= 1;
    if (v2SubscriptionCount === 0) {
      ipcRenderer.send(V2ClientChannels.unsubscribe);
    }
  };
}

contextBridge.exposeInMainWorld("electron", {
  closeWindow: () => ipcRenderer.invoke(EventTypes.CLOSE),
  v2,
});
