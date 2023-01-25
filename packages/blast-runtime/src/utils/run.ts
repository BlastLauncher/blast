import { render } from "@blastlauncher/renderer";
import React, { Attributes } from "react";
import type { Server } from "rpc-websockets";

export function run(App: (...args: any) => JSX.Element, props: { server: Server }) {
  render(React.createElement(App, props as Attributes), props.server);
}
