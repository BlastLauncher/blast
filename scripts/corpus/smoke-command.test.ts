import { expect, test } from "bun:test";
import type { SceneMessage, SceneNode } from "../../packages/protocol/src/index.ts";
import type { Exit, Session } from "../../packages/host/src/index.ts";
import { firstSceneOrExit, probePrimaryAction } from "./smoke-command.ts";

const node = (
  type: string,
  id: string,
  props: SceneNode["props"] = {},
  children: SceneNode[] = [],
): SceneNode => ({ type, id, props, children });

const actionScene = (revision: number, title: string): SceneMessage => ({
  type: "scene",
  revision,
  root: node("Navigation", "nav", {}, [
    node("Navigation.Entry", "entry", { active: true }, [
      node("List", "list", {}, [
        node("List.Item", "item", { title }, [
          node("Slot", "actions", { name: "actions" }, [
            node("ActionPanel", "panel", {}, [
              node("Action", "action", { title: "Run", onAction: { $handler: "run" } }),
            ]),
          ]),
        ]),
      ]),
    ]),
  ]),
});

function fakeSession(
  first: SceneMessage,
  after: SceneMessage,
  order: "exit-first" | "scene-first" = "exit-first",
): Session {
  let sceneListener: ((scene: SceneMessage) => void) | undefined;
  let resolveExit!: (exit: Exit) => void;
  const exited = new Promise<Exit>((resolve) => {
    resolveExit = resolve;
  });
  return {
    latestScene: first,
    logs: [],
    onLog: () => () => {},
    scenes: (callback) => {
      sceneListener = callback;
      callback(first);
      return () => {
        sceneListener = undefined;
      };
    },
    sendProvider: () => {},
    sendEvent: () => {
      if (order === "scene-first") {
        sceneListener?.(after);
        resolveExit({ code: 0, signal: null });
      } else {
        // Resolve first, then publish on a later microtask. This reproduces the
        // exit-before-scene ordering that used to misclassify a clean action as no-op.
        resolveExit({ code: 0, signal: null });
        queueMicrotask(() => sceneListener?.(after));
      }
    },
    shutdown: async () => ({ code: 0, signal: null }),
    exited,
  };
}

function sceneStream(first: SceneMessage, after: SceneMessage): Session {
  let listener: ((scene: SceneMessage) => void) | undefined;
  return {
    latestScene: first,
    logs: [],
    onLog: () => () => {},
    scenes: (callback) => {
      listener = callback;
      callback(first);
      queueMicrotask(() => listener?.(after));
      return () => {
        listener = undefined;
      };
    },
    sendProvider: () => {},
    sendEvent: () => {},
    shutdown: async () => ({ code: 0, signal: null }),
    exited: new Promise<Exit>(() => {}),
  };
}

test("observation keeps a clean exit-first action when the settled scene changes", async () => {
  const first = actionScene(1, "before");
  const after = actionScene(2, "after");
  const result = await probePrimaryAction(fakeSession(first, after), first, (text) => text);
  expect(result.outcome).toBe("scene-changed");
  expect(result.dispatched).toBe(true);
});

test("observation also keeps a scene-first action change", async () => {
  const first = actionScene(1, "before");
  const after = actionScene(2, "after");
  const result = await probePrimaryAction(
    fakeSession(first, after, "scene-first"),
    first,
    (text) => text,
  );
  expect(result.outcome).toBe("scene-changed");
  expect(result.dispatched).toBe(true);
});

test("first scene waits through loading and returns the settled revision", async () => {
  const loading = actionScene(1, "loading");
  loading.root = {
    ...loading.root!,
    children: loading.root!.children.map((entry) => ({
      ...entry,
      children: entry.children.map((list) => ({
        ...list,
        props: { ...list.props, isLoading: true },
      })),
    })),
  };
  const settled = actionScene(2, "settled");
  const result = await firstSceneOrExit(sceneStream(loading, settled), 1000, "view");
  expect(result.probe).toMatchObject({ kind: "scene", rootType: "Navigation" });
  expect(result.scene?.revision).toBe(2);
  expect(result.loading).toBeUndefined();
});
