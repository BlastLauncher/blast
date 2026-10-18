import { expect, test } from "bun:test";
import { createElement as h, useState } from "react";
import { createSceneRoot, type SceneSnapshot } from "./index.ts";

const list = (keys: string[]) =>
  h("List", null, ...keys.map((key) => h("List.Item", { key, title: key })));
const nodes = (keys: string[]) => keys.map((key) => h("Item", { key, title: key }));

function Counter() {
  const [count, setCount] = useState(0);
  return h("Action", { count, onAction: () => setCount((value) => value + 1) });
}

class Custom {
  value = 1;
}

function setup() {
  const scenes: SceneSnapshot[] = [];
  const warnings: string[] = [];
  const root = createSceneRoot({
    publish: (scene) => scenes.push(scene),
    onWarning: (message) => warnings.push(message),
  });
  return { root, scenes, warnings, latest: () => scenes.at(-1)!.root! };
}

test("publishes fresh snapshots with stable ids, updated props and text", () => {
  const { root, scenes, latest } = setup();
  root.render(
    h("List", { title: "First", key: "list" }, h("List.Item", { title: "One" }), "hello"),
  );
  expect(scenes).toHaveLength(1);
  const first = scenes[0]!;
  expect(first.revision).toBe(1);
  expect(first.root).toEqual({
    id: expect.any(String),
    type: "List",
    props: { title: "First" },
    children: [
      { id: expect.any(String), type: "List.Item", props: { title: "One" }, children: [] },
      { id: expect.any(String), type: "#text", props: { text: "hello" }, children: [] },
    ],
  });
  root.render(
    h("List", { title: "Second", key: "list" }, h("List.Item", { title: "Two" }), "world"),
  );
  expect(scenes).toHaveLength(2);
  expect(scenes[1]!.revision).toBe(2);
  expect(latest().id).toBe(first.root!.id);
  expect(latest().children.map((node) => node.id)).toEqual(
    first.root!.children.map((node) => node.id),
  );
  expect(latest().props).toEqual({ title: "Second" });
  expect(latest().children[1]!.props).toEqual({ text: "world" });
  expect(first.root!.props).toEqual({ title: "First" });
  expect(first.root!.children[1]!.props).toEqual({ text: "hello" });
  root.unmount();
  expect(scenes.at(-1)).toEqual({ revision: 3, root: null });
});

test("inserts, removes, and reorders keyed children without changing surviving ids", () => {
  const { root, latest } = setup();
  root.render(list(["a", "b", "c"]));
  const ids = Object.fromEntries(latest().children.map((node) => [node.props.title, node.id]));
  root.render(list(["c", "d", "a"]));
  expect(latest().children.map((node) => node.props.title)).toEqual(["c", "d", "a"]);
  expect(latest().children[0]!.id).toBe(ids.c);
  expect(latest().children[2]!.id).toBe(ids.a);
  expect(new Set(latest().children.map((node) => node.id)).size).toBe(3);
  expect(() => root.dispatch(ids.b!, "onAction", [])).toThrow("Unknown scene node");
  root.render(list(["a", "d", "c"]));
  expect(latest().children.map((node) => node.props.title)).toEqual(["a", "d", "c"]);
  root.unmount();
});

test("dispatch uses latest callbacks, preserves return values, and forgets removed handlers", async () => {
  const { root, latest } = setup();
  root.render(h("Action", { onAction: (value: unknown) => `first:${value}` }));
  const id = latest().id;
  expect(latest().props).toEqual({ onAction: { $handler: "onAction" } });
  expect(root.dispatch(id, "onAction", ["arg"])).toBe("first:arg");
  const promise = Promise.resolve("second");
  root.render(h("Action", { onAction: () => promise }));
  expect(root.dispatch(id, "onAction", [])).toBe(promise);
  expect(await root.dispatch(id, "onAction", [])).toBe("second");
  expect(() => root.dispatch(id, "missing", [])).toThrow("Unknown handler missing");
  root.render(h("Action", {}));
  expect(() => root.dispatch(id, "onAction", [])).toThrow("Unknown handler onAction");
  root.unmount();
  expect(() => root.dispatch(id, "onAction", [])).toThrow("Unknown scene node");
});

test("flush commits useState updates from dispatch without sleeps", () => {
  const { root, scenes, latest } = setup();
  root.render(h(Counter));
  root.dispatch(latest().id, "onAction", []);
  root.flush();
  expect(latest().props.count).toBe(1);
  expect(scenes.map((scene) => scene.revision)).toEqual([1, 2]);
  root.unmount();
});

test("serializes nested JSON and callbacks, dropping invalid values with useful warnings", () => {
  const { root, latest, warnings } = setup();
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  const input = { value: "original", absent: undefined };
  root.render(
    h("Item", {
      input,
      valid: [null, true, 42, "text", { nested: [1, 2] }],
      absent: undefined,
      date: new Date(0),
      custom: new Custom(),
      symbol: Symbol("x"),
      nan: NaN,
      infinity: Infinity,
      bigint: 1n,
      element: h("Other"),
      cycle,
      nested: {
        bad: new Date(0),
        callback: (value: unknown) => value,
        values: [1, Symbol("bad"), undefined, 2],
      },
    }),
  );
  expect(latest().props).toEqual({
    input: { value: "original" },
    valid: [null, true, 42, "text", { nested: [1, 2] }],
    cycle: {},
    nested: { callback: { $handler: "nested.callback" }, values: [1, null, null, 2] },
  });
  expect(root.dispatch(latest().id, "nested.callback", [123])).toBe(123);
  for (const prop of [
    "date",
    "custom",
    "symbol",
    "nan",
    "infinity",
    "bigint",
    "element",
    "cycle.self",
    "nested.bad",
    "nested.values[1]",
  ]) {
    expect(warnings).toContain(`Dropped non-serializable prop Item.${prop}`);
  }
  expect(warnings).toHaveLength(10);
  expect(JSON.parse(JSON.stringify(latest()))).toEqual(latest());
  input.value = "mutated";
  expect(latest().props.input).toEqual({ value: "original" });
  root.unmount();
});

test("nested callback paths cannot overwrite each other", () => {
  const { root, latest } = setup();
  root.render(h("Item", { nested: { action: () => 1 }, "nested.action": () => 2 }));
  const props = latest().props as {
    nested: { action: { $handler: string } };
    "nested.action": { $handler: string };
  };
  expect(root.dispatch(latest().id, props.nested.action.$handler, [])).toBe(1);
  expect(root.dispatch(latest().id, props["nested.action"].$handler, [])).toBe(2);
  root.unmount();
});

test("top-level siblings use a synthetic root and support container reordering", () => {
  const { root, latest } = setup();
  root.render(nodes(["a", "b", "c"]));
  expect(latest().type).toBe("#root");
  const ids = latest().children.map((node) => node.id);
  root.render(nodes(["c", "a", "d"]));
  expect(latest().children.map((node) => node.props.title)).toEqual(["c", "a", "d"]);
  expect(
    latest()
      .children.slice(0, 2)
      .map((node) => node.id),
  ).toEqual([ids[2]!, ids[0]!]);
  root.unmount();
});

test("independent roots do not share handlers or revisions", () => {
  const a = setup();
  const b = setup();
  a.root.render(h("Action", { onAction: () => "a" }));
  b.root.render(h("Action", { onAction: () => "b" }));
  expect(a.root.dispatch(a.latest().id, "onAction", [])).toBe("a");
  expect(b.root.dispatch(b.latest().id, "onAction", [])).toBe("b");
  a.root.unmount();
  expect(b.scenes).toHaveLength(1);
  b.root.unmount();
});

test("Node 24 imports TypeScript directly and prints a scene", () => {
  const entry = new URL("./index.ts", import.meta.url).href;
  const react = import.meta.resolve("react");
  const script = `
    import { createElement } from ${JSON.stringify(react)};
    import { createSceneRoot } from ${JSON.stringify(entry)};
    const root = createSceneRoot({ publish: (scene) => console.log(JSON.stringify(scene)) });
    root.render(createElement("List", { title: "Node" }));
    root.flush();
    root.unmount();
  `;
  const result = Bun.spawnSync(["node", "--input-type=module", "--eval", script]);
  expect(result.exitCode).toBe(0);
  expect(result.stderr.toString()).toBe("");
  const scenes = result.stdout
    .toString()
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(scenes).toEqual([
    { revision: 1, root: { id: "1", type: "List", props: { title: "Node" }, children: [] } },
    { revision: 2, root: null },
  ]);
});

test("array omissions preserve indices, including sparse entries and callback paths", () => {
  const { root, latest } = setup();
  const values = [undefined, undefined, () => "third", { absent: undefined }];
  delete values[1];
  root.render(h("Item", { values }));
  expect(latest().props.values).toEqual([null, null, { $handler: "values[2]" }, {}]);
  expect(root.dispatch(latest().id, "values[2]", [])).toBe("third");
  root.unmount();
});
