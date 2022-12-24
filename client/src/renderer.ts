import React from "react";
import { createRoot } from "react-dom/client";

import { setupWS } from "./renderer/setupWS";
import { remoteBlastTree, BlastComponent } from "./renderer/store";
import { App } from "./renderer/App";
import "./index.css";

async function start() {
  const container = document.getElementById("app");
  const root = createRoot(container);

  setupWS(async (ws) => {
    const initialTree = (await ws.call("getTree")) as BlastComponent;

    const state = remoteBlastTree.getState();
    state.setTree(initialTree);

    ws.subscribe("updateTree");
    ws.on("updateTree", (data) => {
      console.log("updateTree", data);
      state.setTree(data);
    });
  });

  root.render(React.createElement(App));
}

start();
