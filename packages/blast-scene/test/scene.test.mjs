import assert from "node:assert/strict";
import test from "node:test";

import {
  SCENE_EVENT_MESSAGE,
  SCENE_TRANSACTION_MESSAGE,
  SceneStateBuffer,
  createCollectingSceneSink,
  validateSceneEventMessage,
  validateSceneEventPayload,
  validateSceneTransactionMessage,
  validateSceneTransactionPayload,
  validateToastPayload,
} from "../dist/index.js";

const PROTOCOL_VERSION = 1;

function envelope(type, payload, id = "message-1") {
  return { protocolVersion: PROTOCOL_VERSION, id, type, payload };
}

function listItem(id, title, actions = []) {
  return { id, type: "list-item", props: { title }, children: actions };
}

function action(id, title, eventId = `event-${id}`) {
  return { id, type: "action", props: { title, onAction: eventId }, children: [] };
}

function list(id, children = [], props = {}) {
  return { id, type: "list", props, children };
}

function form(id, children = [], props = {}) {
  return { id, type: "form", props, children };
}

function transaction(operations, transactionId = "transaction-1") {
  return { transactionId, operations };
}

test("validates scene transaction messages", (context) => {
  context.test("accepts a well-formed transaction", () => {
    const message = envelope(
      SCENE_TRANSACTION_MESSAGE,
      transaction([
        { type: "snapshot", root: list("root", [listItem("item-1", "Hello", [action("action-1", "Run")])]) },
      ]),
    );
    const result = validateSceneTransactionMessage(message);
    assert.equal(result.ok, true);
  });

  context.test("rejects non-envelope and wrong-type values", () => {
    assert.equal(validateSceneTransactionMessage({}).ok, false);
    assert.equal(validateSceneTransactionMessage(envelope("shutdown", {})).ok, false);
  });

  context.test("rejects unknown operation types", () => {
    const result = validateSceneTransactionMessage(
      envelope(SCENE_TRANSACTION_MESSAGE, transaction([{ type: "teleport", nodeId: "x" }])),
    );
    assert.deepEqual(
      result.issues?.map((issue) => issue.path),
      ["$.payload.operations[0].type"],
    );
  });

  context.test("enforces the property whitelist", () => {
    const result = validateSceneTransactionMessage(
      envelope(
        SCENE_TRANSACTION_MESSAGE,
        transaction([{ type: "snapshot", root: list("root", [], { title: "nope" }) }]),
      ),
    );
    assert.deepEqual(
      result.issues?.map((issue) => issue.path),
      ["$.payload.operations[0].root.props.title"],
    );
  });

  context.test("enforces required properties", () => {
    const result = validateSceneTransactionMessage(
      envelope(
        SCENE_TRANSACTION_MESSAGE,
        transaction([
          { type: "snapshot", root: list("root", [{ id: "item-1", type: "list-item", props: {}, children: [] }]) },
        ]),
      ),
    );
    assert.deepEqual(
      result.issues?.map((issue) => issue.path),
      ["$.payload.operations[0].root.children[0].props.title"],
    );
  });

  context.test("enforces parent-child type rules", () => {
    const result = validateSceneTransactionMessage(
      envelope(
        SCENE_TRANSACTION_MESSAGE,
        transaction([{ type: "snapshot", root: list("root", [list("nested-list")]) }]),
      ),
    );
    assert.deepEqual(
      result.issues?.map((issue) => issue.path),
      ["$.payload.operations[0].root.children[0].type"],
    );
  });

  context.test("rejects non-primitive property values", () => {
    const result = validateSceneTransactionMessage(
      envelope(
        SCENE_TRANSACTION_MESSAGE,
        transaction([{ type: "snapshot", root: list("root", [], { isLoading: { nested: true } }) }]),
      ),
    );
    assert.deepEqual(
      result.issues?.map((issue) => issue.path),
      ["$.payload.operations[0].root.props.isLoading"],
    );
  });

  context.test("accepts structured action shortcuts", () => {
    const result = validateSceneTransactionMessage(
      envelope(
        SCENE_TRANSACTION_MESSAGE,
        transaction([
          {
            type: "snapshot",
            root: list("root", [
              listItem("item-1", "Item", [
                {
                  id: "action-1",
                  type: "action",
                  props: {
                    title: "Run",
                    onAction: "event-action",
                    shortcut: { modifiers: ["cmd", "shift"], key: "r" },
                  },
                  children: [],
                },
              ]),
            ]),
          },
        ]),
      ),
    );
    assert.equal(result.ok, true);
  });

  context.test("accepts measured form nodes", () => {
    const result = validateSceneTransactionMessage(
      envelope(
        SCENE_TRANSACTION_MESSAGE,
        transaction([
          {
            type: "snapshot",
            root: form("form-root", [
              {
                id: "name",
                type: "form-text-field",
                props: { id: "name", title: "Name", defaultValue: "Ada", onChange: "event-name" },
                children: [],
              },
              {
                id: "due",
                type: "form-date-picker",
                props: {
                  id: "due",
                  title: "Due",
                  type: "date",
                  min: "2026-08-01T00:00:00.000Z",
                  max: "2026-09-30T00:00:00.000Z",
                  defaultValue: "2026-08-28T00:00:00.000Z",
                  onChange: "event-due",
                },
                children: [],
              },
              {
                id: "tags",
                type: "form-tag-picker",
                props: { id: "tags", title: "Tags", defaultValue: ["v2"], onChange: "event-tags" },
                children: [
                  {
                    id: "tag-v2",
                    type: "form-tag-picker-item",
                    props: { value: "v2", title: "V2" },
                    children: [],
                  },
                ],
              },
              {
                id: "files",
                type: "form-file-picker",
                props: {
                  id: "files",
                  title: "Files",
                  defaultValue: [],
                  canChooseFiles: true,
                  canChooseDirectories: false,
                  onChange: "event-files",
                },
                children: [],
              },
              {
                id: "actions",
                type: "action-group",
                props: {},
                children: [action("submit", "Save", "event-submit")],
              },
            ]),
          },
        ]),
      ),
    );
    assert.equal(result.ok, true);
  });
});

test("validates scene event messages", (context) => {
  context.test("accepts an event identifier", () => {
    const result = validateSceneEventMessage(envelope(SCENE_EVENT_MESSAGE, { eventId: "event-1" }));
    assert.equal(result.ok, true);
  });

  context.test("accepts form values", () => {
    const result = validateSceneEventMessage(
      envelope(SCENE_EVENT_MESSAGE, {
        eventId: "event-submit",
        values: { name: "Ada", enabled: true, due: "2026-08-28T00:00:00.000Z", tags: ["v2"], files: [] },
      }),
    );
    assert.equal(result.ok, true);
  });

  context.test("rejects missing event identifiers", () => {
    const result = validateSceneEventMessage(envelope(SCENE_EVENT_MESSAGE, {}));
    assert.deepEqual(
      result.issues?.map((issue) => issue.path),
      ["$.payload.eventId"],
    );
  });
});

test("validates scene event payloads", (context) => {
  context.test("accepts an event identifier", () => {
    assert.equal(validateSceneEventPayload({ eventId: "event-1" }).ok, true);
  });

  context.test("rejects missing event identifiers", () => {
    const result = validateSceneEventPayload({});
    assert.deepEqual(
      result.issues?.map((issue) => issue.path),
      ["$.eventId"],
    );
  });

  context.test("rejects non-object payloads", () => {
    assert.equal(validateSceneEventPayload("event-1").ok, false);
  });

  context.test("rejects non-JSON form values", () => {
    const result = validateSceneEventPayload({ eventId: "event-submit", values: { name: [42] } });
    assert.deepEqual(
      result.issues?.map((issue) => issue.path),
      ["$.values.name"],
    );
  });
});

test("validates toast lifecycle payloads", (context) => {
  context.test("accepts legacy and identified display payloads", () => {
    assert.equal(validateToastPayload({ title: "Saved", style: "success" }).ok, true);
    assert.equal(
      validateToastPayload({
        toastId: "toast-1",
        operation: "update",
        title: "Uploading",
        style: "animated",
        primaryAction: {
          title: "Cancel",
          eventId: "toast-event-1",
          shortcut: { modifiers: ["cmd"], key: "w" },
        },
      }).ok,
      true,
    );
  });

  context.test("accepts hide payloads", () => {
    assert.equal(validateToastPayload({ toastId: "toast-1", operation: "hide" }).ok, true);
  });

  context.test("requires identity for update and hide", () => {
    assert.equal(validateToastPayload({ operation: "update", title: "Uploading" }).ok, false);
    assert.equal(validateToastPayload({ operation: "hide" }).ok, false);
    assert.equal(validateToastPayload({ operation: null, title: "Saved" }).ok, false);
  });
});

test("validates scene transaction payloads", (context) => {
  context.test("accepts a well-formed transaction", () => {
    const result = validateSceneTransactionPayload(transaction([{ type: "snapshot", root: list("root") }]));
    assert.equal(result.ok, true);
  });

  context.test("rejects missing transaction identifiers", () => {
    const result = validateSceneTransactionPayload({ operations: [] });
    assert.deepEqual(
      result.issues?.map((issue) => issue.path),
      ["$.transactionId"],
    );
  });

  context.test("rejects invalid operations", () => {
    const result = validateSceneTransactionPayload(transaction([{ type: "teleport" }]));
    assert.deepEqual(
      result.issues?.map((issue) => issue.path),
      ["$.operations[0].type"],
    );
  });
});

test("the state buffer materializes snapshots and updates", () => {
  const buffer = new SceneStateBuffer();
  assert.equal(buffer.toJSON(), undefined);

  buffer.apply(
    transaction([
      { type: "snapshot", root: list("root", [listItem("item-1", "Hello")], { navigationTitle: "Tasks" }) },
    ]),
  );
  assert.equal(buffer.rootId, "root");
  assert.equal(buffer.nodeCount, 2);

  buffer.apply(
    transaction([{ type: "insert", node: listItem("item-2", "Second"), parentId: "root" }], "transaction-2"),
  );
  buffer.apply(
    transaction([{ type: "update", nodeId: "item-2", props: { title: "Renamed", subtitle: "New" } }], "transaction-3"),
  );
  buffer.apply(
    transaction([{ type: "insert", node: listItem("item-0", "First"), parentId: "root", index: 0 }], "transaction-4"),
  );
  buffer.apply(
    transaction([{ type: "reorder", parentId: "root", order: ["item-1", "item-0", "item-2"] }], "transaction-5"),
  );

  assert.deepEqual(buffer.toJSON(), {
    id: "root",
    type: "list",
    props: { navigationTitle: "Tasks" },
    children: [
      { id: "item-1", type: "list-item", props: { title: "Hello" }, children: [] },
      { id: "item-0", type: "list-item", props: { title: "First" }, children: [] },
      { id: "item-2", type: "list-item", props: { title: "Renamed", subtitle: "New" }, children: [] },
    ],
  });

  buffer.apply(transaction([{ type: "update", nodeId: "item-2", props: { subtitle: null } }], "transaction-6"));
  assert.deepEqual(buffer.get("item-2").props, { title: "Renamed" });

  buffer.apply(transaction([{ type: "remove", nodeId: "item-0" }], "transaction-7"));
  assert.equal(buffer.has("item-0"), false);
  assert.deepEqual(
    buffer.childrenOf("root").map((node) => node.id),
    ["item-1", "item-2"],
  );
});

test("the state buffer accepts a form root", () => {
  const buffer = new SceneStateBuffer();
  buffer.apply(
    transaction([
      {
        type: "snapshot",
        root: form("form-root", [
          {
            id: "name",
            type: "form-text-field",
            props: { id: "name", onChange: "event-name" },
            children: [],
          },
        ]),
      },
    ]),
  );

  assert.equal(buffer.rootId, "form-root");
  assert.equal(buffer.get(buffer.rootId).type, "form");
  assert.equal(buffer.childrenOf("form-root")[0].props.id, "name");
});

test("the state buffer rejects invalid operations", (context) => {
  function bufferWithRoot() {
    const buffer = new SceneStateBuffer();
    buffer.apply(
      transaction([
        { type: "snapshot", root: list("root", [listItem("item-1", "Hello", [action("action-1", "Run")])]) },
      ]),
    );
    return buffer;
  }

  context.test("snapshot with a non-list root", () => {
    const buffer = new SceneStateBuffer();
    assert.throws(
      () => buffer.apply(transaction([{ type: "snapshot", root: action("root", "Run") }])),
      (error) => error.code === "invalid_root",
    );
  });

  context.test("insert into an unknown parent", () => {
    const buffer = new SceneStateBuffer();
    assert.throws(
      () =>
        buffer.apply(transaction([{ type: "insert", node: listItem("item-1", "Hello"), parentId: "missing-root" }])),
      (error) => error.code === "unknown_parent",
    );
  });

  context.test("duplicate node identifier", () => {
    const buffer = bufferWithRoot();
    assert.throws(
      () => buffer.apply(transaction([{ type: "insert", node: listItem("item-1", "Again"), parentId: "root" }])),
      (error) => error.code === "duplicate_node",
    );
  });

  context.test("invalid child placement", () => {
    const buffer = bufferWithRoot();
    assert.throws(
      () => buffer.apply(transaction([{ type: "insert", node: action("action-2", "Run"), parentId: "root" }])),
      (error) => error.code === "invalid_child",
    );
  });

  context.test("out-of-bounds insert index", () => {
    const buffer = bufferWithRoot();
    assert.throws(
      () =>
        buffer.apply(transaction([{ type: "insert", node: listItem("item-2", "Second"), parentId: "root", index: 9 }])),
      (error) => error.code === "invalid_index",
    );
  });

  context.test("update of an unknown node", () => {
    const buffer = bufferWithRoot();
    assert.throws(
      () => buffer.apply(transaction([{ type: "update", nodeId: "missing", props: { title: "Nope" } }])),
      (error) => error.code === "unknown_node",
    );
  });

  context.test("update with a whitelisted but invalid value", () => {
    const buffer = bufferWithRoot();
    assert.throws(
      () => buffer.apply(transaction([{ type: "update", nodeId: "item-1", props: { title: 42 } }])),
      (error) => error.code === "invalid_prop",
    );
  });

  context.test("removal of a required property", () => {
    const buffer = bufferWithRoot();
    assert.throws(
      () => buffer.apply(transaction([{ type: "update", nodeId: "item-1", props: { title: null } }])),
      (error) => error.code === "missing_required_prop",
    );
  });

  context.test("removal of the scene root", () => {
    const buffer = bufferWithRoot();
    assert.throws(
      () => buffer.apply(transaction([{ type: "remove", nodeId: "root" }])),
      (error) => error.code === "remove_root",
    );
  });

  context.test("removal detaches descendants", () => {
    const buffer = bufferWithRoot();
    buffer.apply(transaction([{ type: "remove", nodeId: "item-1" }], "transaction-2"));
    assert.equal(buffer.has("item-1"), false);
    assert.equal(buffer.has("action-1"), false);
    assert.deepEqual(buffer.childrenOf("root"), []);
  });

  context.test("incomplete reorder", () => {
    const buffer = bufferWithRoot();
    assert.throws(
      () => buffer.apply(transaction([{ type: "reorder", parentId: "root", order: [] }])),
      (error) => error.code === "reorder_mismatch",
    );
    assert.throws(
      () => buffer.apply(transaction([{ type: "reorder", parentId: "missing-root", order: [] }])),
      (error) => error.code === "unknown_parent",
    );
  });

  context.test("invalid transactions", () => {
    const buffer = bufferWithRoot();
    assert.throws(
      () => buffer.apply(transaction([], "")),
      (error) => error.code === "invalid_transaction",
    );
    assert.throws(
      () => buffer.apply({ transactionId: "transaction-9", operations: undefined }),
      (error) => error.code === "invalid_transaction",
    );
  });
});

test("collecting sinks preserve transaction order", () => {
  const sink = createCollectingSceneSink();
  const first = transaction([{ type: "snapshot", root: list("root") }]);
  const second = transaction(
    [{ type: "insert", node: listItem("item-1", "Hello"), parentId: "root" }],
    "transaction-2",
  );

  sink.publish(first);
  sink.publish(second);

  assert.deepEqual(
    sink.transactions.map((published) => published.transactionId),
    ["transaction-1", "transaction-2"],
  );
});
