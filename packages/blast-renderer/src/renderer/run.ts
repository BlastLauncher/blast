import React from "react";
import type { Server } from "rpc-websockets";

import { App } from "../examples/App";

import { render } from "./render";

export function run(Command: React.FC, { server }: { server: Server }) {
  render(React.createElement(App, { server, Command }), server);
}
