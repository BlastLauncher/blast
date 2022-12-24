import assert from "assert";

import { Client } from "rpc-websockets";

const ws = new Client("ws://localhost:6667");

ws.on("open", function () {
  ws.on("event", function (params) {
    console.log("event", params);
  });

  // call an RPC method with parameters
  ws.call("sum", [5, 3]).then(function (result) {
    assert.equal(result, 8);
  });

  // send a notification to an RPC server
  ws.notify("openedNewsModule");

  // subscribe to receive an event
  ws.subscribe("feedUpdated");

  ws.on("feedUpdated", function () {
    console.log("feedUpdated");
  });

  // unsubscribe from an event
  ws.unsubscribe("feedUpdated");

  // login your client to be able to use protected methods
  ws.login({ username: "confi1", password: "foobar" })
    .then(function () {
      ws.call("account").then(function (result) {
        console.log(result);
      });
    })
    .catch(function (error) {
      console.error(error);
      console.log("auth failed");
    });
});
