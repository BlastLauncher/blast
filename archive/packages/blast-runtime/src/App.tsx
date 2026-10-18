import { NavigationProvider, WsServerProvider } from "@blastlauncher/api";
import type { Server } from "rpc-websockets";

import { CommandList } from "./components/CommandList";

export type AppProps = {
  server: Server;
};

export const App = ({ server }: AppProps) => {
  return (
    <WsServerProvider server={server}>
      <NavigationProvider>
        <CommandList />
      </NavigationProvider>
    </WsServerProvider>
  );
};
