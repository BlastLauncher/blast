import { describe, expect, test } from "bun:test";
import { createScenePatchApplier, type SceneNode } from "@blastlauncher/protocol";
import { parseGridInput, parseTextResponse } from "./runtime.ts";
import {
  diffScene,
  itemActions,
  itemIcon,
  itemKeys,
  modifierMask,
  renderScene,
  type ItemCallbacks,
  type SceneModel,
} from "./scene.ts";
import type { ScriptFilterItem } from "./script-filter.ts";
import type { AlfredConnection } from "./workflow.ts";

const noop = () => {};
const list = (titles: string[], extra: Partial<SceneModel> = {}): SceneModel => ({
  entries: [
    {
      key: "e1",
      view: {
        kind: "list",
        isLoading: false,
        filtering: false,
        items: titles.map((title) => ({
          key: title,
          title,
          actions: [{ key: "open", title: "Open", run: noop }],
        })),
        empty: { title: "Nothing" },
      },
    },
  ],
  closeMainWindow: false,
  ...extra,
});

describe("diffScene", () => {
  const steps: SceneModel[] = [
    list(["a", "b"]),
    list(["a", "b"]),
    list(["b", "a", "c"]),
    list([]),
    {
      ...list(["x"]),
      entries: [
        ...list(["x"]).entries,
        {
          key: "e2",
          view: { kind: "detail", markdown: "# hi", isLoading: true, actions: [] },
        },
      ],
      pop: noop,
      toast: { id: 1, style: "failure", title: "Oops" },
    },
    list(["x"], { closeMainWindow: true, hud: { id: 2, title: "Done" } }),
    {
      ...list(["x"]),
      alert: {
        id: 3,
        title: "Sure?",
        primary: { title: "Yes", run: noop },
        dismiss: { title: "No", run: noop },
      },
    },
  ];

  test("patches reconstruct every rendered scene", () => {
    const applier = createScenePatchApplier();
    let previous: SceneNode | null = null;
    let revision = 0;
    let patches = 0;
    for (const model of steps) {
      const { root } = renderScene(model);
      const ops = diffScene(previous, root);
      let current;
      if (ops === undefined) current = applier.reset({ type: "scene", revision: ++revision, root });
      else {
        patches++;
        const baseRevision = revision++;
        current = applier.apply({ type: "scene.patch", revision, baseRevision, ops });
      }
      expect(current.root).toEqual(root);
      previous = root;
    }
    expect(patches).toBe(steps.length - 1);
  });

  test("unchanged trees produce no ops and new roots need a full scene", () => {
    const { root } = renderScene(list(["a"]));
    expect(diffScene(root, renderScene(list(["a"])).root)).toEqual([]);
    expect(diffScene(null, root)).toBeUndefined();
    expect(diffScene(root, { ...root, id: "other" })).toBeUndefined();
  });

  test("handlers are registered per node and the back handler only when poppable", () => {
    let ran = 0;
    const model = list(["a"]);
    model.entries[0]!.view = {
      kind: "detail",
      markdown: "",
      isLoading: false,
      actions: [{ key: "go", title: "Go", run: () => ran++ }],
    };
    const { root, handlers } = renderScene(model);
    expect(root.props.pop).toBeUndefined();
    handlers.get("e1/detail/a/go")!.onAction!([]);
    expect(ran).toBe(1);
    expect(renderScene({ ...model, pop: noop }).root.props.pop).toEqual({ $handler: "pop" });
  });
});

const connection = (modifiers: number, modifierSubtext = ""): AlfredConnection => ({
  from: "sf",
  to: "next",
  modifiers,
  modifierSubtext,
  vitoclose: false,
  disabled: false,
});
const item = (extra: Partial<ScriptFilterItem> = {}): ScriptFilterItem => ({
  title: "T",
  valid: true,
  type: "default",
  arg: "arg",
  ...extra,
});

describe("itemActions", () => {
  const calls: unknown[][] = [];
  const callbacks: ItemCallbacks = {
    run: (...args) => calls.push(["run", ...args]),
    autocomplete: (text) => calls.push(["autocomplete", text]),
    copy: (text) => calls.push(["copy", text]),
    largeType: (text) => calls.push(["largeType", text]),
    quickLook: (url) => calls.push(["quickLook", url]),
  };

  test("modifier shortcuts drop fn but stay listed, and invalid mods are skipped", () => {
    const actions = itemActions(
      item({ mods: { "cmd+shift": { valid: false }, fn: { subtitle: "Fn only" } } }),
      {
        connections: [
          connection(modifierMask("ctrl+fn"), "Ctrl fn"),
          connection(modifierMask("cmd+shift")),
        ],
        variables: {},
        callbacks,
      },
    );
    expect(actions.map((action) => [action.title, action.shortcut])).toEqual([
      ["Open", undefined],
      ["Fn only", undefined],
      ["Ctrl fn", { modifiers: ["ctrl"], key: "return" }],
      ["Copy", { modifiers: ["cmd"], key: "c" }],
      ["Show Large Type", { modifiers: ["cmd"], key: "l" }],
    ]);
    calls.length = 0;
    actions[2]!.run();
    expect(calls).toEqual([["run", "arg", {}, (1 << 18) + (1 << 23)]]);
  });

  test("mod variables replace item variables on top of the session", () => {
    const actions = itemActions(
      item({ variables: { a: "item" }, mods: { alt: { arg: "alt", variables: { b: "mod" } } } }),
      { connections: [], variables: { s: "session" }, callbacks },
    );
    calls.length = 0;
    actions[0]!.run();
    actions[1]!.run();
    expect(calls).toEqual([
      ["run", "arg", { s: "session", a: "item" }, 0],
      ["run", "alt", { s: "session", b: "mod" }, 1 << 19],
    ]);
  });

  test("an invalid item without autocomplete has no primary run", () => {
    const actions = itemActions(
      { title: "T", valid: false, type: "default" },
      {
        connections: [connection(1 << 20)],
        variables: {},
        callbacks,
      },
    );
    expect(actions.map((action) => action.key)).toEqual(["largetype"]);
  });
});

test("item icons, keys and view inputs", () => {
  expect(itemIcon({ path: "a.png" }, "/wf", undefined)).toBe("/wf/a.png");
  expect(itemIcon({ type: "fileicon", path: "~/Desktop" }, "/wf", undefined)).toEqual({
    fileIcon: "~/Desktop",
  });
  expect(itemIcon({ type: "filetype", path: "public.folder" }, "/wf", "/wf/icon.png")).toBe(
    "/wf/icon.png",
  );
  expect(itemIcon(undefined, "/wf", undefined)).toBeUndefined();
  expect(itemKeys([{ uid: "a" }, {}, { uid: "a" }, { uid: "#1" }])).toEqual([
    "a",
    "#1",
    "#2",
    "#3",
  ]);

  expect(parseGridInput("/tmp/a.png\n\n/tmp/b.jpg\n").items.map((entry) => entry.title)).toEqual([
    "a.png",
    "b.jpg",
  ]);
  expect(parseGridInput('{"items":[{"title":"x"}]}').items[0]!.title).toBe("x");
  expect(parseTextResponse('{"response":"r","rerun":9,"variables":{"n":1}}')).toEqual({
    response: "r",
    footer: "",
    rerun: 5,
    variables: { n: "1" },
  });
  expect(parseTextResponse("{not json")).toEqual({
    response: "{not json",
    footer: "",
    variables: {},
  });
});
