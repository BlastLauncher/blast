import { Server } from "rpc-websockets";

export function runServer() {
  // instantiate Server and start listening for requests
  const server = new Server({
    port: 6667,
    host: "localhost",
  });

  // register an RPC method
  server.register("sum", function (params) {
    return params[0] + params[1];
  });

  // ...and maybe a protected one also
  server
    .register("account", function () {
      return ["confi1", "confi2"];
    })
    .protected();

  // create an event
  server.event("feedUpdated");

  // get events
  console.log(server.eventList());

  // emit an event to subscribers
  server.emit("feedUpdated");

  server.setAuth((params) => {
    return true;
  });

  return server;
}
