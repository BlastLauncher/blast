import React from "react";
import { render } from "../render";
import type { Server } from "rpc-websockets";
import { App } from "./App";

export function run(Command: React.FC, { server }: { server: Server }) {
  render(React.createElement(App, { server, Command }));
}
