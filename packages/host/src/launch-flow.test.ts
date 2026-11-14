import { afterEach, expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ControllerView } from "@blastlauncher/client-core";
import {
  createEngine,
  preferenceFile,
  startLaunchFlow,
  type DependencyInstaller,
} from "./index.ts";

const views = { platform: "Linux" } as const;
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((clean) => clean()));
});

async function setup(
  edit: (manifest: Record<string, unknown>) => void,
  installer?: DependencyInstaller,
) {
  const root = await mkdtemp(join(tmpdir(), "blast-flow-"));
  const extensionDir = join(root, "extension");
  const dataDir = join(root, "data");
  await cp(new URL("../../../fixtures/extensions/engine-handle", import.meta.url), extensionDir, {
    recursive: true,
  });
  const file = join(extensionDir, "package.json");
  const manifest = JSON.parse(await readFile(file, "utf8"));
  edit(manifest);
  await writeFile(file, JSON.stringify(manifest));
  const engine = createEngine({ dataDir, ...(installer ? { installer } : {}) });
  cleanups.push(async () => {
    await engine.close();
    await rm(root, { recursive: true, force: true });
  });
  return { handle: engine.openExtension({ extensionDir }), extensionDir, dataDir };
}

/** Resolves with the first view (now or later) that satisfies `match`. */
function until(
  flow: { subscribe(listener: (view: ControllerView) => void): () => void },
  match: (view: ControllerView) => boolean,
): Promise<ControllerView> {
  return new Promise((resolve, reject) => {
    let stop: (() => void) | undefined;
    const timer = setTimeout(() => {
      stop?.();
      reject(new Error("Timed out waiting for a view"));
    }, 10_000);
    stop = flow.subscribe((view) => {
      if (!match(view)) return;
      clearTimeout(timer);
      queueMicrotask(() => stop?.());
      resolve(view);
    });
  });
}
const isForm = (view: ControllerView) => view.kind === "form";
const toast = (style: string) => (view: ControllerView) => view.feedback.toast?.style === style;
const fieldIds = (view: ControllerView) => view.form?.fields.map((field) => field.id);

async function sceneText(opened: { session: { scenes(l: (scene: unknown) => void): () => void } }) {
  return new Promise<string>((resolve) => {
    opened.session.scenes((scene) => {
      const text = JSON.stringify(scene);
      if (text.includes("Engine fixture")) resolve(text);
    });
  });
}

test("launch flow: missing preferences and arguments become a form, then the command runs", async () => {
  const { handle, dataDir } = await setup((manifest) => {
    manifest.preferences = [
      { name: "token", type: "password", title: "Token", required: true },
      { name: "extra", type: "textfield", title: "Extra", required: false },
    ];
    (manifest.commands as Record<string, unknown>[])[0]!.arguments = [
      { name: "query", type: "text", required: true, placeholder: "Query" },
    ];
  });
  const flow = startLaunchFlow(handle, "index", { views });
  const form = await until(flow, isForm);
  expect(form.title).toBe("Set up index");
  expect(fieldIds(form)).toEqual(["token", "argument:query"]);
  flow.input({ type: "submit" });
  expect((await until(flow, (v) => isForm(v) && !!v.form?.fields[0]?.error)).form?.fields).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: "token", error: "Required" })]),
  );
  flow.input({ type: "setValue", id: "token", value: "sekret" });
  flow.input({ type: "setValue", id: "argument:query", value: "hello" });
  flow.input({ type: "primary" });
  const opened = await flow.opened;
  expect(opened).toBeDefined();
  expect(await flow.argumentValues).toEqual({ query: "hello" });
  const text = await sceneText(opened!);
  expect(text).toContain("sekret");
  expect(text).toContain("hello");
  const stored = JSON.parse(await readFile(preferenceFile(dataDir, "engine-handle"), "utf8"));
  expect(stored.extension.token).toBe("sekret");
  await opened!.close();
});

test("launch flow: a satisfied command launches without showing a form", async () => {
  const { handle } = await setup(() => {});
  const flow = startLaunchFlow(handle, "index", { views });
  const opened = await flow.opened;
  expect(opened).toBeDefined();
  await opened!.close();
});

test("launch flow: cancelling the form resolves undefined and launches nothing", async () => {
  const { handle } = await setup((manifest) => {
    manifest.preferences = [{ name: "token", type: "textfield", title: "Token", required: true }];
  });
  const flow = startLaunchFlow(handle, "index", { views });
  await until(flow, isForm);
  flow.input({ type: "back" });
  expect(await flow.opened).toBeUndefined();
});

test("launch flow: configure shows every preference with its value and saves without launching", async () => {
  const { handle } = await setup((manifest) => {
    manifest.preferences = [
      {
        name: "region",
        type: "dropdown",
        title: "Region",
        required: false,
        default: "eu",
        data: [
          { title: "EU", value: "eu" },
          { title: "US", value: "us" },
        ],
      },
    ];
    (manifest.commands as Record<string, unknown>[])[0]!.preferences = [
      { name: "greeting", type: "textfield", title: "Greeting", required: false },
    ];
  });
  await handle.savePreferences("index", { greeting: "hi" });
  const flow = startLaunchFlow(handle, "index", { views, configure: true });
  const form = await until(flow, isForm);
  expect(form.title).toBe("Configure index");
  expect(form.primary.title).toBe("Save");
  expect(form.form?.fields.map((f) => [f.id, f.text || f.selected[0]?.value])).toEqual([
    ["region", "eu"],
    ["greeting", "hi"],
  ]);
  flow.input({ type: "setValue", id: "greeting", value: "yo" });
  flow.input({ type: "primary" });
  expect(await flow.opened).toBeUndefined();
  expect((await handle.preferences("index")).values).toMatchObject({
    region: "eu",
    greeting: "yo",
  });
});

const installing: DependencyInstaller = async ({ cwd, onLog }) => {
  onLog?.("fetching example\n");
  const dir = join(cwd, "node_modules", "example");
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({ name: "example", version: "1.0.0", type: "module", main: "index.js" }),
  );
  await writeFile(join(dir, "index.js"), 'export default "Engine fixture";');
};
const withDependency = async (installer: DependencyInstaller) => {
  const made = await setup((manifest) => {
    manifest.dependencies = { example: "1" };
  }, installer);
  await writeFile(
    join(made.extensionDir, "src/index.tsx"),
    'import value from "example"; import { List } from "@raycast/api"; export default () => <List navigationTitle={value} />;',
  );
  return made;
};

test("launch flow: missing dependencies install behind an animated toast, then launch", async () => {
  let installs = 0;
  const { handle } = await withDependency(async (request) => {
    installs++;
    await installing(request);
  });
  const flow = startLaunchFlow(handle, "index", { views });
  const seen: string[] = [];
  flow.subscribe((view) => {
    if (view.feedback.toast)
      seen.push(`${view.feedback.toast.style}:${view.feedback.toast.message}`);
  });
  const opened = await flow.opened;
  expect(opened).toBeDefined();
  expect(installs).toBe(1);
  expect(seen).toContain("animated:fetching example");
  expect(await sceneText(opened!)).toContain("Engine fixture");
  await opened!.close();
});

test("launch flow: a failed install shows a failure toast whose Retry works", async () => {
  let attempts = 0;
  const { handle } = await withDependency(async (request) => {
    attempts++;
    if (attempts === 1) throw new Error("network is down");
    await installing(request);
  });
  const flow = startLaunchFlow(handle, "index", { views });
  const failed = await until(flow, toast("failure"));
  expect(failed.feedback.toast).toMatchObject({
    title: "Could not install dependencies",
    message: "network is down",
    actions: [{ title: "Retry" }],
  });
  flow.input({ type: "toastAction", index: 0 });
  const opened = await flow.opened;
  expect(attempts).toBe(2);
  expect(opened).toBeDefined();
  await opened!.close();
});

test("launch flow: cancelling at a failure toast ends the flow", async () => {
  const { handle } = await withDependency(async () => {
    throw new Error("nope");
  });
  const flow = startLaunchFlow(handle, "index", { views });
  await until(flow, toast("failure"));
  flow.input({ type: "back" });
  expect(await flow.opened).toBeUndefined();
});

test("launch flow: an unknown command rejects", async () => {
  const { handle } = await setup(() => {});
  await expect(startLaunchFlow(handle, "nope", { views }).opened).rejects.toThrow(
    "Unknown extension command",
  );
});
