import { app, Menu, Tray } from "electron";
import path from "path";

import { showMainWindow } from "./window";

export const createTray = (): void => {
  const tray = new Tray(path.join(__dirname, "../main/assets/Icon-Template.png"));
  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show App",
      click: function() {
        showMainWindow();
      },
    },
    {
      label: "Quit",
      click: function() {
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(contextMenu);

  tray.on("click", () => {
    app.show();
  });
};
