import assert from "node:assert/strict";
import test from "node:test";
import { Children, createElement, useEffect } from "react";

import {
  SCENE_DETAIL_TYPE,
  SCENE_FORM_TEXT_FIELD_TYPE,
  SCENE_FORM_TYPE,
  SceneAction,
  SceneList,
  SceneListItem,
  SceneRendererError,
  createSceneRenderer,
} from "../dist/index.js";

const stableCalls = [];
function stableCallback() {
  stableCalls.push("clicked");
}

function EffectsComponent() {
  useEffect(() => {
    effects.push("mounted");
  }, []);
  return createElement(SceneList, null);
}

const effects = [];

function ThrowingApp() {
  throw new Error("boom");
}

function createCollectingSink() {
  const transactions = [];
  return {
    transactions,
    publish(transaction) {
      transactions.push(transaction);
    },
  };
}

function snapshotRoot(sink) {
  assert.equal(sink.transactions.length >= 1, true);
  const operation = sink.transactions[0].operations[0];
  assert.equal(operation.type, "snapshot");
  return operation.root;
}

function listWith(items) {
  return createElement(
    SceneList,
    null,
    items.map((item) =>
      createElement(
        SceneListItem,
        { key: item.key ?? item.title, title: item.title, subtitle: item.subtitle },
        item.action === undefined ? null : createElement(SceneAction, { title: "Run", onAction: item.action }),
      ),
    ),
  );
}

test("publishes one snapshot transaction on first render", async () => {
  const sink = createCollectingSink();
  const renderer = createSceneRenderer({ sink });

  renderer.render(listWith([{ title: "First", action: () => {} }, { title: "Second" }]));
  await renderer.flush();

  assert.equal(sink.transactions.length, 1);
  const root = snapshotRoot(sink);
  assert.equal(root.type, "list");
  assert.deepEqual(root.props, {});
  assert.equal(root.children.length, 2);
  const [first, second] = root.children;
  assert.deepEqual(first.props, { title: "First" });
  assert.deepEqual(first.children[0].props, { title: "Run", onAction: "event-1" });
  assert.deepEqual(second.props, { title: "Second" });
  const ids = new Set([root.id, first.id, second.id, first.children[0].id]);
  assert.equal(ids.size, 4);
});

test("emits update operations with stable node identifiers", async () => {
  const sink = createCollectingSink();
  const renderer = createSceneRenderer({ sink });

  renderer.render(listWith([{ key: "task", title: "First" }]));
  await renderer.flush();
  const listId = snapshotRoot(sink).id;
  const itemId = snapshotRoot(sink).children[0].id;

  renderer.render(listWith([{ key: "task", title: "Renamed" }]));
  await renderer.flush();

  assert.equal(sink.transactions.length, 2);
  assert.deepEqual(sink.transactions[1].operations, [{ type: "update", nodeId: itemId, props: { title: "Renamed" } }]);
  assert.notEqual(listId, itemId);
});

test("emits insert operations for appended and positioned children", async () => {
  const sink = createCollectingSink();
  const renderer = createSceneRenderer({ sink });

  renderer.render(listWith([{ title: "A" }]));
  await renderer.flush();
  const listId = snapshotRoot(sink).id;

  renderer.render(listWith([{ title: "A" }, { title: "B" }]));
  await renderer.flush();
  renderer.render(listWith([{ title: "Z" }, { title: "A" }, { title: "B" }]));
  await renderer.flush();

  const appended = sink.transactions[1].operations[0];
  assert.equal(appended.type, "insert");
  assert.equal(appended.parentId, listId);
  assert.equal(appended.node.props.title, "B");
  assert.equal(appended.index, undefined);

  const positioned = sink.transactions[2].operations[0];
  assert.equal(positioned.type, "insert");
  assert.equal(positioned.parentId, listId);
  assert.equal(positioned.index, 0);
  assert.equal(positioned.node.props.title, "Z");
});

test("emits remove operations and releases their event identifiers", async () => {
  const sink = createCollectingSink();
  const renderer = createSceneRenderer({ sink });

  renderer.render(
    listWith([
      { title: "A", action: () => "a" },
      { title: "B", action: () => "b" },
    ]),
  );
  await renderer.flush();
  const root = snapshotRoot(sink);
  const removedItem = root.children[0];
  const removedEventId = removedItem.children[0].props.onAction;

  renderer.render(listWith([{ title: "B", action: () => "b" }]));
  await renderer.flush();

  assert.equal(sink.transactions[1].operations[0].type, "remove");
  assert.equal(sink.transactions[1].operations[0].nodeId, removedItem.id);

  assert.throws(
    () => renderer.dispatchSceneEvent({ eventId: removedEventId }),
    (error) => error.code === "unknown_event",
  );
  const updateOp = sink.transactions[1].operations.find((op) => op.type === "update");
  const survivingEventId = updateOp !== undefined ? updateOp.props.onAction : removedEventId;
  renderer.dispatchSceneEvent({ eventId: survivingEventId });
});

test("serializes removed properties as explicit null", async () => {
  const sink = createCollectingSink();
  const renderer = createSceneRenderer({ sink });

  renderer.render(listWith([{ title: "Task", subtitle: "Detail" }]));
  await renderer.flush();
  const itemId = snapshotRoot(sink).children[0].id;

  renderer.render(listWith([{ title: "Task" }]));
  await renderer.flush();

  assert.deepEqual(sink.transactions[1].operations, [{ type: "update", nodeId: itemId, props: { subtitle: null } }]);
});

test("keeps event identifiers stable when callbacks are stable", async () => {
  const sink = createCollectingSink();
  const renderer = createSceneRenderer({ sink });

  renderer.render(listWith([{ key: "item", title: "Item 0", action: stableCallback }]));
  await renderer.flush();
  const eventId = snapshotRoot(sink).children[0].children[0].props.onAction;

  renderer.render(listWith([{ key: "item", title: "Item 1", action: stableCallback }]));
  await renderer.flush();

  assert.equal(sink.transactions.length, 2);
  assert.deepEqual(sink.transactions[1].operations, [
    { type: "update", nodeId: snapshotRoot(sink).children[0].id, props: { title: "Item 1" } },
  ]);
  assert.equal(snapshotRoot(sink).children[0].children[0].props.onAction, eventId);

  renderer.dispatchSceneEvent({ eventId });
  assert.deepEqual(stableCalls, ["clicked"]);
});

test("routes scene events to registered callbacks and rejects unknown ones", async () => {
  const sink = createCollectingSink();
  const renderer = createSceneRenderer({ sink });
  const dispatchCalls = [];

  renderer.render(
    createElement(
      SceneList,
      null,
      createElement(
        SceneListItem,
        { title: "First" },
        createElement(SceneAction, { title: "Run", onAction: () => dispatchCalls.push("run") }),
      ),
    ),
  );
  await renderer.flush();
  const eventId = snapshotRoot(sink).children[0].children[0].props.onAction;

  renderer.dispatchSceneEvent({ eventId });
  assert.deepEqual(dispatchCalls, ["run"]);

  assert.throws(
    () => renderer.dispatchSceneEvent({ eventId: "missing" }),
    (error) => error.code === "unknown_event",
  );
});

test("rejects invalid scene trees", (context) => {
  context.test("non-list root", () => {
    const sink = createCollectingSink();
    const renderer = createSceneRenderer({ sink });
    assert.throws(
      () => renderer.render(createElement(SceneAction, { title: "Run" })),
      (error) => error.code === "invalid_scene_root",
    );
  });

  context.test("multiple roots", () => {
    const sink = createCollectingSink();
    const renderer = createSceneRenderer({ sink });
    assert.throws(
      () =>
        renderer.render(
          Children.toArray([createElement(SceneList, { key: "first" }), createElement(SceneList, { key: "second" })]),
        ),
      (error) => error.code === "invalid_scene_root",
    );
  });

  context.test("unknown properties", () => {
    const sink = createCollectingSink();
    const renderer = createSceneRenderer({ sink });
    assert.throws(
      () => renderer.render(createElement(SceneListItem, { title: "Task", keywords: "task" })),
      (error) => error.code === "unknown_prop",
    );
    assert.equal(sink.transactions.length, 0);
  });

  context.test("text nodes", () => {
    const sink = createCollectingSink();
    const renderer = createSceneRenderer({ sink });
    assert.throws(
      () => renderer.render(createElement(SceneList, null, "hello")),
      (error) => error.code === "text_not_supported",
    );
    assert.equal(sink.transactions.length, 0);
  });
});

test("runs passive effects after the commit", async () => {
  const sink = createCollectingSink();
  const renderer = createSceneRenderer({ sink });

  renderer.render(createElement(EffectsComponent));
  await renderer.flush();

  assert.deepEqual(effects, ["mounted"]);
});

test("does not publish transactions for commits without changes", async () => {
  const sink = createCollectingSink();
  const renderer = createSceneRenderer({ sink });

  const tree = () => listWith([{ title: "Same" }]);
  renderer.render(tree());
  await renderer.flush();
  assert.equal(sink.transactions.length, 1);

  renderer.render(tree());
  await renderer.flush();
  assert.equal(sink.transactions.length, 1);
});

test("surfaces render errors through onError without publishing", async () => {
  const sink = createCollectingSink();
  const errors = [];
  const renderer = createSceneRenderer({ sink, onError: (error) => errors.push(error) });

  renderer.render(createElement(ThrowingApp));
  await renderer.flush();

  assert.equal(errors.length > 0, true);
  assert.equal(sink.transactions.length, 0);
});

test("unmount clears callbacks and stops publishing", async () => {
  const sink = createCollectingSink();
  const renderer = createSceneRenderer({ sink });

  renderer.render(listWith([{ title: "First", action: () => {} }]));
  await renderer.flush();
  const eventId = snapshotRoot(sink).children[0].children[0].props.onAction;

  renderer.unmount();
  await renderer.flush();

  assert.throws(
    () => renderer.dispatchSceneEvent({ eventId }),
    (error) => error.code === "unknown_event",
  );
  assert.throws(
    () => renderer.render(createElement(SceneList, null)),
    (error) => error instanceof SceneRendererError && error.code === "renderer_unmounted",
  );
  assert.equal(sink.transactions.length, 1);
});

test("renders a detail root with markdown", async () => {
  const sink = createCollectingSink();
  const renderer = createSceneRenderer({ sink });

  renderer.render(createElement(SCENE_DETAIL_TYPE, { markdown: "# Hello", navigationTitle: "Docs" }));
  await renderer.flush();

  assert.equal(sink.transactions.length, 1);
  const root = snapshotRoot(sink);
  assert.equal(root.type, "detail");
  assert.deepEqual(root.props, { markdown: "# Hello", navigationTitle: "Docs" });
  assert.deepEqual(root.children, []);
});

test("renders form controls and routes form values through scene events", async () => {
  const sink = createCollectingSink();
  const renderer = createSceneRenderer({ sink });
  const changes = [];

  renderer.render(
    createElement(
      SCENE_FORM_TYPE,
      { navigationTitle: "Profile" },
      createElement(SCENE_FORM_TEXT_FIELD_TYPE, {
        id: "name",
        title: "Name",
        defaultValue: "Ada",
        onChange: (payload) => changes.push(payload),
      }),
    ),
  );
  await renderer.flush();

  const root = snapshotRoot(sink);
  assert.equal(root.type, "form");
  assert.deepEqual(root.props, { navigationTitle: "Profile" });
  assert.deepEqual(root.children[0].props, {
    id: "name",
    title: "Name",
    defaultValue: "Ada",
    onChange: "event-1",
  });

  renderer.dispatchSceneEvent({ eventId: "event-1", values: { name: "Grace" } });
  assert.deepEqual(changes, [{ eventId: "event-1", values: { name: "Grace" } }]);
});
