import React from "react";
import type { Server } from "rpc-websockets";
import { NavigationProvider } from "../raycast/Navigation";
import { WsServerProvider } from "../raycast/internal/WsServerProvider";

export type AppProps = {
  Command: React.FC;
  server: Server;
};

export const App = ({ Command, server }: AppProps) => {
  return (
    <NavigationProvider>
      <WsServerProvider server={server}>
        <Command />
      </WsServerProvider>
    </NavigationProvider>
  );
};
