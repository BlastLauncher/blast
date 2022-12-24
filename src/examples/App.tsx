import React from "react";
import type { Server } from "rpc-websockets";

import { WsServerProvider } from "../raycast/internal/WsServerProvider";
import { NavigationProvider } from "../raycast/Navigation";

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
