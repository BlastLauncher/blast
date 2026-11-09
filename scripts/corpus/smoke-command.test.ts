import { expect, test } from "bun:test";
import type { JsonValue, SceneMessage, SceneNode } from "../../packages/protocol/src/index.ts";
import type { Broker, Exit, Session } from "../../packages/host/src/index.ts";
import { defaultDataDir, oauthTokenFile, storageFile } from "../../packages/host/src/index.ts";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { setCapabilityRequester } from "../../packages/runtime/src/api/capability.ts";
import { OAuth } from "../../packages/runtime/src/api/oauth.ts";
import { createSweepBroker, firstSceneOrExit, probePrimaryAction } from "./smoke-command.ts";

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

let capabilityId = 0;
async function request(broker: Broker, name: string, params: JsonValue) {
  return await broker({
    type: "capability.request",
    id: `sweep-test-${++capabilityId}`,
    name,
    params,
  });
}

async function ask(broker: Broker, name: string, params: JsonValue) {
  const result = await request(broker, name, params);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

async function exists(path: string): Promise<boolean> {
  return await stat(path).then(
    () => true,
    () => false,
  );
}

test("sweep broker isolates storage and OAuth state to each command scratch", async () => {
  const parent = await mkdtemp(join(tmpdir(), "blast-sweep-broker-"));
  // A fresh name keeps the host data directory check below independent of any
  // state a real run left behind.
  const extensionName = `sweep-test-${randomUUID()}`;
  try {
    const firstScratch = await mkdtemp(join(parent, "command-"));
    const secondScratch = await mkdtemp(join(parent, "command-"));
    const first = createSweepBroker(extensionName, firstScratch);
    const second = createSweepBroker(extensionName, secondScratch);

    await ask(first, "storage.set", { key: "seen", value: "first" });
    await ask(first, "oauth.tokens.set", {
      providerId: "provider",
      tokens: { accessToken: "first-token" },
    });

    // The second command starts from empty stores, not the first command's.
    expect(await ask(second, "storage.get", { key: "seen" })).toBeNull();
    expect(await ask(second, "oauth.tokens.get", { providerId: "provider" })).toBeNull();
    expect(await ask(first, "storage.get", { key: "seen" })).toBe("first");
    expect(await ask(first, "oauth.tokens.get", { providerId: "provider" })).toMatchObject({
      accessToken: "first-token",
    });

    // Every handler write stays inside the command's scratch directory.
    expect(await readdir(firstScratch)).toEqual(["host-data"]);
    expect((await readdir(join(firstScratch, "host-data"))).toSorted()).toEqual([
      "oauth",
      "storage",
    ]);
    expect(await readdir(secondScratch)).toEqual([]);
    expect((await readdir(parent)).toSorted()).toEqual(
      [basename(firstScratch), basename(secondScratch)].toSorted(),
    );
    // The data directory an embedder would default to is untouched.
    expect(await exists(storageFile(defaultDataDir(), extensionName))).toBe(false);
    expect(await exists(oauthTokenFile({ extensionName }))).toBe(false);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("sweep broker keeps machine-changing capabilities denied", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "blast-sweep-broker-"));
  try {
    const broker = createSweepBroker("sweep-denials", scratch);
    for (const name of ["open.url", "clipboard.copy", "clipboard.paste", "clipboard.clear"]) {
      expect(await request(broker, name, { text: "x", url: "https://example.com" })).toMatchObject({
        ok: false,
        error: { code: "denied", message: `Capability denied: ${name}` },
      });
    }
    // Read-only headless defaults still answer.
    expect(await ask(broker, "clipboard.read", {})).toEqual({ text: "" });
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test("an empty sweep OAuth store reads as undefined through the extension API", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "blast-sweep-broker-"));
  const broker = createSweepBroker("sweep-oauth-empty", scratch);
  setCapabilityRequester((name, params) => ask(broker, name, params));
  try {
    // The wire says null for "no tokens"; the extension API maps it to undefined.
    const client = new OAuth.PKCEClient({ redirectMethod: "web", providerName: "Provider" });
    expect(await client.getTokens()).toBeUndefined();
  } finally {
    setCapabilityRequester(undefined);
    await rm(scratch, { recursive: true, force: true });
  }
});

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

test("a menu-bar command whose Navigation entry is empty is an empty menu bar", async () => {
  const empty: SceneMessage = {
    type: "scene",
    revision: 1,
    root: node("Navigation", "nav", {}, [node("Navigation.Entry", "entry", { active: true })]),
  };
  const result = await firstSceneOrExit(sceneStream(empty, empty), 200, "menu-bar");
  expect(result.probe).toMatchObject({ kind: "empty-menu-bar" });
});

test("a menu-bar command with a menu is a scene, not an empty menu bar", async () => {
  const menu: SceneMessage = {
    type: "scene",
    revision: 1,
    root: node("Navigation", "nav", {}, [
      node("Navigation.Entry", "entry", { active: true }, [
        node("MenuBarExtra", "menu", { title: "Modes" }, [
          node("MenuBarExtra.Item", "item", { title: "Run" }),
        ]),
      ]),
    ]),
  };
  const result = await firstSceneOrExit(sceneStream(menu, menu), 200, "menu-bar");
  expect(result.probe).toMatchObject({ kind: "scene", rootType: "Navigation" });
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
