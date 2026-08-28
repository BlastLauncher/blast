import assert from "node:assert/strict";
import test from "node:test";

import {
  Action,
  ActionPanel,
  Clipboard,
  CompatibilityError,
  Detail,
  Icon,
  List,
  configureRaycastCompat,
  renderCommand,
} from "../dist/index.js";
import { createElement } from "react";

function onAction() {}

function createContext({ grantClipboard = true } = {}) {
  const transactions = [];
  const capabilityRequests = [];
  const eventHandlers = [];
  return {
    transactions,
    capabilityRequests,
    grantClipboard,
    context: {
      publish: (transaction) => {
        transactions.push(transaction);
        return Promise.resolve();
      },
      onEvent: (handler) => {
        eventHandlers.push(handler);
      },
      requestCapability: (request) => {
        capabilityRequests.push(request);
        const granted = grantClipboard || request.capability !== "clipboard";
        return Promise.resolve(
          granted
            ? { outcome: "succeeded", value: "clipboard-text" }
            : {
                outcome: "denied",
                code: "capability_denied",
              },
        );
      },
    },
    dispatch(eventId) {
      for (const handler of eventHandlers) {
        handler({ eventId });
      }
    },
  };
}

test("renders a Raycast-style list through the compatibility surface", async () => {
  const environment = createContext();

  const renderer = renderCommand(environment.context, () =>
    createElement(
      List,
      { navigationTitle: "Tasks" },
      createElement(
        List.Item,
        { title: "First", subtitle: "Sub", icon: Icon.Circle },
        createElement(ActionPanel, null, createElement(Action, { title: "Run", onAction })),
      ),
      createElement(List.Item, { title: "Second" }),
    ),
  );
  await renderer.flush();

  assert.equal(environment.transactions.length, 1);
  const root = environment.transactions[0].operations[0].root;
  assert.deepEqual(root, {
    id: root.id,
    type: "list",
    props: { navigationTitle: "Tasks" },
    children: [
      {
        id: root.children[0].id,
        type: "list-item",
        props: { title: "First", subtitle: "Sub", icon: "circle" },
        children: [
          {
            id: root.children[0].children[0].id,
            type: "action",
            props: { title: "Run", onAction: root.children[0].children[0].props.onAction },
            children: [],
          },
        ],
      },
      {
        id: root.children[1].id,
        type: "list-item",
        props: { title: "Second" },
        children: [],
      },
    ],
  });
});

test("routes Action callbacks through scene events", async () => {
  const environment = createContext();
  const calls = [];

  const renderer = renderCommand(environment.context, () =>
    createElement(
      List,
      null,
      createElement(
        List.Item,
        { title: "First" },
        createElement(ActionPanel, null, createElement(Action, { title: "Run", onAction: () => calls.push("run") })),
      ),
    ),
  );
  await renderer.flush();

  const eventId = environment.transactions[0].operations[0].root.children[0].children[0].props.onAction;
  environment.dispatch(eventId);
  assert.deepEqual(calls, ["run"]);
});

test("copies text through the clipboard capability broker", async () => {
  const environment = createContext();
  const copies = [];

  const renderer = renderCommand(environment.context, () =>
    createElement(
      List,
      null,
      createElement(
        List.Item,
        { title: "First" },
        createElement(
          ActionPanel,
          null,
          createElement(Action.CopyToClipboard, {
            title: "Copy",
            content: "from-compat",
            onCopy: () => copies.push("copied"),
          }),
        ),
      ),
    ),
  );
  await renderer.flush();

  const eventId = environment.transactions[0].operations[0].root.children[0].children[0].props.onAction;
  environment.dispatch(eventId);
  await new Promise((resolve) => setTimeout(resolve, 5));

  assert.deepEqual(environment.capabilityRequests, [
    { capability: "clipboard", operation: "write", arguments: { text: "from-compat" } },
  ]);
  assert.deepEqual(copies, ["copied"]);
});

test("Clipboard singletons use the configured context", async () => {
  const environment = createContext();
  configureRaycastCompat(environment.context);

  await Clipboard.copy("hello");
  const text = await Clipboard.read();

  assert.deepEqual(environment.capabilityRequests, [
    { capability: "clipboard", operation: "write", arguments: { text: "hello" } },
    { capability: "clipboard", operation: "read" },
  ]);
  assert.equal(text, "clipboard-text");
});

test("denied clipboard writes raise structured compatibility errors", async () => {
  const environment = createContext({ grantClipboard: false });
  configureRaycastCompat(environment.context);

  await assert.rejects(
    () => Clipboard.copy("hello"),
    (error) => error instanceof CompatibilityError,
  );
  assert.equal(environment.capabilityRequests.length, 1);
});

test("renders a Detail root", async () => {
  const environment = createContext();

  const renderer = renderCommand(environment.context, () =>
    createElement(Detail, { markdown: "# Notes", navigationTitle: "Notes" }),
  );
  await renderer.flush();

  const root = environment.transactions[0].operations[0].root;
  assert.equal(root.type, "detail");
  assert.deepEqual(root.props, { markdown: "# Notes", navigationTitle: "Notes" });
});

test("rejects unmeasured API surface with structured errors", (context) => {
  const environment = createContext();

  context.test("List actions prop", () => {
    assert.throws(
      () => renderCommand(environment.context, () => createElement(List, { actions: null })),
      (error) => error instanceof CompatibilityError && /List actions/.test(error.message),
    );
  });

  context.test("ActionPanel title prop", () => {
    assert.throws(
      () =>
        renderCommand(environment.context, () =>
          createElement(
            List,
            null,
            createElement(List.Item, { title: "First" }, createElement(ActionPanel, { title: "Panel" })),
          ),
        ),
      (error) => error instanceof CompatibilityError && /ActionPanel title/.test(error.message),
    );
  });

  context.test("Action shortcut prop", () => {
    assert.throws(
      () =>
        renderCommand(environment.context, () =>
          createElement(
            List,
            null,
            createElement(
              List.Item,
              { title: "First" },
              createElement(
                ActionPanel,
                null,
                createElement(Action, { title: "Run", shortcut: { modifiers: ["cmd"] } }),
              ),
            ),
          ),
        ),
      (error) => error instanceof CompatibilityError && /Action shortcut/.test(error.message),
    );
  });

  context.test("non-action List.Item children", () => {
    assert.throws(
      () =>
        renderCommand(environment.context, () =>
          createElement(List, null, createElement(List.Item, { title: "First" }, createElement("div", null, "nope"))),
        ),
      (error) => error instanceof CompatibilityError && /not an action/.test(error.message),
    );
  });

  context.test("object icons", () => {
    assert.throws(
      () =>
        renderCommand(environment.context, () =>
          createElement(List, null, createElement(List.Item, { title: "First", icon: { source: "file.png" } })),
        ),
      (error) => error instanceof CompatibilityError && /object icon/.test(error.message),
    );
  });

  context.test("unconfigured Clipboard", async () => {
    configureRaycastCompat(undefined);
    await assert.rejects(
      () => Clipboard.copy("hello"),
      (error) => error instanceof CompatibilityError,
    );
  });
});
