import "./utils/window";

import { runServer } from "@blastlauncher/renderer";

import { App } from "./App";
import { connect } from "./utils/connectDevtools";
import { run as runApp } from "./utils/run";

export function run({ host = "localhost", port = 8763 }) {
  connect();

  runApp(App, {
    server: runServer({
      host,
      port,
    }),
  });
}

export default run;
