import { connect } from "../preloadDevtool";
import { run } from "./run";
import Command from "../../examples/todo-list/src/index";
import { runServer } from "../server";

connect();

run(Command, {
  server: runServer(),
});
