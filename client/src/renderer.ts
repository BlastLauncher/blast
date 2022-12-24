import "./index.css";
import { Client } from "rpc-websockets";

const ws = new Client("ws://localhost:8763");

ws.on("open", function () {
  ws.on("updateTree", (data) => {
    console.log("updateTree", data);
  });

  ws.call("getTree").then((data) => {
    console.log("getTree", data);
  });
});
