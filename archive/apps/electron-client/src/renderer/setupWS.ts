import { Client } from "rpc-websockets";

export function setupWS(onOpened: (ws: Client) => void) {
  const ws = new Client("ws://localhost:8763", {
    reconnect: true,
  });

  ws.on("open", function () {
    onOpened(ws);
  });
}
