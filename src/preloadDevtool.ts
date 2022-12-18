import { connectToDevTools } from "react-devtools-core";
import { w3cwebsocket as W3CWebSocket } from "websocket";

export function connect() {
  connectToDevTools({
    websocket: new W3CWebSocket("ws://localhost:8097"),
  });
}
