import React from "react";
import { createRoot } from "react-dom/client";

import { App } from "./renderer/App";
import { setupWS } from "./renderer/setupWS";
import { remoteBlastTree } from "./renderer/store";
import { BlastComponent } from "./renderer/types";
import "./renderer/styles/index.css";
import "./renderer/styles/global.scss";
import "highlight.js/styles/github-dark.css";

async function start() {
  const container = document.getElementById("app");
  if (!container) {
    return;
  }

  const root = createRoot(container);

  setupWS(async (ws) => {
    const initialTree = (await ws.call("getTree")) as BlastComponent;

    const state = remoteBlastTree.getState();
    state.setTree(initialTree);
    state.setWs(ws);

    ws.subscribe("updateTree");
    ws.on("updateTree", (data) => {
      console.log("updateTree", data);
      state.setTree(data);
    });
  });

  root.render(React.createElement(App));
}

start();
