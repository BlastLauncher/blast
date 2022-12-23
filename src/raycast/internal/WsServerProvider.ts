import React from "react";
import { Server } from "rpc-websockets";

const WsContext = React.createContext<Server | null>(null);

export const WsServerProvider = ({ children, server }: { children: React.ReactNode; server: Server }) => {
  return React.createElement(WsContext.Provider, { value: server }, children);
};

export const useWsServer = () => {
  const server = React.useContext(WsContext);
  return server;
};
