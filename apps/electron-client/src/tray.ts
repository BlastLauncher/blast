import { app, Menu, Tray } from "electron";
import path from "path";

import { restartRuntime } from "./runtime";
import { showMainWindow } from "./window";

export const createTray = (): void => {
  const tray = new Tray(path.join(__dirname, "../main/assets/Icon-Template.png"));
  const template = [
    {
      label: "Show App",
      click: function () {
        showMainWindow();
      },
    },
    {
      label: "Quit",
      click: function () {
        app.quit();
      },
    },
  ]

  if (process.env.NODE_ENV === "development") {
    template.push({
      label: "Restart Runtime",
      click: function () {
        restartRuntime();
      },
    });
  }

  const contextMenu = Menu.buildFromTemplate(template);

  tray.setContextMenu(contextMenu);

  tray.on("click", () => {
    app.show();
  });
};
