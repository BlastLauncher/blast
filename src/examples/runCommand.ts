import React from "react";
import { render } from "../render";
import Command from "../../examples/todo-list/src/index";
import { NavigationProvider } from "../raycast/Navigation";

export function run() {
  render(React.createElement(NavigationProvider, null, React.createElement(Command, null)));
}
