import { afterEach, expect, test } from "bun:test";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, cp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { preferenceFile } from "@blastlauncher/host";
import {
  applyViewPatch,
  EMBEDDER_PROTOCOL_VERSION,
  type SceneNode,
  type SceneMessage,
  type ViewPatchOp,
} from "@blastlauncher/protocol";

const noop = () => {};
const nodePath = execFileSync("node", ["-p", "process.execPath"], { encoding: "utf8" }).trim();
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((clean) => clean()));
});
async function client(native = false, args: string[] = [], env: Record<string, string> = {}) {
  const dir = await mkdtemp(join(tmpdir(), "blast-serve-"));
  const child = spawn(
    nodePath,
    [
      resolve("packages/serve/src/main.ts"),
      ...(native ? ["--native"] : []),
      // The server defaults to auto installs; tests must never reach the network.
      ...(args.includes("--dependencies") ? [] : ["--dependencies", "manual"]),
      ...args,
    ],
    { env: { ...process.env, XDG_DATA_HOME: dir, ...env }, stdio: ["pipe", "pipe", "pipe"] },
  );
  const messages: Record<string, any>[] = [];
  const sessionStates = new Map<string, { view: any; revision: number }>();
  const rootStates = new Map<string, { view: any; revision: number }>();
  const sessionViewEvents: Array<{ session: string; view: any; revision: number; event: string }> =
    [];
  const rootViewEvents: Array<{ root: string; view: any; revision: number; event: string }> = [];
  let buffer = "",
    stderr = "",
    notify = noop;
  child.stdout.setEncoding("utf8").on("data", (chunk) => {
    buffer += chunk;
    for (;;) {
      const end = buffer.indexOf("\n");
      if (end < 0) break;
      const parsed = JSON.parse(buffer.slice(0, end)) as Record<string, any>;
      messages.push(parsed);
      if (parsed.type === "event") {
        if (parsed.event === "session.view") {
          const state = { view: parsed.view, revision: parsed.revision as number };
          sessionStates.set(parsed.session, state);
          sessionViewEvents.push({ session: parsed.session, ...state, event: parsed.event });
        } else if (parsed.event === "session.view.patch") {
          const prev = sessionStates.get(parsed.session);
          if (!prev)
            throw new Error(`session.view.patch before session.view for ${parsed.session}`);
          const next = applyViewPatch(
            prev.view,
            {
              revision: parsed.revision as number,
              baseRevision: parsed.baseRevision as number,
              ops: parsed.ops as ViewPatchOp[],
            },
            prev.revision,
          );
          const state = { view: next, revision: parsed.revision as number };
          sessionStates.set(parsed.session, state);
          sessionViewEvents.push({ session: parsed.session, ...state, event: parsed.event });
        } else if (parsed.event === "root.view") {
          const state = { view: parsed.view, revision: parsed.revision as number };
          rootStates.set(parsed.root, state);
          rootViewEvents.push({ root: parsed.root, ...state, event: parsed.event });
        } else if (parsed.event === "root.view.patch") {
          const prev = rootStates.get(parsed.root);
          if (!prev) throw new Error(`root.view.patch before root.view for ${parsed.root}`);
          const next = applyViewPatch(
            prev.view,
            {
              revision: parsed.revision as number,
              baseRevision: parsed.baseRevision as number,
              ops: parsed.ops as ViewPatchOp[],
            },
            prev.revision,
          );
          const state = { view: next, revision: parsed.revision as number };
          rootStates.set(parsed.root, state);
          rootViewEvents.push({ root: parsed.root, ...state, event: parsed.event });
        }
      }
      buffer = buffer.slice(end + 1);
    }
    notify();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const exited = new Promise<number | null>((done) => child.on("close", done));
  cleanups.push(async () => {
    child.kill("SIGKILL");
    await exited;
    await rm(dir, { recursive: true, force: true });
  });
  let sequence = 0;
  const send = (value: unknown) => child.stdin.write(JSON.stringify(value) + "\n");
  const waitFrom = async <T>(list: T[], predicate: (v: T) => boolean, ms = 8000) => {
    const timeout = setTimeout(() => notify(), ms);
    const deadline = Date.now() + ms;
    try {
      for (;;) {
        const index = list.findIndex(predicate);
        if (index >= 0) return list.splice(index, 1)[0]!;
        if (Date.now() >= deadline) throw new Error(`Timed out: ${stderr}`);
        await new Promise<void>((done) => {
          notify = done;
        });
      }
    } finally {
      clearTimeout(timeout);
    }
  };
  const wait = (predicate: (v: Record<string, any>) => boolean, ms = 8000) =>
    waitFrom(messages, predicate, ms);
  const waitSessionView = (
    session: string,
    match: (view: any) => boolean = () => true,
    ms = 8000,
  ) => waitFrom(sessionViewEvents, (e) => e.session === session && match(e.view), ms);
  const waitRootView = (root: string, match: (view: any) => boolean = () => true, ms = 8000) =>
    waitFrom(rootViewEvents, (e) => e.root === root && match(e.view), ms);
  const request = async (method: string, params: unknown = {}) => {
    const id = String(++sequence);
    send({ type: "request", id, method, params });
    return wait((v) => v.type === "response" && v.id === id);
  };
  return {
    dir,
    child,
    messages: () => messages,
    send,
    wait,
    waitSessionView,
    waitRootView,
    request,
    exited,
    async hello(capabilities: string[] = [], views?: unknown, scenes?: boolean) {
      send({
        type: "hello",
        protocol: EMBEDDER_PROTOCOL_VERSION,
        capabilities,
        ...(views === undefined ? {} : { views }),
        ...(scenes === undefined ? {} : { scenes }),
      });
      return wait((v) => v.type === "welcome");
    },
  };
}
function find(
  root: SceneNode | null,
  predicate: (node: SceneNode) => boolean,
): SceneNode | undefined {
  if (!root) return;
  if (predicate(root)) return root;
  for (const child of root.children) {
    const found = find(child, predicate);
    if (found) return found;
  }
}

test("handshake, version mismatch and malformed-line recovery", async () => {
  const c = await client();
  c.child.stdin.write("{broken\n");
  expect((await c.wait((v) => v.type === "error")).error.code).toBe("invalid_message");
  c.child.stdin.write(Buffer.from([0xc3, 0x28, 0x0a]));
  await c.wait((v) => v.type === "error");
  c.child.stdin.write("x".repeat(8 * 1024 * 1024 + 1) + "\n");
  expect((await c.wait((v) => v.type === "error")).error.message).toContain("8 MiB");
  expect((await c.hello()).catalog["clipboard.copy"].scope).toBe("grant");
  c.send({ type: "request", id: "bad", method: "session.event", params: { session: "no" } });
  await c.wait((v) => v.type === "error");
  c.child.stdin.end();
  expect(await c.exited).toBe(0);
  const mismatch = await client();
  mismatch.send({ type: "hello", protocol: 1, capabilities: [] });
  expect((await mismatch.wait((v) => v.type === "error")).error.code).toBe("version_mismatch");
  expect(await mismatch.exited).toBe(2);
});

test("welcome reports the running serve package version", async () => {
  const c = await client();
  const welcome = await c.hello();
  const manifest = JSON.parse(readFileSync(resolve("packages/serve/package.json"), "utf8")) as {
    version?: unknown;
  };
  expect(welcome.engine.version).toBe(
    typeof manifest.version === "string" ? manifest.version : "0.0.0-dev",
  );
  c.child.stdin.end();
  expect(await c.exited).toBe(0);
});

test("launch, scenes, events, capability forwarding and EOF shutdown", async () => {
  const c = await client(true);
  await c.hello(["clipboard.copy"], undefined, true);
  const opened = await c.request("extension.open", {
    dir: resolve("fixtures/extensions/hello-list"),
  });
  const extension = opened.result.extension;
  const launched = await c.request("extension.launch", { extension, command: "index" });
  const session = launched.result.session;
  const scene = (await c.wait((v) => v.event === "session.scene" && v.session === session))
    .scene as SceneMessage;
  const action = find(scene.root, (n) => n.props.title === "Pin apple")!;
  await c.request("session.event", {
    session,
    node: action.id,
    handler: (action.props.onAction as { $handler: string }).$handler,
    args: [],
  });
  const updated = await c.wait(
    (v) =>
      v.event === "session.scene" &&
      !!find(v.scene.root, (n) => n.props.navigationTitle === "pinned apple"),
  );
  const copy = find(updated.scene.root, (n) => n.type === "Action.CopyToClipboard")!;
  await c.request("session.event", {
    session,
    node: copy.id,
    handler: (copy.props.onAction as { $handler: string }).$handler,
    args: [],
  });
  const capability = await c.wait((v) => v.type === "capability.request");
  expect(capability.name).toBe("clipboard.copy");
  expect(capability.session).toBe(session);
  c.send({ type: "capability.result", id: capability.id, ok: true, value: null });
  await c.wait(
    (v) =>
      v.event === "session.scene" &&
      !!find(v.scene.root, (n) => n.props.navigationTitle === "pinned apple copied apple"),
  );
  c.child.stdin.end();
  await c.wait((v) => v.event === "session.exited");
  expect(await c.exited).toBe(0);
});

test("launch reports typed missing dependencies and accepts the install flag", async () => {
  const c = await client();
  await c.hello();
  const missing = await c.request("extension.open", {
    dir: resolve("fixtures/extensions/missing-dependency"),
  });
  const extension = missing.result.extension;
  const failed = await c.request("extension.launch", {
    extension,
    command: "index",
    installDependencies: false,
  });
  expect(failed.error).toMatchObject({
    code: "missing_dependencies",
    data: {
      unresolved: ["@blast-missing/scoped", "blast-unavailable"],
      installable: false,
      pinned: false,
    },
  });
  c.child.stdin.end();
  expect(await c.exited).toBe(0);
});

test("serve reports dependencies imported from a non-entry source file", async () => {
  const c = await client();
  const extensionDir = join(c.dir, "nested-import");
  await mkdir(join(extensionDir, "src/lib"), { recursive: true });
  await writeFile(
    join(extensionDir, "package.json"),
    JSON.stringify({ name: "nested-import", commands: [{ name: "index", mode: "view" }] }),
  );
  await writeFile(
    join(extensionDir, "src/index.tsx"),
    'import { value } from "./lib/api"; import { List } from "@raycast/api"; export default () => <List navigationTitle={value} />;',
  );
  await writeFile(
    join(extensionDir, "src/lib/api.ts"),
    'import "nested-missing-package"; export const value = "x";',
  );
  await c.hello();
  const opened = await c.request("extension.open", { dir: extensionDir });
  const failed = await c.request("extension.launch", {
    extension: opened.result.extension,
    command: "index",
  });
  expect(failed.error).toMatchObject({
    code: "missing_dependencies",
    data: {
      unresolved: ["nested-missing-package"],
      installable: false,
      pinned: false,
    },
  });
  c.child.stdin.end();
  expect(await c.exited).toBe(0);
});

test("serve auto dependency policy is accepted", async () => {
  const c = await client(false, ["--dependencies", "auto"]);
  await c.hello();
  await c.request("engine.shutdown");
  expect(await c.exited).toBe(0);
});

test("undeclared capability is denied and logged", async () => {
  const c = await client();
  await c.hello([], undefined, true);
  const {
    result: { extension },
  } = await c.request("extension.open", { dir: resolve("fixtures/extensions/hello-list") });
  const {
    result: { session },
  } = await c.request("extension.launch", { extension, command: "index" });
  const { scene } = await c.wait((v) => v.event === "session.scene");
  const copy = find(scene.root, (n) => n.type === "Action.CopyToClipboard")!;
  await c.request("session.event", {
    session,
    node: copy.id,
    handler: (copy.props.onAction as { $handler: string }).$handler,
    args: [],
  });
  const log = await c.wait(
    (v) => v.event === "session.log" && JSON.stringify(v.log).includes("denied"),
  );
  expect(JSON.stringify(log)).toContain("clipboard.copy");
  await c.request("engine.shutdown");
  expect(await c.exited).toBe(0);
});

test("manifest watch, missing values, preferences, dependencies and close", async () => {
  const c = await client();
  await c.hello();
  const dir = join(c.dir, "extension");
  await cp(resolve("fixtures/extensions/engine-handle"), dir, { recursive: true });
  const file = join(dir, "package.json");
  const manifest = JSON.parse(await readFile(file, "utf8"));
  manifest.preferences = [{ name: "token", type: "textfield", title: "Token", required: true }];
  manifest.commands[0].arguments = [{ name: "query", type: "text", required: true }];
  await writeFile(file, JSON.stringify(manifest));
  const {
    result: { extension },
  } = await c.request("extension.open", { dir });
  expect((await c.request("extension.manifest", { extension })).result.name).toBe("engine-handle");
  expect((await c.request("extension.dependencies.check", { extension })).ok).toBe(true);
  expect((await c.request("extension.dependencies.install", { extension })).ok).toBe(true);
  const missing = await c.request("extension.launch", { extension, command: "index" });
  expect(missing.error.code).toBe("missing_values");
  expect(missing.error.data.arguments).toEqual(["query"]);
  expect(
    (await c.request("extension.preferences", { extension, command: "index" })).result.missing[0]
      .name,
  ).toBe("token");
  await c.request("extension.savePreferences", {
    extension,
    command: "index",
    values: { token: "fixture" },
  });
  expect(
    (
      await c.request("extension.launch", {
        extension,
        command: "index",
        argumentValues: { query: "test" },
        launchContext: { answer: 42 },
      })
    ).ok,
  ).toBe(true);
  await c.request("extension.watch", { extension });
  // FSEvents can drop or delay a write made right after the watch starts, most
  // often when fseventsd is busy; rewrite until the event arrives, as a user
  // saving again would, instead of trusting the first write.
  const saveUntil = async (text: string, event: string) => {
    for (let attempt = 1; ; attempt++) {
      await writeFile(file, text);
      try {
        return await c.wait((v) => v.event === event, 1500);
      } catch (error) {
        if (attempt >= 8) throw error;
      }
    }
  };
  manifest.title = "Changed";
  expect((await saveUntil(JSON.stringify(manifest), "manifest.changed")).manifest.title).toBe(
    "Changed",
  );
  await saveUntil("invalid", "manifest.error");
  await c.request("extension.unwatch", { extension });
  await c.request("extension.close", { extension });
  await c.wait((v) => v.event === "session.exited");
  expect((await c.request("extension.manifest", { extension })).ok).toBe(false);
  c.child.stdin.end();
  expect(await c.exited).toBe(0);
}, 30_000);

test("capability progress and abort, late results, and session close", async () => {
  const c = await client();
  await c.hello(["ai.ask"], undefined, true);
  const dir = join(c.dir, "stream");
  await cp(resolve("fixtures/extensions/engine-handle"), dir, { recursive: true });
  await writeFile(
    join(dir, "src/index.tsx"),
    `
    import { AI, Action, ActionPanel, List } from "@raycast/api";
    import { useState } from "react";
    const controller = new AbortController();
    export default function Command() {
      const [text, setText] = useState("waiting");
      return <List navigationTitle={text}><List.Item title="stream" actions={<ActionPanel>
        <Action title="Start" onAction={() => {
          const work = AI.ask("test", {signal: controller.signal});
          work.on("data", setText); void work.catch(() => setText("cancelled"));
        }} />
        <Action title="Abort" onAction={() => controller.abort()} />
      </ActionPanel>} /></List>;
    }
  `,
  );
  const {
    result: { extension },
  } = await c.request("extension.open", { dir });
  const {
    result: { session },
  } = await c.request("extension.launch", { extension, command: "index" });
  const { scene } = await c.wait((v) => v.event === "session.scene");
  const start = find(scene.root, (n) => n.props.title === "Start")!;
  await c.request("session.event", {
    session,
    node: start.id,
    handler: (start.props.onAction as { $handler: string }).$handler,
    args: [],
  });
  const capability = await c.wait((v) => v.type === "capability.request");
  c.send({ type: "capability.progress", id: capability.id, value: "chunk" });
  const updated = await c.wait(
    (v) =>
      v.event === "session.scene" &&
      !!find(v.scene.root, (n) => n.props.navigationTitle === "chunk"),
  );
  const abort = find(updated.scene.root, (n) => n.props.title === "Abort")!;
  await c.request("session.event", {
    session,
    node: abort.id,
    handler: (abort.props.onAction as { $handler: string }).$handler,
    args: [],
  });
  expect((await c.wait((v) => v.type === "capability.cancel")).id).toBe(capability.id);
  c.send({ type: "capability.result", id: capability.id, ok: true, value: "late" });
  await c.request("session.close", { session });
  await c.wait((v) => v.event === "session.exited");
  c.child.stdin.end();
  expect(await c.exited).toBe(0);
});

async function viewExtension(c: Awaited<ReturnType<typeof client>>, source: string) {
  const dir = join(c.dir, "views");
  await cp(resolve("fixtures/extensions/engine-handle"), dir, { recursive: true });
  await writeFile(join(dir, "src/index.tsx"), source);
  const {
    result: { extension },
  } = await c.request("extension.open", { dir });
  return extension as string;
}

test("views opt-in ranks rows, dispatches primary and closes on the quit effect", async () => {
  const c = await client();
  await c.hello();
  const extension = await viewExtension(
    c,
    `
    import { Action, ActionPanel, List } from "@raycast/api";
    import { useState } from "react";
    export default function Command() {
      const [title, setTitle] = useState("fruits");
      return <List navigationTitle={title}>{["pineapple", "apple", "banana"].map(fruit =>
        <List.Item key={fruit} id={fruit} title={fruit} actions={<ActionPanel>
          <Action title="Pin" onAction={() => setTitle("pinned " + fruit)} />
        </ActionPanel>} />
      )}</List>;
    }
  `,
  );
  const {
    result: { session },
  } = await c.request("extension.launch", {
    extension,
    command: "index",
    views: { platform: "macOS" },
  });
  const first = await c.waitSessionView(session);
  expect(first.event).toBe("session.view");
  expect(first.revision).toBe(1);
  expect(first.view.rows.map((row: any) => row.title)).toEqual(["pineapple", "apple", "banana"]);
  expect(first.view.primary.shortcut).toBe("↵");
  expect(
    (await c.request("session.input", { session, input: { type: "search", text: "apple" } }))
      .result,
  ).toBeNull();
  const ranked = await c.waitSessionView(session, (view) => view.search.text === "apple");
  expect(ranked.event).toBe("session.view.patch");
  expect(ranked.revision).toBe(2);
  expect(ranked.view.rows.map((row: any) => row.title)).toEqual(["apple", "pineapple"]);
  // Drain earlier view events from the raw message buffer before checking no-op repeat.
  const beforeRepeat = c.messages().length;
  const repeat = await c.request("session.input", {
    session,
    input: { type: "search", text: "apple" },
  });
  expect(repeat.ok).toBe(true);
  expect(repeat.result).toBeNull();
  expect(
    c
      .messages()
      .slice(beforeRepeat)
      .some((v) => v.event === "session.view" || v.event === "session.view.patch"),
  ).toBe(false);
  expect(
    (await c.request("session.input", { session, input: { type: "select", id: "apple" } })).ok,
  ).toBe(true);
  await c.request("session.input", { session, input: { type: "primary" } });
  const updated = await c.waitSessionView(session, (view) => view.title === "pinned apple");
  expect(updated.session).toBe(session);
  expect(c.messages().some((v) => v.event === "session.scene")).toBe(false);
  await c.request("session.input", { session, input: { type: "back" } });
  await c.wait((v) => v.event === "session.exited" && v.session === session);
  expect((await c.request("session.input", { session, input: { type: "primary" } })).ok).toBe(
    false,
  );
  const plain = await c.request("extension.launch", { extension, command: "index" });
  expect(
    (
      await c.request("session.input", {
        session: plain.result.session,
        input: { type: "primary" },
      })
    ).ok,
  ).toBe(false);
  await c.request("engine.shutdown");
  expect(await c.exited).toBe(0);
}, 20_000);

const iconList = `
  import { List } from "@raycast/api";
  export default () => <List><List.Item id="a" title="a" icon={{ source: "icon.png", mask: "circle" }} /></List>;
`;

test("hello views give every launch views and carry drawable icons", async () => {
  const c = await client();
  await c.hello([], { platform: "Linux", appearance: "dark" });
  const extension = await viewExtension(c, iconList);
  const {
    result: { session },
  } = await c.request("extension.launch", { extension, command: "index" });
  const view = await c.waitSessionView(session);
  expect(view.view.rows[0]).toMatchObject({
    iconMask: "circle",
    iconSource: { kind: "file", path: join(c.dir, "views", "assets", "icon.png") },
  });
  expect((await c.request("session.input", { session, input: { type: "primary" } })).ok).toBe(true);
  await c.request("engine.shutdown");
  expect(await c.exited).toBe(0);
}, 20_000);

test("a launch's own views win over the hello default and views false keeps scenes only", async () => {
  const off = await client();
  await off.hello([], false, true);
  const offExtension = await viewExtension(off, iconList);
  const plain = await off.request("extension.launch", {
    extension: offExtension,
    command: "index",
  });
  await off.wait((v) => v.event === "session.scene" && v.session === plain.result.session);
  expect(
    (
      await off.request("session.input", {
        session: plain.result.session,
        input: { type: "primary" },
      })
    ).ok,
  ).toBe(false);
  const own = await off.request("extension.launch", {
    extension: offExtension,
    command: "index",
    views: { platform: "macOS" },
  });
  await off.waitSessionView(own.result.session);
  expect(
    off.messages().some((v) => v.event === "session.view" && v.session === plain.result.session),
  ).toBe(false);
  await off.request("engine.shutdown");
  expect(await off.exited).toBe(0);
}, 20_000);

test("view search timers forward only the latest throttled text once", async () => {
  const c = await client();
  await c.hello();
  const extension = await viewExtension(
    c,
    `
    import { Action, ActionPanel, List } from "@raycast/api";
    import { useState } from "react";
    const calls = [];
    export default function Command() {
      const [title, setTitle] = useState("waiting");
      return <List navigationTitle={title} throttle onSearchTextChange={text => {
        calls.push(text); setTitle(text + ":" + calls.length);
      }}><List.Item title="item" actions={<ActionPanel>
        <Action title="Check" onAction={() => setTimeout(() => console.log(JSON.stringify(calls)), 400)} />
      </ActionPanel>} /></List>;
    }
  `,
  );
  const {
    result: { session },
  } = await c.request("extension.launch", {
    extension,
    command: "index",
    views: { platform: "Linux" },
  });
  await c.waitSessionView(session);
  const started = performance.now();
  for (const [id, text] of [
    ["search-a", "a"],
    ["search-ap", "ap"],
  ])
    c.send({
      type: "request",
      id,
      method: "session.input",
      params: { session, input: { type: "search", text } },
    });
  const updated = await c.waitSessionView(session, (view) => view.title === "ap:1");
  expect(updated.view.search.text).toBe("ap");
  expect(performance.now() - started).toBeGreaterThanOrEqual(200);
  await c.request("session.input", { session, input: { type: "primary" } });
  const log = await c.wait((v) => v.event === "session.log");
  expect(log.log.message).toBe('["ap"]');
  // Closing with another deferred input must discard the pending timer.
  await c.request("session.input", { session, input: { type: "search", text: "pending" } });
  await c.request("session.close", { session });
  await c.wait((v) => v.event === "session.exited" && v.session === session);
  await c.request("engine.shutdown");
  expect(await c.exited).toBe(0);
}, 20_000);

test("serve views edit and submit forms without raw events", async () => {
  const c = await client();
  await c.hello();
  const extension = await viewExtension(
    c,
    `
    import { Action, ActionPanel, Form } from "@raycast/api";
    import { useState } from "react";
    export default function Command() {
      const [title, setTitle] = useState("Edit form");
      return <Form navigationTitle={title} actions={<ActionPanel>
        <Action.SubmitForm onSubmit={values => setTitle(JSON.stringify({...values, secret: values.secret ? "<set>" : "<unset>"}))} />
      </ActionPanel>}>
        <Form.TextField id="name" />
        <Form.PasswordField id="secret" />
        <Form.Checkbox id="agree" label="Agree" />
      </Form>;
    }
  `,
  );
  const {
    result: { session },
  } = await c.request("extension.launch", {
    extension,
    command: "index",
    views: { platform: "Linux" },
  });
  const first = await c.waitSessionView(session, (view) => Boolean(view.form));
  const [name, secret, agree] = first.view.form.fields;
  const input = async (action: unknown) =>
    expect((await c.request("session.input", { session, input: action })).ok).toBe(true);
  await input({ type: "setValue", id: name.id, value: "Ada" });
  await c.waitSessionView(session, (view) => view.form?.fields[0].value === "Ada");
  await input({ type: "focusNext" });
  await input({ type: "setValue", id: secret.id, value: "hidden-password" });
  const masked = await c.waitSessionView(session, (view) => Boolean(view.form?.fields[1].hasValue));
  expect(JSON.stringify(masked)).not.toContain("hidden-password");
  await input({ type: "toggle", id: agree.id });
  await c.waitSessionView(session, (view) => Boolean(view.form?.fields[2].checked));
  await input({ type: "submit" });
  const submitted = await c.waitSessionView(session, (view) => view.title.includes('"name":"Ada"'));
  expect(JSON.parse(submitted.view.title)).toEqual({ name: "Ada", secret: "<set>", agree: true });
  await c.request("engine.shutdown");
  expect(await c.exited).toBe(0);
}, 20_000);

test("launch forwards bundleTimeoutMs and the server remains usable after a timeout", async () => {
  const c = await client();
  await c.hello([]);
  const opened = await c.request("extension.open", {
    dir: resolve("fixtures/extensions/hello-list"),
  });
  const extension = opened.result.extension;
  const failed = await c.request("extension.launch", {
    extension,
    command: "index",
    bundleTimeoutMs: 1,
  });
  expect(failed.ok).toBe(false);
  expect(failed.error.code).toBe("BUNDLE_TIMEOUT");
  expect(failed.error.data).toMatchObject({ command: "index", timeoutMs: 1 });
  expect(failed.error.message).toContain("timed out after 1 ms");
  const launched = await c.request("extension.launch", {
    extension,
    command: "index",
    bundleTimeoutMs: 0,
  });
  expect(launched.ok).toBe(true);
  await c.request("engine.shutdown");
  expect(await c.exited).toBe(0);
}, 15000);

const ids = (view: any) => view.rows.filter((r: any) => r.kind === "item").map((r: any) => r.id);

test("root.open lists every opened extension's commands, launches one and resumes when it closes", async () => {
  const c = await client();
  await c.hello();
  for (const name of ["hello-list", "selection"])
    await c.request("extension.open", { dir: resolve(`fixtures/extensions/${name}`) });
  expect((await c.request("root.open", {})).error.message).toContain("needs views");
  const opened = await c.request("root.open", { views: { platform: "Linux" } });
  const root = opened.result.root;
  const listed = await c.waitRootView(root);
  expect(ids(listed.view)).toEqual(["hello-list:index", "selection:index"]);
  expect(listed.view.title).toBe("Commands");

  const input = (value: unknown) => c.request("root.input", { root, input: value });
  await input({ type: "search", text: "selection" });
  const narrowed = await c.waitRootView(root, (view) => view.search.text === "selection");
  expect(ids(narrowed.view)).toEqual(["selection:index"]);
  await input({ type: "search", text: "hello" });
  await c.waitRootView(root, (view) => ids(view).join() === "hello-list:index");
  await input({ type: "primary" });

  const launched = await c.wait((v) => v.event === "root.launched");
  expect(launched.root).toBe(root);
  const session = launched.session;
  const command = await c.waitSessionView(session, (view) =>
    view.rows.some((r: any) => r.title === "apple"),
  );
  expect(command.view.title).toBe("hello-list");

  // The command is an ordinary session: back at its root closes it, then the root returns.
  await c.request("session.input", { session, input: { type: "back" } });
  await c.wait((v) => v.event === "session.exited" && v.session === session);
  const resumed = await c.waitRootView(root, (view) => ids(view).length === 2);
  expect(resumed.view.search.text).toBe("");

  expect((await c.request("root.close", { root })).ok).toBe(true);
  expect((await c.request("root.input", { root, input: { type: "primary" } })).ok).toBe(false);
  await c.request("engine.shutdown");
  expect(await c.exited).toBe(0);
}, 30_000);

test("root.open uses the hello views and follows extensions opened afterwards", async () => {
  const c = await client();
  await c.hello([], { platform: "Linux", appearance: "dark" });
  const { result } = await c.request("root.open", {});
  const empty = await c.waitRootView(result.root);
  expect(empty.view.rows).toEqual([]);
  await c.request("extension.open", { dir: resolve("fixtures/extensions/hello-list") });
  const added = await c.waitRootView(result.root, (view) => view.rows.length > 0);
  expect(added.view.selectedId).toBe("hello-list:index");
  await c.request("engine.shutdown");
  expect(await c.exited).toBe(0);
});

const linux = { platform: "Linux" };

async function promptExtension(c: Awaited<ReturnType<typeof client>>) {
  const dir = join(c.dir, "extension");
  await cp(resolve("fixtures/extensions/engine-handle"), dir, { recursive: true });
  const file = join(dir, "package.json");
  const manifest = JSON.parse(await readFile(file, "utf8"));
  manifest.preferences = [{ name: "token", type: "password", title: "Token", required: true }];
  manifest.commands[0].arguments = [{ name: "query", type: "text", required: true }];
  await writeFile(file, JSON.stringify(manifest));
  const { result } = await c.request("extension.open", { dir });
  return result.extension as string;
}

test("launch with prompts asks for missing values as a form, saves them and streams the command", async () => {
  const c = await client();
  await c.hello([], linux);
  const extension = await promptExtension(c);
  // Without the flag the launch still fails the way it always did.
  expect((await c.request("extension.launch", { extension, command: "index" })).error.code).toBe(
    "missing_values",
  );
  const launched = await c.request("extension.launch", {
    extension,
    command: "index",
    prompts: true,
  });
  expect(launched.ok).toBe(true);
  const session = launched.result.session;
  const form = await c.waitSessionView(session, (view) => view.kind === "form");
  expect(form.view.form.fields.map((f: any) => [f.id, f.type])).toEqual([
    ["token", "Form.PasswordField"],
    ["argument:query", "Form.TextField"],
  ]);
  expect(form.view.navigation.canGoBack).toBe(true);
  const input = (value: unknown) => c.request("session.input", { session, input: value });
  await input({ type: "submit" });
  const invalid = await c.waitSessionView(session, (view) => !!view.form?.fields[0]?.error);
  expect(invalid.view.form.fields.map((f: any) => f.error)).toEqual(["Required", "Required"]);
  await input({ type: "setValue", id: "token", value: "hunter2" });
  await input({ type: "setValue", id: "argument:query", value: "hello" });
  const typed = await c.waitSessionView(session, (view) => Boolean(view.form?.fields[0]?.hasValue));
  expect(JSON.stringify(typed)).not.toContain("hunter2");
  await input({ type: "primary" });
  // Same session id from here on: the command's own list view.
  const command = await c.waitSessionView(
    session,
    (view) => view.kind === "list" && view.rows.length > 0,
  );
  expect(command.view.title).toBe("Engine fixture");
  expect(command.view.rows[0].title).toContain("hello");
  const saved = JSON.parse(
    await readFile(preferenceFile(join(c.dir, "blast"), "engine-handle"), "utf8"),
  );
  expect(saved.extension.token).toBe("hunter2");
  // The launch does not stay in the prompt: back now closes the command.
  await input({ type: "back" });
  expect((await c.wait((v) => v.event === "session.exited" && v.session === session)).code).toBe(0);
  await c.request("engine.shutdown");
  expect(await c.exited).toBe(0);
}, 30_000);

test("launch with prompts: back on the form ends the session; prompts need views", async () => {
  const c = await client();
  await c.hello();
  const extension = await promptExtension(c);
  expect(
    (await c.request("extension.launch", { extension, command: "index", prompts: true })).error
      .message,
  ).toContain("need views");
  const { result } = await c.request("extension.launch", {
    extension,
    command: "index",
    prompts: true,
    views: linux,
  });
  await c.waitSessionView(result.session, (view) => view.kind === "form");
  await c.request("session.input", { session: result.session, input: { type: "back" } });
  expect((await c.wait((v) => v.event === "session.exited")).code).toBe(0);
  c.child.stdin.end();
  expect(await c.exited).toBe(0);
});

async function fakeNpm(dir: string) {
  const bin = join(dir, "fake-bin");
  await mkdir(bin, { recursive: true });
  // `npm install` for the dependency installer, offline: fails once when asked to.
  await writeFile(
    join(bin, "npm"),
    `#!/bin/sh
echo "fetching example"
if [ -n "$FAKE_NPM_FAIL_ONCE" ] && [ ! -e "$FAKE_NPM_FAIL_ONCE" ]; then
  touch "$FAKE_NPM_FAIL_ONCE"; echo "network is down" >&2; exit 1
fi
mkdir -p node_modules/example
echo '{"name":"example","version":"1.0.0","type":"module","main":"index.js"}' > node_modules/example/package.json
echo 'export default "installed";' > node_modules/example/index.js
`,
    { mode: 0o755 },
  );
  return bin;
}
async function dependencyExtension(c: Awaited<ReturnType<typeof client>>) {
  const dir = join(c.dir, "needs-example");
  await mkdir(join(dir, "src"), { recursive: true });
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({
      name: "needs-example",
      dependencies: { example: "1" },
      commands: [{ name: "index", mode: "view" }],
    }),
  );
  await writeFile(
    join(dir, "src/index.tsx"),
    'import value from "example"; import { List } from "@raycast/api"; export default () => <List navigationTitle={value} />;',
  );
  return (await c.request("extension.open", { dir })).result.extension as string;
}
const withFakeNpm = async (failOnce: boolean) => {
  const base = await mkdtemp(join(tmpdir(), "blast-fake-npm-"));
  cleanups.push(() => rm(base, { recursive: true, force: true }));
  return {
    PATH: `${await fakeNpm(base)}:${process.env.PATH}`,
    ...(failOnce ? { FAKE_NPM_FAIL_ONCE: join(base, "failed-once") } : {}),
  };
};

test("launch with prompts installs missing dependencies behind a progress toast, then streams the view", async () => {
  const c = await client(false, [], await withFakeNpm(false));
  await c.hello([], linux);
  const extension = await dependencyExtension(c);
  const { result } = await c.request("extension.launch", {
    extension,
    command: "index",
    prompts: true,
  });
  const progress = await c.waitSessionView(
    result.session,
    (view) => view.feedback.toast?.style === "animated",
  );
  expect(progress.view.feedback.toast.title).toBe("Installing dependencies");
  const command = await c.waitSessionView(result.session, (view) => view.title === "installed");
  expect(command.view.kind).toBe("list");
  await c.request("engine.shutdown");
  expect(await c.exited).toBe(0);
}, 30_000);

test("launch with prompts: a failed install shows a failure toast whose Retry installs again", async () => {
  const c = await client(false, [], await withFakeNpm(true));
  await c.hello([], linux);
  const extension = await dependencyExtension(c);
  const { result } = await c.request("extension.launch", {
    extension,
    command: "index",
    prompts: true,
  });
  const failed = await c.waitSessionView(
    result.session,
    (view) => view.feedback.toast?.style === "failure",
  );
  expect(failed.view.feedback.toast).toMatchObject({
    title: "Could not install dependencies",
    message: expect.stringContaining("npm install failed"),
    actions: [{ title: "Retry" }],
  });
  await c.request("session.input", {
    session: result.session,
    input: { type: "toastAction", index: 0 },
  });
  await c.waitSessionView(result.session, (view) => view.title === "installed");
  await c.request("engine.shutdown");
  expect(await c.exited).toBe(0);
}, 30_000);

test("extension.configure streams the preferences form and saves without launching", async () => {
  const c = await client();
  await c.hello([], linux);
  const extension = await promptExtension(c);
  const { result } = await c.request("extension.configure", { extension, command: "index" });
  const form = await c.waitSessionView(result.session, (view) => view.kind === "form");
  expect(form.view.title).toBe("Configure index");
  expect(form.view.form.fields.map((f: any) => f.id)).toEqual(["token"]);
  await c.request("session.input", {
    session: result.session,
    input: { type: "setValue", id: "token", value: "kept" },
  });
  await c.request("session.input", { session: result.session, input: { type: "primary" } });
  expect((await c.wait((v) => v.event === "session.exited")).code).toBe(0);
  const saved = await c.request("extension.preferences", { extension, command: "index" });
  expect(saved.result.values.token).toBe("kept");
  await c.request("engine.shutdown");
  expect(await c.exited).toBe(0);
});

test("extension.configure shows only the requested preference scope", async () => {
  const c = await client();
  await c.hello([], linux);
  const dir = join(c.dir, "scoped");
  await cp(resolve("fixtures/extensions/engine-handle"), dir, { recursive: true });
  const file = join(dir, "package.json");
  const manifest = JSON.parse(await readFile(file, "utf8"));
  manifest.preferences = [{ name: "token", type: "password", title: "Token", required: false }];
  manifest.commands[0].preferences = [
    { name: "mode", type: "textfield", title: "Mode", required: false },
  ];
  await writeFile(file, JSON.stringify(manifest));
  const extension = (await c.request("extension.open", { dir })).result.extension as string;
  const fields = async (scope?: "extension" | "command") => {
    const { result } = await c.request("extension.configure", {
      extension,
      command: "index",
      ...(scope ? { scope } : {}),
    });
    const form = await c.waitSessionView(result.session, (view) => view.kind === "form");
    await c.request("session.input", { session: result.session, input: { type: "primary" } });
    await c.wait((v) => v.event === "session.exited" && v.session === result.session);
    return form.view.form.fields.map((f: any) => f.id);
  };
  expect(await fields("extension")).toEqual(["token"]);
  expect(await fields("command")).toEqual(["mode"]);
  expect(await fields()).toEqual(["token", "mode"]);
  await c.request("engine.shutdown");
  expect(await c.exited).toBe(0);
}, 30_000);

test("root.open launches with prompts and Configure Command opens the preferences session", async () => {
  const c = await client();
  await c.hello([], linux);
  await promptExtension(c);
  const { result } = await c.request("root.open", {});
  const root = result.root;
  await c.waitRootView(root, (view) => ids(view).length === 1);
  const input = (value: unknown) => c.request("root.input", { root, input: value });
  await input({ type: "primary" });
  const launched = await c.wait((v) => v.event === "root.launched");
  const form = await c.waitSessionView(launched.session, (view) => view.kind === "form");
  expect(form.view.form.fields.map((f: any) => f.id)).toEqual(["token", "argument:query"]);
  await c.request("session.input", { session: launched.session, input: { type: "back" } });
  await c.wait((v) => v.event === "session.exited" && v.session === launched.session);

  await input({ type: "key", key: { name: ",", ctrl: true, shift: true } });
  const configure = await c.wait((v) => v.event === "root.launched");
  const prefs = await c.waitSessionView(configure.session, (view) => view.kind === "form");
  expect(prefs.view.title).toBe("Configure index");
  await c.request("engine.shutdown");
  expect(await c.exited).toBe(0);
}, 30_000);

test("protocol 2 streams full view then patches, honors resync, skips no-ops, and gates scenes", async () => {
  const c = await client();
  const welcome = await c.hello([], { platform: "macOS" });
  expect(welcome.protocol).toBe(2);

  const opened = await c.request("extension.open", {
    dir: resolve("fixtures/extensions/hello-list"),
  });
  const extension = opened.result.extension as string;
  const launched = await c.request("extension.launch", { extension, command: "index" });
  const session = launched.result.session as string;

  // First view is full with revision 1.
  const firstRaw = await c.wait((v) => v.event === "session.view" && v.session === session);
  expect(firstRaw.revision).toBe(1);
  const firstId = firstRaw.view.rows[0].id as string;
  const secondId = firstRaw.view.rows[1].id as string;
  expect(firstRaw.view.rows[0].title).toBe("apple");
  expect(firstRaw.view.selectedId).toBe(firstId);

  // Moving selection down sends a patch with revision 2, baseRevision 1.
  await c.request("session.input", { session, input: { type: "move", direction: "down" } });
  const patch1 = await c.wait((v) => v.event === "session.view.patch" && v.session === session);
  expect(patch1.revision).toBe(2);
  expect(patch1.baseRevision).toBe(1);
  const afterMove = applyViewPatch<any>(
    firstRaw.view,
    { revision: patch1.revision, baseRevision: patch1.baseRevision, ops: patch1.ops },
    1,
  );
  expect(afterMove.selectedId).toBe(secondId);

  // An update that changes nothing (selecting already-selected row) sends nothing and
  // does not consume a revision.
  const noopRes = await c.request("session.input", {
    session,
    input: { type: "select", id: secondId },
  });
  expect(noopRes.ok).toBe(true);
  expect(
    c
      .messages()
      .some(
        (v) =>
          v.session === session && (v.event === "session.view" || v.event === "session.view.patch"),
      ),
  ).toBe(false);

  // Next real change gets revision 3, baseRevision 2 (no gap from the no-op).
  await c.request("session.input", { session, input: { type: "move", direction: "up" } });
  const patch2 = await c.wait((v) => v.event === "session.view.patch" && v.session === session);
  expect(patch2.revision).toBe(3);
  expect(patch2.baseRevision).toBe(2);
  const backToApple = applyViewPatch<any>(
    afterMove,
    { revision: patch2.revision, baseRevision: patch2.baseRevision, ops: patch2.ops },
    2,
  );
  expect(backToApple.selectedId).toBe(firstId);

  // session.resync yields a full session.view with the next revision (4).
  expect((await c.request("session.resync", { session })).result).toBeNull();
  const resynced = await c.wait((v) => v.event === "session.view" && v.session === session);
  expect(resynced.revision).toBe(4);
  expect(resynced.view).toEqual(backToApple);

  // Subsequent updates continue patching from revision 4 -> 5.
  await c.request("session.input", { session, input: { type: "move", direction: "down" } });
  const patch3 = await c.wait((v) => v.event === "session.view.patch" && v.session === session);
  expect(patch3.revision).toBe(5);
  expect(patch3.baseRevision).toBe(4);

  // Root views follow the same full -> patch -> resync contract.
  const rootOpen = await c.request("root.open", {});
  const root = rootOpen.result.root as string;
  const rootFirst = await c.wait((v) => v.event === "root.view" && v.root === root);
  expect(rootFirst.revision).toBe(1);
  await c.request("root.input", { root, input: { type: "search", text: "hello" } });
  const rootPatch = await c.wait((v) => v.event === "root.view.patch" && v.root === root);
  expect(rootPatch.revision).toBe(2);
  expect(rootPatch.baseRevision).toBe(1);
  expect((await c.request("root.resync", { root })).result).toBeNull();
  const rootResync = await c.wait((v) => v.event === "root.view" && v.root === root);
  expect(rootResync.revision).toBe(3);
  expect(rootResync.view.search.text).toBe("hello");

  // No session.scene arrived because hello did not pass scenes: true.
  expect(c.messages().some((v) => v.event === "session.scene")).toBe(false);

  // Opting into scenes: false also suppresses session.scene.
  await c.request("engine.shutdown");
  expect(await c.exited).toBe(0);

  const noScenes = await client();
  await noScenes.hello([], { platform: "macOS" }, false);
  const ext2 = (
    await noScenes.request("extension.open", { dir: resolve("fixtures/extensions/hello-list") })
  ).result.extension;
  const sess2 = (await noScenes.request("extension.launch", { extension: ext2, command: "index" }))
    .result.session;
  await noScenes.wait((v) => v.event === "session.view" && v.session === sess2);
  expect(noScenes.messages().some((v) => v.event === "session.scene")).toBe(false);
  await noScenes.request("engine.shutdown");
  expect(await noScenes.exited).toBe(0);
}, 30_000);
