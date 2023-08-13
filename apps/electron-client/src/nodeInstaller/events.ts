import { ipcMain } from "electron";

import { setMenu } from "../menu";
import { installNode, nrm, hasVersionInstalled } from "../nrm";
import { startRuntime } from "../runtime";
import { closeNodeInstallerWindow, createApplicationWindow } from "../window";

import { EventTypes } from "./types";

export function registerIPCMainEvents() {
  ipcMain.handle(EventTypes.INSTALL_NODE, async () => {
    if (hasVersionInstalled()) {
      return true;
    }

    await installNode();

    try {
      nrm.nodePath;
    } catch (error) {
      return false;
    }

    return true;
  });

  ipcMain.handle(EventTypes.EXIT_AND_START, async () => {
    closeNodeInstallerWindow();
    await startRuntime();
    setMenu();
    createApplicationWindow();
  });
}
