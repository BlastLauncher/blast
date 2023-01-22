import { createElement, createContext, useContext } from "react";
import type { Server } from "rpc-websockets";

export const WsContext = createContext<Server | null>(null);

export const WsServerProvider = ({ children, server }: { children: React.ReactNode; server: Server }) => {
  return createElement(WsContext.Provider, { value: server }, children);
};

export const useWsServer = () => {
  const server = useContext(WsContext);
  return server;
};
