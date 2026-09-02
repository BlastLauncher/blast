import { app, ipcMain } from "electron";

import { hasVersionInstalled, installNode } from "../nrm";
import { closeNodeInstallerWindow } from "../window";

import { EventTypes } from "./types";

export function registerIPCMainEvents() {
  ipcMain.handle(EventTypes.INSTALL_NODE, async () => {
    if (hasVersionInstalled()) {
      return true;
    }

    await installNode();
    return hasVersionInstalled();
  });

  ipcMain.handle(EventTypes.EXIT_AND_START, async () => {
    closeNodeInstallerWindow();
    if (!app.isPackaged) {
      // Under electron-forge start the dev server belongs to the CLI parent
      // process: app.relaunch() would orphan the app from its dev server and
      // leave blank windows behind. Re-enter the main flow in-process instead.
      // Re-run the main-process startup selector so a newly installed runtime
      // enters packaged V2 by default instead of bypassing it through V1.
      const { startMainFlow } = await import("../index");
      await startMainFlow();
      return;
    }
    app.relaunch();
    app.exit(0);
  });
}
