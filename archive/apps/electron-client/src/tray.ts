import { app, Menu, Tray, type MenuItemConstructorOptions } from "electron";
import path from "node:path";

import { restartRuntime } from "./runtime";
import { showMainWindow } from "./window";

type TrayMenuTemplate = MenuItemConstructorOptions[];

export interface V2TrayPresentation {
  readonly title?: string;
  readonly tooltip?: string;
}

let trayInstance: Tray | undefined;
let v2TrayTemplate: TrayMenuTemplate = [];
let v2TrayPresentation: V2TrayPresentation = {};

export const createTray = (): void => {
  if (trayInstance !== undefined) {
    return;
  }

  const tray = new Tray(path.join(__dirname, "../main/assets/Icon-Template.png"));
  trayInstance = tray;
  applyTrayPresentation();
  applyTrayMenu();

  tray.on("click", () => {
    app.show();
  });
};

/** Sets the V2-owned prefix of the native tray menu before or after tray creation. */
export function setV2TrayMenu(template: TrayMenuTemplate): void {
  v2TrayTemplate = [...template];
  applyTrayMenu();
}

/** Updates the native status-item title and tooltip for the active V2 scene. */
export function setV2TrayPresentation(presentation: V2TrayPresentation): void {
  v2TrayPresentation = { ...presentation };
  applyTrayPresentation();
}

function applyTrayMenu(): void {
  if (trayInstance === undefined) {
    return;
  }
  trayInstance.setContextMenu(Menu.buildFromTemplate([...v2TrayTemplate, ...createStaticTemplate()]));
}

function applyTrayPresentation(): void {
  if (trayInstance === undefined) {
    return;
  }
  trayInstance.setToolTip(v2TrayPresentation.tooltip ?? "");
  if (process.platform === "darwin") {
    trayInstance.setTitle(v2TrayPresentation.title ?? "");
  }
}

function createStaticTemplate(): TrayMenuTemplate {
  const template: TrayMenuTemplate = [
    {
      label: "Show App",
      click: () => {
        showMainWindow();
      },
    },
    {
      label: "Quit",
      click: () => {
        app.quit();
      },
    },
  ];

  if (process.env.NODE_ENV === "development") {
    template.push({
      label: "Restart Runtime",
      click: () => {
        restartRuntime();
      },
    });
  }
  return template;
}
