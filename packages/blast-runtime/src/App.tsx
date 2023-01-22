import { List } from "@raycast/api";

import { NavigationProvider, WsServerProvider } from "@blast/api";
import type { Server } from "rpc-websockets";

export type AppProps = {
  server: Server;
};

export const App = ({ server }: AppProps) => {
  return (
    <WsServerProvider server={server}>
      <NavigationProvider>
        <List isLoading={false} searchBarPlaceholder="Search...">
          <List.Item title="Test item" />
        </List>
      </NavigationProvider>
    </WsServerProvider>
  );
};
