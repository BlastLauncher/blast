import { afterEach, expect, test } from "bun:test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ControllerView } from "@blastlauncher/client-core";
import { createEngine, type ExtensionWatcherFactory } from "./index.ts";

const fixtures = new URL("../../../fixtures/extensions/", import.meta.url);
const hello = new URL("hello-list", fixtures).pathname;
const selection = new URL("selection", fixtures).pathname;
const views = { platform: "Linux" } as const;
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((clean) => clean()));
});
async function engine(options: Parameters<typeof createEngine>[0] = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), "blast-root-"));
  const instance = createEngine({ dataDir, ...options });
  cleanups.push(async () => {
    await instance.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  return { instance, dataDir };
}
/** Resolves with the first view (now or later) that satisfies `match`. */
function until(
  root: { subscribe(l: (view: ControllerView) => void): () => void },
  match: (view: ControllerView) => boolean,
  ms = 10_000,
): Promise<ControllerView> {
  return new Promise((resolve, reject) => {
    let stop: (() => void) | undefined;
    const timer = setTimeout(() => {
      stop?.();
      reject(new Error("Timed out waiting for a view"));
    }, ms);
    stop = root.subscribe((view) => {
      if (!match(view)) return;
      clearTimeout(timer);
      queueMicrotask(() => stop?.());
      resolve(view);
    });
  });
}
const items = (view: ControllerView) => view.rows.filter((r) => r.kind === "item").map((r) => r.id);
const inCommand = (view: ControllerView) => view.rows.some((r) => r.title === "apple");

test("engine root: lists opened extensions, searches, launches a command and returns on back", async () => {
  const { instance } = await engine();
  instance.openExtension({ extensionDir: hello });
  instance.openExtension({ extensionDir: selection });
  const root = instance.root({ views });
  await root.ready();
  const listed = root.view();
  expect(listed.title).toBe("Commands");
  expect(items(listed)).toEqual(["hello-list:index", "selection:index"]);
  expect(listed.rows.filter((r) => r.kind === "section").map((r) => r.title)).toEqual([
    "hello-list",
    "selection",
  ]);

  root.input({ type: "search", text: "hello" });
  expect(items(root.view())).toEqual(["hello-list:index"]);
  root.input({ type: "primary" });
  const command = await until(root, inCommand);
  expect(command.navigation.canGoBack).toBe(false);
  expect(command.title).toBe("hello-list");

  root.input({ type: "search", text: "ban" });
  expect(await until(root, (v) => v.search.text === "ban" && items(v).length === 1)).toBeTruthy();
  root.input({ type: "search", text: "" });
  root.input({ type: "back" });
  const back = await until(root, (v) => v.title === "Commands" && !inCommand(v));
  expect(back.search.text).toBe("");
  expect(items(back)).toEqual(["hello-list:index", "selection:index"]);
  // Back at the root again: a second launch works and nothing leaked from the first.
  root.input({ type: "select", id: "selection:index" });
  root.input({ type: "primary" });
  expect((await until(root, (v) => v.title !== "Commands")).title).not.toBe("Commands");
});

test("engine root: catalog follows opened and closed extensions and manifest edits", async () => {
  const listeners: ((event: string, file: string) => void)[] = [];
  const watcher: ExtensionWatcherFactory = (_path, listener) => {
    listeners.push(listener as (event: string, file: string) => void);
    const handle = { on: () => handle, close() {} };
    return handle;
  };
  const { instance: watched, dataDir } = await engine({
    watcher,
    debounce: { schedule: (callback) => (callback(), 0), cancel() {} },
  });
  const dir = join(dataDir, "ext");
  await cp(hello, dir, { recursive: true });
  const root = watched.root({ views });
  const empty = root.view();
  expect(empty.rows).toEqual([]);
  expect(empty.emptyText).toBe("No commands");

  const extension = watched.openExtension({ extensionDir: dir });
  await root.ready();
  expect(items(root.view())).toEqual(["hello-list:index"]);

  const manifest = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
  manifest.title = "Hello";
  manifest.icon = "icon.png";
  manifest.commands.push({ name: "second", title: "Second", mode: "no-view" });
  await writeFile(join(dir, "package.json"), JSON.stringify(manifest));
  const updated = until(root, (v) => items(v).length === 2);
  for (const listener of listeners) listener("change", "package.json");
  const view = await updated;
  expect(items(view)).toEqual(["hello-list:index", "hello-list:second"]);
  expect(view.rows[0]).toMatchObject({ kind: "section", title: "Hello" });
  expect(view.rows[1]).toMatchObject({
    iconSource: { kind: "file", path: join(dir, "assets", "icon.png") },
  });

  await writeFile(join(dir, "package.json"), "{ not json");
  for (const listener of listeners) listener("change", "package.json");
  await new Promise((done) => setTimeout(done, 20));
  expect(items(root.view())).toHaveLength(2);

  await extension.close();
  expect(root.view().rows).toEqual([]);
  await root.close();
});

test("engine root: a launch that cannot start stays at the root with a failure toast", async () => {
  const { instance, dataDir } = await engine();
  const dir = join(dataDir, "ext");
  await cp(hello, dir, { recursive: true });
  const manifest = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
  manifest.preferences = [{ name: "token", type: "textfield", title: "Token", required: true }];
  await writeFile(join(dir, "package.json"), JSON.stringify(manifest));
  instance.openExtension({ extensionDir: dir });
  const root = instance.root({ views });
  await root.ready();
  root.input({ type: "primary" });
  const failed = await until(root, (v) => v.feedback.toast !== null);
  expect(failed.title).toBe("Commands");
  expect(failed.feedback.toast).toMatchObject({
    style: "failure",
    title: "Could not open index",
    message: expect.stringContaining("token"),
  });
  root.input({ type: "move", direction: "down" });
  expect(root.view().feedback.toast).toBeNull();
});

test("engine root: a launch hook owns the session and the root resumes when it ends", async () => {
  const { instance } = await engine();
  instance.openExtension({ extensionDir: hello });
  instance.openExtension({ extensionDir: selection });
  const launched: string[] = [];
  let end: (() => void) | undefined;
  const root = instance.root({
    views,
    launch: async ({ command }) => {
      launched.push(command);
      return { exited: new Promise<void>((done) => (end = done)) };
    },
  });
  await root.ready();
  root.input({ type: "search", text: "selection" });
  root.input({ type: "primary" });
  await until(root, () => launched.length === 1);
  // The root stays the root view while the hook's session runs, and ignores a second launch.
  expect(root.view().title).toBe("Commands");
  root.input({ type: "primary" });
  await new Promise((done) => setTimeout(done, 20));
  expect(launched).toEqual(["index"]);
  end?.();
  const resumed = await until(root, (v) => v.search.text === "" && items(v).length === 2);
  expect(resumed.selectedId).toBe("hello-list:index");
  root.input({ type: "primary" });
  await until(root, () => launched.length === 2);
});
