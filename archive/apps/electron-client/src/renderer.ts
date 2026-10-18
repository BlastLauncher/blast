import React from "react";
import { createRoot } from "react-dom/client";

import { App } from "./renderer/App";
import { setupWS } from "./renderer/setupWS";
import { remoteBlastTree } from "./renderer/store";
import type { BlastComponent } from "./renderer/types";
import "./renderer/styles/index.css";
import "./renderer/styles/global.scss";
import "highlight.js/styles/github-dark.css";

async function start() {
  const container = document.getElementById("app");
  if (!container) {
    return;
  }

  const root = createRoot(container);

  let v2Enabled = false;
  try {
    v2Enabled = (await window.electron.v2?.isEnabled()) ?? false;
  } catch {
    // A missing or unavailable V2 bridge falls back to the legacy runtime.
  }

  if (!v2Enabled) {
    setupWS(async (ws) => {
      const initialTree = (await ws.call("getTree")) as BlastComponent;
      console.log("initialTree", initialTree);

      const state = remoteBlastTree.getState();
      state.setTree(initialTree);
      state.setWs(ws);

      ws.subscribe("updateTree");
      ws.on("updateTree", (data) => {
        console.log("updateTree", data);
        state.setTree(data);
      });
    });
  }

  root.render(React.createElement(App, { v2Enabled }));
}

start();
