import Command from "../../examples/todo-list/src/index";
import { connect } from "../preloadDevtool";
import { runServer } from "../server";

import { run } from "./run";

connect();

run(Command, {
  server: runServer(),
});
