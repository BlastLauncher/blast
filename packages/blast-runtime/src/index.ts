import "./utils/window";

import { runServer } from "@blastlauncher/renderer";

import { App } from "./App";
import { connect } from "./utils/connectDevtools";
import { run } from "./utils/run";

connect();

run(App, {
  server: runServer(),
});
