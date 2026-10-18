import type { CoreClientHost, CoreClientSnapshot } from "@blastlauncher/client";

import { createDebug } from "@blastlauncher/utils/src";

import { setV2TrayMenu, setV2TrayPresentation } from "./tray";
import { createV2NativeMenuBarModel } from "./v2MenuBarModel";
import { createV2NativeMenuTemplate } from "./v2MenuBarTemplate";

export interface V2NativeMenuBarRegistration {
  dispose(): void;
}

const debug = createDebug("electron-client:v2-menu-bar");

/**
 * Projects the V2 host snapshot into the Electron-owned tray. The host keeps
 * all command and scene operations in the main process.
 */
export function registerV2NativeMenuBar(host: CoreClientHost): V2NativeMenuBarRegistration {
  let disposed = false;
  const unsubscribe = host.subscribe(render);

  return {
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      unsubscribe();
      setV2TrayMenu([]);
      setV2TrayPresentation({});
    },
  };

  function render(snapshot: CoreClientSnapshot): void {
    if (disposed) {
      return;
    }
    try {
      const model = createV2NativeMenuBarModel(snapshot);
      setV2TrayMenu(
        createV2NativeMenuTemplate(model, {
          runCommand: (identity) => {
            void host.runCommand(identity).catch((error: unknown) => {
              debug("native menu command failed", error);
            });
          },
          sceneEvent: (eventId, values) => {
            void host.sendSceneEvent(eventId, values).catch((error: unknown) => {
              debug("native menu scene event failed", error);
            });
          },
          stopCommand: () => {
            void host.stopCommand("Stopped from native menu").catch((error: unknown) => {
              debug("native menu stop failed", error);
            });
          },
        }),
      );
      setV2TrayPresentation({
        ...(model.title === undefined ? {} : { title: model.title }),
        ...(model.tooltip === undefined ? {} : { tooltip: model.tooltip }),
      });
    } catch (error) {
      debug("native menu snapshot projection failed", error);
    }
  }
}
