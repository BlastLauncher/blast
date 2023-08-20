import { ipcMain } from "electron";

import { hideMainWindow } from '../window'

import { EventTypes } from "./types";

export function registerIPCMainEvents() {
  ipcMain.handle(EventTypes.CLOSE, async () => {
    hideMainWindow();
  });
}
