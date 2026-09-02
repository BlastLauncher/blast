import { app, BrowserWindow, dialog, globalShortcut, ipcMain } from "electron";

// import installExtension, { REACT_DEVELOPER_TOOLS } from "electron-devtools-installer";

import { createDebug } from "@blastlauncher/utils/src";

import { setMenu } from "./menu";
import { registerIPCMainEvents as registerNodeInstallerIPCEvents } from "./nodeInstaller/events";
import { hasVersionInstalled } from "./nrm";
import { registerIPCMainEvents as registerRendererIPCEvents } from "./renderer/events";
import { startRuntime, stopRuntime } from "./runtime";
import { createTray } from "./tray";
import { connectLocalCoreClient } from "@blastlauncher/core-node";
import { registerV2ClientIPCEvents, type V2ClientIPCRegistration } from "./v2Client";
import { V2ClientChannels } from "./v2ClientChannels";
import { getOwnedV2DaemonSocketPath, getV2ExternalExtensionStore, startV2Daemon, stopV2Daemon } from "./v2Daemon";
import { registerV2ExtensionPackageIPCEvents, type V2ExtensionPackageIPCRegistration } from "./v2ExtensionPackages";
import { registerV2NativeMenuBar, type V2NativeMenuBarRegistration } from "./v2MenuBar";
import { createApplicationWindow, createNodeInstallerWindow } from "./window";

const debug = createDebug("electron-client:index");

let v2ClientIPC: V2ClientIPCRegistration | undefined;
let v2ExtensionPackageIPC: V2ExtensionPackageIPCRegistration | undefined;
let v2NativeMenuBar: V2NativeMenuBarRegistration | undefined;
let v2CatalogRefreshPending = false;
let v2CatalogSubscription: (() => void) | undefined;
let v2MessageSequence = 0;

ipcMain.handle(V2ClientChannels.enabled, () => v2ClientIPC !== undefined);

require("update-electron-app").updateElectronApp();

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require("electron-squirrel-startup")) {
  app.quit();
}

// Only one app instance may own the V2 daemon socket (~/.blast/v2/core.sock).
// Without this, a second instance fails with "Failed to start the Node core
// daemon listener" instead of yielding to the running one.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const [firstWindow] = BrowserWindow.getAllWindows();
    if (firstWindow !== undefined) {
      if (firstWindow.isMinimized()) {
        firstWindow.restore();
      }
      firstWindow.show();
      firstWindow.focus();
    }
  });
}

const onReady = async (): Promise<void> => {
  debug("onReady");
  if (hasVersionInstalled()) {
    await startMainFlow();
  } else {
    createNodeInstallerWindow();
    registerNodeInstallerIPCEvents();
  }
};

// Main-window startup flow, extracted so the node installer can re-enter it
// in-process (see nodeInstaller/events.ts EXIT_AND_START).
export const startMainFlow = async (): Promise<void> => {
  debug("hasVersionInstalled");
  let v2Enabled = false;
  try {
    await startV2Daemon({ onCatalogChanged: requestV2CatalogRefresh });
    v2Enabled = registerV2Client();
    if (v2Enabled) {
      v2NativeMenuBar = registerV2NativeMenuBar(v2ClientIPC!.host);
    }
  } catch (error) {
    reportV2StartupFailure(error);
    await stopV2Daemon("V2 startup failed").catch((closeError) => {
      debug("failed to close V2 daemon after startup failure", closeError);
    });
    return;
  }
  if (!v2Enabled) {
    if (process.env.BLAST_V2_MODE !== "legacy") {
      reportV2StartupFailure(new Error("V2 startup did not expose a client session"));
      return;
    }
    await startRuntime();
  }
  setMenu();
  registerRendererIPCEvents();
  createApplicationWindow();
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
  void (async () => {
    try {
      v2NativeMenuBar?.dispose();
      v2NativeMenuBar = undefined;
      v2ExtensionPackageIPC?.dispose();
      v2ExtensionPackageIPC = undefined;
      v2CatalogSubscription?.();
      v2CatalogSubscription = undefined;
      v2CatalogRefreshPending = false;
      await v2ClientIPC?.dispose();
    } finally {
      await stopV2Daemon();
    }
  })().catch((error: unknown) => {
    debug("failed to close V2 resources", error);
  });
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

function registerV2Client(): boolean {
  const socketPath = getOwnedV2DaemonSocketPath() ?? process.env.BLAST_V2_SOCKET_PATH;
  if (socketPath === undefined || socketPath.length === 0) {
    return false;
  }

  v2ClientIPC = registerV2ClientIPCEvents({
    connect: () =>
      connectLocalCoreClient({
        socketPath,
        implementation: { name: "blast-electron-client", version: app.getVersion() },
        createMessageId: () => `electron-client-${++v2MessageSequence}`,
      }),
  });
  v2ExtensionPackageIPC = registerV2ExtensionPackageIPCEvents({ store: getV2ExternalExtensionStore() });
  v2CatalogSubscription = v2ClientIPC.host.subscribe((snapshot) => {
    if (snapshot.state === "ready") {
      flushV2CatalogRefresh();
    }
  });
  debug("registered V2 client bridge", socketPath);
  return true;
}

function requestV2CatalogRefresh(): void {
  v2CatalogRefreshPending = true;
  flushV2CatalogRefresh();
}

function flushV2CatalogRefresh(): void {
  if (!v2CatalogRefreshPending) {
    return;
  }
  const host = v2ClientIPC?.host;
  if (host?.snapshot?.state !== "ready") {
    return;
  }
  v2CatalogRefreshPending = false;
  void host.refreshCommands().catch((error: unknown) => {
    v2CatalogRefreshPending = true;
    debug("failed to refresh V2 commands after a catalog change", error);
  });
}

function reportV2StartupFailure(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  debug("failed to start V2", error);
  console.error(`Blast V2 startup failed: ${message}`);
  dialog.showErrorBox("Blast V2 startup failed", `${message}\n\nSet BLAST_V2_MODE=legacy to use the legacy runtime.`);
  app.quit();
}

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
