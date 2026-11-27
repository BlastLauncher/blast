import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ControllerView } from "@blastlauncher/client-core";
import type { JsonValue } from "@blastlauncher/protocol";
import {
  createEngine,
  isAlfredWorkflowPath,
  openExtension,
  prepareAlfredWorkflow,
  startLaunchFlow,
  type CapabilityHandler,
} from "./index.ts";
import { waitForSubscription, writeAlfredFixture } from "./test-helper.ts";

const views = { platform: "Linux" } as const;
const raycast = new URL("../../../fixtures/extensions/hello-list", import.meta.url).pathname;
let scratch = "";
let fixture: { dir: string; archive: string };
const cleanups: (() => Promise<void>)[] = [];
beforeAll(async () => {
  scratch = await mkdtemp(join(tmpdir(), "blast-alfred-host-"));
  fixture = await writeAlfredFixture(scratch);
});
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((clean) => clean()));
});
afterAll(async () => {
  await rm(scratch, { recursive: true, force: true });
});

const sources = [
  ["directory", () => fixture.dir],
  ["archive", () => fixture.archive],
] as const;

async function engine() {
  const dataDir = await mkdtemp(join(tmpdir(), "blast-alfred-data-"));
  const effects: { copied: JsonValue[]; opened: JsonValue[] } = { copied: [], opened: [] };
  const handlers: Record<string, CapabilityHandler> = {
    "clipboard.copy": (params) => {
      effects.copied.push(params);
      return null;
    },
    "open.url": (params) => {
      effects.opened.push(params);
      return null;
    },
  };
  const instance = createEngine({ dataDir, handlers });
  cleanups.push(async () => {
    await instance.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  return { instance, dataDir, effects };
}
function until(
  source: { subscribe(listener: (view: ControllerView) => void): () => void },
  match: (view: ControllerView) => boolean,
): Promise<ControllerView> {
  return waitForSubscription((listener) => source.subscribe(listener), match, { label: "a view" });
}
const row = (view: ControllerView, title: string) => view.rows.find((r) => r.title === title);

test("isAlfredWorkflowPath tells workflows from Raycast extensions", () => {
  expect(isAlfredWorkflowPath(fixture.dir)).toBe(true);
  expect(isAlfredWorkflowPath(fixture.archive)).toBe(true);
  expect(isAlfredWorkflowPath("missing/Thing.AlfredWorkflow")).toBe(true);
  expect(isAlfredWorkflowPath(raycast)).toBe(false);
  expect(isAlfredWorkflowPath(scratch)).toBe(false);
});

test("prepareAlfredWorkflow extracts an archive once and keeps a directory in place", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "blast-alfred-prepare-"));
  cleanups.push(() => rm(dataDir, { recursive: true, force: true }));
  expect(await prepareAlfredWorkflow(fixture.dir, dataDir)).toEqual({
    workflowDir: fixture.dir,
    isArchive: false,
  });
  const first = await prepareAlfredWorkflow(fixture.archive, dataDir);
  expect(first.isArchive).toBe(true);
  expect(first.workflowDir.startsWith(join(dataDir, "workflows"))).toBe(true);
  expect(existsSync(join(first.workflowDir, "info.plist"))).toBe(true);
  expect(await prepareAlfredWorkflow(fixture.archive, dataDir)).toEqual(first);
});

for (const [kind, path] of sources) {
  test(`openExtension (${kind}): manifest, assets, dependencies and watch`, async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "blast-alfred-open-"));
    const handle = openExtension({ extensionDir: path(), dataDir });
    cleanups.push(async () => {
      await handle.close();
      await rm(dataDir, { recursive: true, force: true });
    });
    // An archive has no directory to watch; subscribing must not throw ENOTDIR.
    const unwatch = handle.watch(() => {});
    const manifest = await handle.manifest();
    expect(manifest).toMatchObject({
      name: "com.example.greeter",
      title: "Greeter",
      icon: "icon.png",
      preferences: [{ name: "token", type: "textfield", required: true }],
      commands: [
        { name: "greet", title: "Greet", subtitle: "Say hello", mode: "view", icon: "sf.png" },
        {
          name: "site",
          title: "Open Site",
          mode: "no-view",
          arguments: [{ name: "query", type: "text", required: true }],
        },
      ],
    });
    const assets = handle.assetsDir();
    if (kind === "directory") expect(assets).toBe(fixture.dir);
    else expect(assets.startsWith(join(dataDir, "workflows"))).toBe(true);
    expect(existsSync(join(assets, "sf.png"))).toBe(true);
    expect(await handle.dependencies.check()).toMatchObject({
      needed: false,
      unresolved: [],
      installable: false,
      pinned: true,
    });
    expect(await handle.dependencies.install()).toMatchObject({ unresolved: [] });
    unwatch();
  });

  test(`engine root (${kind}): icons, preference prompt, Script Filter search and action`, async () => {
    const { instance, effects } = await engine();
    const handle = instance.openExtension({ extensionDir: path() });
    const root = instance.root({ views });
    await root.ready();
    const listed = root.view();
    expect(listed.rows.filter((r) => r.kind === "item").map((r) => r.id)).toEqual([
      "com.example.greeter:greet",
      "com.example.greeter:site",
    ]);
    expect(row(listed, "Greet")?.iconSource).toEqual({
      kind: "file",
      path: join(handle.assetsDir(), "sf.png"),
    });

    root.input({ type: "primary" });
    const form = await until(root, (v) => v.kind === "form");
    expect(form.form?.fields.map((f) => f.id)).toEqual(["token"]);
    root.input({ type: "setValue", id: "token", value: "abc" });
    root.input({ type: "primary" });
    await until(root, (v) => v.kind === "list" && v.title === "Greet");
    expect((await handle.preferences("greet")).values).toEqual({ token: "abc" });
    root.input({ type: "search", text: "world" });
    await until(root, (v) => row(v, "Hello world")?.subtitle === "token abc");
    root.input({ type: "primary" });
    // The copy closes the window, and the root comes back.
    await until(root, (v) => v.title === "Commands");
    expect(effects.copied).toEqual([{ text: "world" }]);

    // Persisted: the next launch skips the prompt.
    root.input({ type: "primary" });
    await until(root, (v) => v.kind === "list" && v.title === "Greet");
  });

  test(`launch flow (${kind}): a Keyword asks for its query and opens the URL`, async () => {
    const { instance, effects } = await engine();
    const handle = instance.openExtension({ extensionDir: path() });
    await handle.savePreferences("site", { token: "abc" });
    const flow = startLaunchFlow(handle, "site", { views });
    const form = await until(flow, (v) => v.kind === "form");
    expect(form.form?.fields.map((f) => f.id)).toEqual(["argument:query"]);
    flow.input({ type: "setValue", id: "argument:query", value: "docs" });
    flow.input({ type: "submit" });
    const opened = await flow.opened;
    expect(opened).toBeDefined();
    const exit = await opened!.session.exited;
    expect(exit).toMatchObject({ code: 0, signal: null });
    expect(effects.opened).toEqual([{ url: "https://example.com/docs" }]);
    await opened!.close();
  });
}

test("launching without a required value is a MissingLaunchValuesError", async () => {
  const { instance } = await engine();
  const handle = instance.openExtension({ extensionDir: fixture.dir });
  await expect(handle.launch("site")).rejects.toMatchObject({
    code: "MISSING_LAUNCH_VALUES",
    arguments: ["query"],
  });
  await expect(handle.launch("missing")).rejects.toThrow("Unknown extension command: missing");
});
