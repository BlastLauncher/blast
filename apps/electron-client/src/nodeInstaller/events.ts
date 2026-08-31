import { app, ipcMain } from "electron";

import { installNode, nrm, hasVersionInstalled } from "../nrm";
import { closeNodeInstallerWindow } from "../window";

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
    // Re-run the main-process startup selector so a newly installed runtime
    // enters packaged V2 by default instead of bypassing it through V1.
    app.relaunch();
    app.exit(0);
  });
}
