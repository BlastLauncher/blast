import { NavigationProvider, WsServerProvider } from "blast-api";
import React from "react";
import type { Server } from "rpc-websockets";

export type AppProps = {
  Command: React.FC;
  server: Server;
};

export const App = ({ Command, server }: AppProps) => {
  return (
    <WsServerProvider server={server}>
      <NavigationProvider>
        <Command />
      </NavigationProvider>
    </WsServerProvider>
  );
};
