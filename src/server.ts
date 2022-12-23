import { Server } from "rpc-websockets";

export function runServer() {
  const server = new Server({
    port: 6667,
    host: "localhost",
  });

  return server;
}
