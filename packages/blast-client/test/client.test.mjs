import assert from "node:assert/strict";
import test from "node:test";

import { CoreClientController, CoreClientHost, serializeCoreClientSnapshot } from "../dist/index.js";

const identity = { extensionId: "example.extension", commandName: "index" };

function message(type, payload, id = type) {
  return { protocolVersion: 1, id, type, payload };
}

function createSceneTransaction(title = "Hello") {
  return {
    transactionId: `transaction-${title}`,
    operations: [
      {
        type: "snapshot",
        root: {
          id: "root",
          type: "list",
          props: {},
          children: [
            {
              id: "item-1",
              type: "list-item",
              props: { title },
              children: [
                {
                  id: "action-1",
                  type: "action",
                  props: { title: "Run", onAction: "event-1" },
                  children: [],
                },
              ],
            },
          ],
        },
      },
    ],
  };
}

async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
}

class FakeCoreClient {
  requests = [];
  sentEvents = [];
  stopped = [];
  #messages = [];
  #waiters = [];
  #closed = false;

  async requestCommandList() {
    this.requests.push("list");
  }

  async runCommand(value) {
    this.requests.push(["run", value]);
  }

  async stopCommand(value, reason) {
    this.stopped.push(reason === undefined ? value : { ...value, reason });
  }

  async sendSceneEvent(eventId, values) {
    this.sentEvents.push(values === undefined ? { eventId } : { eventId, values });
  }

  async receive() {
    const next = this.#messages.shift();
    if (next !== undefined) {
      return next;
    }
    if (this.#closed) {
      return undefined;
    }
    return new Promise((resolve) => this.#waiters.push(resolve));
  }

  async close() {
    this.#closed = true;
    for (const resolve of this.#waiters.splice(0)) {
      resolve(undefined);
    }
  }

  push(value) {
    const resolve = this.#waiters.shift();
    if (resolve) {
      resolve(value);
    } else {
      this.#messages.push(value);
    }
  }

  get closed() {
    return this.#closed;
  }
}

async function startController(client, command = identity) {
  const controller = new CoreClientController({ client });
  const starting = controller.start();
  await flush();
  client.push(
    message("core.command.listed", {
      commands: [
        {
          ...command,
          title: "Example",
          extensionName: "Example Extension",
          entryPointMode: "view",
        },
      ],
    }),
  );
  await starting;
  return controller;
}

test("consumes discovery, lifecycle, scenes, events, and toasts through one pump", async () => {
  const client = new FakeCoreClient();
  const toasts = [];
  const controller = new CoreClientController({ client, onToast: (toast) => toasts.push(toast) });
  const snapshots = [];
  const unsubscribe = controller.subscribe((snapshot) => snapshots.push(snapshot));

  const starting = controller.start();
  await flush();
  assert.deepEqual(client.requests, ["list"]);
  client.push(
    message("core.command.listed", {
      commands: [
        {
          ...identity,
          title: "Example",
          extensionName: "Example Extension",
          entryPointMode: "view",
        },
      ],
    }),
  );
  await starting;
  assert.equal(controller.state, "ready");
  assert.equal(controller.snapshot.commands[0].title, "Example");

  await controller.runCommand(identity);
  assert.equal(controller.state, "starting");
  client.push(message("core.command.started", identity));
  await flush();
  assert.equal(controller.state, "running");

  client.push(message("scene.transaction", createSceneTransaction()));
  await flush();
  assert.equal(controller.snapshot.scene.children[0].props.title, "Hello");
  await controller.sendSceneEvent("event-1", { enabled: true });
  assert.deepEqual(client.sentEvents, [{ eventId: "event-1", values: { enabled: true } }]);

  client.push(message("ui.toast", { title: "Saved", style: "success" }));
  await flush();
  assert.deepEqual(toasts, [{ title: "Saved", style: "success" }]);

  await controller.stopCommand("user closed command");
  assert.equal(controller.state, "stopping");
  assert.deepEqual(client.stopped, [{ ...identity, reason: "user closed command" }]);
  client.push(message("core.command.stopped", { ...identity, reason: "user closed command" }));
  await flush();
  assert.equal(controller.state, "ready");
  assert.equal(controller.snapshot.activeCommand, undefined);
  assert.equal(controller.snapshot.scene, undefined);
  assert.ok(snapshots.some((snapshot) => snapshot.state === "running"));

  unsubscribe();
  await controller.close("test complete");
  assert.equal(controller.state, "closed");
  assert.equal(client.closed, true);
});

test("keeps a structured discovery failure recoverable", async () => {
  const client = new FakeCoreClient();
  const controller = new CoreClientController({ client });
  const starting = controller.start();
  await flush();
  client.push(
    message("core.command.list-failed", {
      code: "catalog_root_unreadable",
      message: "Extension catalog root is not readable",
    }),
  );

  await assert.rejects(starting, (error) => error.code === "catalog_root_unreadable");
  assert.equal(controller.state, "failed");
  assert.equal(client.closed, false);

  const refreshing = controller.refreshCommands();
  await flush();
  client.push(message("core.command.listed", { commands: [] }));
  await refreshing;
  assert.equal(controller.state, "ready");
  assert.deepEqual(controller.snapshot.commands, []);
  await controller.close();
});

test("closes the client when scene referential integrity fails", async () => {
  const client = new FakeCoreClient();
  const controller = await startController(client);
  await controller.runCommand(identity);
  client.push(message("core.command.started", identity));
  await flush();

  client.push(
    message("scene.transaction", {
      transactionId: "invalid-scene",
      operations: [{ type: "update", nodeId: "missing", props: { title: "broken" } }],
    }),
  );
  await controller.done;

  assert.equal(controller.state, "failed");
  assert.equal(controller.snapshot.activeCommand, undefined);
  assert.equal(controller.snapshot.scene, undefined);
  assert.equal(controller.snapshot.error.code, "unknown_node");
  assert.equal(client.closed, true);
  await controller.close();
});

test("rejects command actions until the consumer is ready", async () => {
  const client = new FakeCoreClient();
  const controller = new CoreClientController({ client });

  await assert.rejects(
    () => controller.runCommand(identity),
    (error) => error.code === "controller_not_started",
  );
  await assert.rejects(
    () => controller.sendSceneEvent("event-1"),
    (error) => error.code === "controller_not_started",
  );
  await controller.close();
});

test("the client host shares lazy startup and publishes controller snapshots", async () => {
  const client = new FakeCoreClient();
  let connectionCount = 0;
  const host = new CoreClientHost({
    connect: async () => {
      connectionCount += 1;
      return client;
    },
  });
  const snapshots = [];
  const unsubscribe = host.subscribe((snapshot) => snapshots.push(snapshot));

  const firstStart = host.start();
  const secondStart = host.start();
  assert.strictEqual(firstStart, secondStart);
  await flush();
  assert.equal(connectionCount, 1);
  client.push(
    message("core.command.listed", {
      commands: [{ ...identity, title: "Example", extensionName: "Example Extension", entryPointMode: "view" }],
    }),
  );
  const ready = await firstStart;
  assert.equal(ready.state, "ready");
  assert.equal(host.snapshot.state, "ready");

  await host.runCommand(identity);
  client.push(message("core.command.started", identity));
  await flush();
  assert.equal(host.snapshot.state, "running");
  assert.ok(snapshots.some((snapshot) => snapshot.state === "running"));

  await host.stopCommand("host test complete");
  client.push(message("core.command.stopped", { ...identity, reason: "host test complete" }));
  await flush();
  assert.equal(host.snapshot.state, "ready");

  unsubscribe();
  await host.close("host test complete");
  assert.equal(client.closed, true);
  assert.equal(host.snapshot.state, "closed");
});

test("the client host can retry after a transient connection failure", async () => {
  const client = new FakeCoreClient();
  let connectionCount = 0;
  const host = new CoreClientHost({
    connect: async () => {
      connectionCount += 1;
      if (connectionCount === 1) {
        throw new Error("core is still starting");
      }
      return client;
    },
  });

  await assert.rejects(() => host.start(), /core is still starting/);
  assert.equal(host.snapshot, undefined);

  const retry = host.start();
  await flush();
  client.push(
    message("core.command.listed", {
      commands: [{ ...identity, title: "Example", extensionName: "Example Extension", entryPointMode: "view" }],
    }),
  );
  const ready = await retry;

  assert.equal(connectionCount, 2);
  assert.equal(ready.state, "ready");
  await host.close("retry test complete");
});

test("the client host reconnects after a structured discovery failure", async () => {
  const first = new FakeCoreClient();
  const second = new FakeCoreClient();
  const clients = [first, second];
  let connectionCount = 0;
  const host = new CoreClientHost({
    connect: async () => clients[connectionCount++],
  });

  const failing = host.start();
  await flush();
  first.push(
    message("core.command.list-failed", {
      code: "catalog_root_unreadable",
      message: "Extension catalog root is not readable",
    }),
  );
  await assert.rejects(failing, (error) => error.code === "catalog_root_unreadable");
  assert.equal(host.snapshot.state, "failed");
  assert.equal(first.closed, false);

  const retry = host.start();
  await flush();
  second.push(message("core.command.listed", { commands: [] }));
  const ready = await retry;
  assert.equal(connectionCount, 2);
  assert.equal(ready.state, "ready");
  assert.equal(host.snapshot.state, "ready");
  assert.equal(first.closed, true);
  await host.close("reconnect test complete");
});

test("the client host reconnects after the controller closes cleanly", async () => {
  const first = new FakeCoreClient();
  const second = new FakeCoreClient();
  const clients = [first, second];
  let connectionCount = 0;
  const host = new CoreClientHost({
    connect: async () => clients[connectionCount++],
  });

  const starting = host.start();
  await flush();
  first.push(message("core.command.listed", { commands: [] }));
  await starting;
  assert.equal(host.snapshot.state, "ready");

  await first.close();
  for (let attempt = 0; attempt < 50 && host.snapshot?.state !== "closed"; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(host.snapshot.state, "closed");
  await assert.rejects(
    () => host.runCommand(identity),
    (error) => error.name === "CoreClientControllerError" && error.code === "controller_closed",
  );

  const retry = host.start();
  await flush();
  second.push(message("core.command.listed", { commands: [] }));
  const ready = await retry;
  assert.equal(connectionCount, 2);
  assert.equal(ready.state, "ready");

  await host.runCommand(identity);
  assert.equal(host.snapshot.state, "starting");
  await host.close("reconnect test complete");
});

test("the client host keeps rejecting start while a controller is active", async () => {
  const client = new FakeCoreClient();
  const host = new CoreClientHost({ connect: async () => client });
  const starting = host.start();
  await flush();
  client.push(message("core.command.listed", { commands: [] }));
  await starting;
  await assert.rejects(
    () => host.start(),
    (error) => error.code === "host_already_started",
  );
  await host.close("active guard test complete");
});

test("the client host rejects commands before startup and after shutdown", async () => {
  const client = new FakeCoreClient();
  const host = new CoreClientHost({ connect: async () => client });

  await assert.rejects(
    () => host.runCommand(identity),
    (error) => error.code === "host_not_started",
  );
  await host.close();
  await assert.rejects(
    () => host.start(),
    (error) => error.code === "host_closed",
  );
});

test("serializes snapshots with JSON-safe failure details", () => {
  const details = { nested: { count: 3n }, callback: () => {}, error: new Error("transport failed") };
  details.nested.self = details;
  const serialized = serializeCoreClientSnapshot({
    state: "failed",
    commands: [],
    error: { code: "transport_failed", message: "The connection failed", details },
  });

  assert.deepEqual(serialized.error, {
    code: "transport_failed",
    message: "The connection failed",
    details: {
      nested: { count: "3", self: "[Circular]" },
      error: { name: "Error", message: "transport failed" },
    },
  });
  assert.doesNotThrow(() => JSON.stringify(serialized));
});
