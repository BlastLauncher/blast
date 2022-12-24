import React from "react";
import type { Server } from "rpc-websockets";

import { render } from "../render";

import { App } from "./App";

export function run(Command: React.FC, { server }: { server: Server }) {
  render(React.createElement(App, { server, Command }), server);
}
