import "./utils/window";

import { runServer } from "@blastlauncher/renderer";

import { App } from "./App";
import { connect } from "./utils/connectDevtools";
import { run as runApp } from "./utils/run";

export function run () {
  connect();

  runApp(App, {
    server: runServer(),
  });
}

export default run
