import { Server } from "rpc-websockets";

export function runServer({
  port = 8763,
  host = "localhost",
}) {
  const server = new Server({
    port,
    host
  });

  return server;
} 

