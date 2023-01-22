import { Server } from "rpc-websockets";

export function runServer() {
  const server = new Server({
    port: 8763,
    host: "localhost",
  });

  return server;
}
