import { NavigationProvider, WsServerProvider } from "@raycast/api";
import React from "react";
import type { Server } from "rpc-websockets";

export type AppProps = {
  server: Server;
};

export const App = ({ server }: AppProps) => {
  const commands = null;

  return (
    <WsServerProvider server={server}>
      <NavigationProvider>{commands}</NavigationProvider>
    </WsServerProvider>
  );
};
