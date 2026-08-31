import assert from "node:assert/strict";
import test from "node:test";

import { CoreClientController } from "../dist/index.js";

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
