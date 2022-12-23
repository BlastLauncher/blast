import React from "react";
import { render } from "../render";
import Command from "../../examples/todo-list/src/index";

export function run() {
  render(React.createElement(Command));
}
