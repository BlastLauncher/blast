import { app, BrowserWindow, globalShortcut } from "electron";

import installExtension, { REACT_DEVELOPER_TOOLS } from "electron-devtools-installer";

import { setMenu } from "./menu";
import { registerIPCMainEvents } from "./nodeInstaller/events";
import { hasVersionInstalled } from "./nrm";
import { startRuntime, stopRuntime } from "./runtime";
import { createTray } from "./tray";
import { createApplicationWindow, createNodeInstallerWindow } from "./window";

// eslint-disable-next-line @typescript-eslint/no-var-requires
require('update-electron-app')()

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require("electron-squirrel-startup")) {
  app.quit();
}

const onReady = (): void => {
  if (!hasVersionInstalled()) {
    createNodeInstallerWindow();
    registerIPCMainEvents();
  } else {
    startRuntime();
    setMenu();
    createApplicationWindow();
  }
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", onReady);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  // Unregister all shortcuts.
  globalShortcut.unregisterAll();

  stopRuntime();
});

app.on("activate", () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createApplicationWindow();
  }
});

app.whenReady().then(() => {
  createTray();
  // installExtension(REACT_DEVELOPER_TOOLS, { loadExtensionOptions: { allowFileAccess: true } })
  //   .then((name) => console.log(`Added Extension:  ${name}`))
  //   .catch((err) => console.log("An error occurred: ", err));
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
