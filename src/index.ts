export * from "./render";
export * from "./reconciler";

import "./preloadDevtool";

import React from "react";
import { render } from "./render";
import Command from "../examples/todo-list/src/index";

const rootElement = render(React.createElement(Command));

console.log("inspected generate tree");
console.log(JSON.stringify(rootElement.serialize(), null, 2));
