import Command from "../../../../examples/todo-list/src/index";
import { run } from "../renderer/run";
import { runServer } from "../server";
import { connect } from "../utils/connectDevtools";

connect();

run(Command, {
  server: runServer(),
});
