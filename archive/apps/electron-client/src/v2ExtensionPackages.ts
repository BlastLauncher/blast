import {
  BrowserWindow,
  dialog,
  ipcMain,
  type IpcMain,
  type IpcMainInvokeEvent,
  type OpenDialogOptions,
} from "electron";

import type { ExternalExtensionStore } from "@blastlauncher/core-node";

import { V2ClientChannels } from "./v2ClientChannels";
import {
  runV2ExtensionPackageIdentityOperation,
  runV2ExtensionPackageSourceOperation,
  type V2ExtensionPackageOperation,
  type V2ExtensionPackageOperationResult,
} from "./v2ExtensionPackageTypes";

export type V2ExtensionPackageSourceOperation = "install" | "update";

export interface V2ExtensionPackageIPCOptions {
  readonly store?: ExternalExtensionStore;
  readonly ipcMain?: Pick<IpcMain, "handle" | "removeHandler">;
  readonly selectSource?: (
    event: IpcMainInvokeEvent,
    operation: V2ExtensionPackageSourceOperation,
  ) => Promise<string | undefined>;
}

export interface V2ExtensionPackageIPCRegistration {
  dispose(): void;
}

/**
 * Registers the renderer-safe package lifecycle boundary. Renderer calls
 * never carry source paths; install/update use the native main-process picker.
 */
export function registerV2ExtensionPackageIPCEvents(
  options: V2ExtensionPackageIPCOptions = {},
): V2ExtensionPackageIPCRegistration {
  const main = options.ipcMain ?? ipcMain;
  const selectSource = options.selectSource ?? choosePackageSource;
  let disposed = false;

  main.handle(V2ClientChannels.extensionPackagesEnabled, () => options.store !== undefined);
  main.handle(V2ClientChannels.installExtensionPackage, (event) => runSourceOperation(event, "install"));
  main.handle(V2ClientChannels.updateExtensionPackage, (event) => runSourceOperation(event, "update"));
  main.handle(V2ClientChannels.removeExtensionPackage, (_event, value: unknown) =>
    runIdentityOperation("remove", value),
  );
  main.handle(V2ClientChannels.rollbackExtensionPackage, (_event, value: unknown) =>
    runIdentityOperation("rollback", value),
  );

  return {
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      main.removeHandler(V2ClientChannels.extensionPackagesEnabled);
      main.removeHandler(V2ClientChannels.installExtensionPackage);
      main.removeHandler(V2ClientChannels.updateExtensionPackage);
      main.removeHandler(V2ClientChannels.removeExtensionPackage);
      main.removeHandler(V2ClientChannels.rollbackExtensionPackage);
    },
  };

  async function runSourceOperation(
    event: IpcMainInvokeEvent,
    operation: V2ExtensionPackageSourceOperation,
  ): Promise<V2ExtensionPackageOperationResult> {
    return runV2ExtensionPackageSourceOperation(options.store, operation, () => selectSource(event, operation));
  }

  async function runIdentityOperation(
    operation: Extract<V2ExtensionPackageOperation, "remove" | "rollback">,
    value: unknown,
  ): Promise<V2ExtensionPackageOperationResult> {
    return runV2ExtensionPackageIdentityOperation(options.store, operation, value);
  }
}

async function choosePackageSource(
  event: IpcMainInvokeEvent,
  operation: V2ExtensionPackageSourceOperation,
): Promise<string | undefined> {
  const options: OpenDialogOptions = {
    title: operation === "install" ? "Import Blast extension" : "Update Blast extension",
    properties: ["openFile", "openDirectory"],
    filters: [{ name: "Blast extension packages", extensions: ["tgz", "tar.gz", "tar"] }],
  };
  const parent = BrowserWindow.fromWebContents(event.sender);
  const result = parent === null ? await dialog.showOpenDialog(options) : await dialog.showOpenDialog(parent, options);
  return result.canceled ? undefined : result.filePaths[0];
}
