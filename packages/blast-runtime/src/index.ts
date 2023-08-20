import "./utils/window";

import { runServer } from "@blastlauncher/renderer/src";
import { createDebug } from '@blastlauncher/utils/src'

import { App } from "./App";
import { connect } from "./utils/connectDevtools";
import { run as runApp } from "./utils/run";

const debug = createDebug("blast-runtime:run")

export function run({ host = "localhost", port = 8763 } = {}) {
  console.info("Starting Blast Runtime");
  debug("run");

  connect();

  runApp(App, {
    server: runServer({
      host,
      port,
    }),
  });
}

export default run;
