import React from "react";
import { createRoot } from "react-dom/client";
import './styles.scss'

import App from "./App";

function start() {
  const container = document.getElementById("app");
  if (!container) {
    return;
  }

  const root = createRoot(container);

  root.render(React.createElement(App));
}

start();
