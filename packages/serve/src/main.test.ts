import { afterEach, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { mkdtemp, cp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import type { SceneNode, SceneMessage } from "@blastlauncher/protocol";

const noop = () => {};
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((clean) => clean()));
});
async function client(native = false) {
  const dir = await mkdtemp(join(tmpdir(), "blast-serve-"));
  const child = spawn(
    "node",
    [resolve("packages/serve/src/main.ts"), ...(native ? ["--native"] : [])],
    { env: { ...process.env, XDG_DATA_HOME: dir }, stdio: ["pipe", "pipe", "pipe"] },
  );
  const messages: Record<string, any>[] = [];
  let buffer = "",
    stderr = "",
    notify = noop;
  child.stdout.setEncoding("utf8").on("data", (chunk) => {
    buffer += chunk;
    for (;;) {
      const end = buffer.indexOf("\n");
      if (end < 0) break;
      messages.push(JSON.parse(buffer.slice(0, end)));
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
  const wait = async (predicate: (v: Record<string, any>) => boolean) => {
    const timeout = setTimeout(() => notify(), 8000);
    const deadline = Date.now() + 8000;
    try {
      for (;;) {
        const index = messages.findIndex(predicate);
        if (index >= 0) return messages.splice(index, 1)[0]!;
        if (Date.now() >= deadline) throw new Error(`Timed out: ${stderr}`);
        await new Promise<void>((done) => {
          notify = done;
        });
      }
    } finally {
      clearTimeout(timeout);
    }
  };
  const request = async (method: string, params: unknown = {}) => {
    const id = String(++sequence);
    send({ type: "request", id, method, params });
    return wait((v) => v.type === "response" && v.id === id);
  };
  return {
    dir,
    child,
    send,
    wait,
    request,
    exited,
    async hello(capabilities: string[] = []) {
      send({ type: "hello", protocol: 1, capabilities });
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
  mismatch.send({ type: "hello", protocol: 99, capabilities: [] });
  expect((await mismatch.wait((v) => v.type === "error")).error.code).toBe("version_mismatch");
  expect(await mismatch.exited).toBe(2);
});

test("launch, scenes, events, capability forwarding and EOF shutdown", async () => {
  const c = await client(true);
  await c.hello(["clipboard.copy"]);
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

test("undeclared capability is denied and logged", async () => {
  const c = await client();
  await c.hello();
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
  manifest.title = "Changed";
  await writeFile(file, JSON.stringify(manifest));
  expect((await c.wait((v) => v.event === "manifest.changed")).manifest.title).toBe("Changed");
  await writeFile(file, "invalid");
  await c.wait((v) => v.event === "manifest.error");
  await c.request("extension.unwatch", { extension });
  await c.request("extension.close", { extension });
  await c.wait((v) => v.event === "session.exited");
  expect((await c.request("extension.manifest", { extension })).ok).toBe(false);
  c.child.stdin.end();
  expect(await c.exited).toBe(0);
});

test("capability progress and abort, late results, and session close", async () => {
  const c = await client();
  await c.hello(["ai.ask"]);
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
  const first = await c.wait((v) => v.event === "session.view" && v.session === session);
  expect(first.view.rows.map((row: any) => row.title)).toEqual(["pineapple", "apple", "banana"]);
  expect(first.view.primary.shortcut).toBe("↵");
  expect(
    (await c.request("session.input", { session, input: { type: "search", text: "apple" } }))
      .result,
  ).toBeNull();
  const ranked = await c.wait((v) => v.event === "session.view" && v.view.search.text === "apple");
  expect(ranked.view.rows.map((row: any) => row.title)).toEqual(["apple", "pineapple"]);
  c.send({
    type: "request",
    id: "repeat",
    method: "session.input",
    params: { session, input: { type: "search", text: "apple" } },
  });
  const repeat = await c.wait(
    (v) => v.event === "session.view" || (v.type === "response" && v.id === "repeat"),
  );
  expect(repeat.type).toBe("response");
  expect(repeat.result).toBeNull();
  expect(
    (await c.request("session.input", { session, input: { type: "select", id: "apple" } })).ok,
  ).toBe(true);
  await c.request("session.input", { session, input: { type: "primary" } });
  await c.wait(
    (v) =>
      v.event === "session.scene" &&
      !!find(v.scene.root, (n) => n.props.navigationTitle === "pinned apple"),
  );
  const updated = await c.wait(
    (v) => v.event === "session.view" && v.view.title === "pinned apple",
  );
  expect(updated.session).toBe(session);
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
  await c.wait((v) => v.event === "session.view");
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
  const updated = await c.wait((v) => v.event === "session.view" && v.view.title === "ap:1");
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
  const first = await c.wait((v) => v.event === "session.view" && v.view.form);
  const [name, secret, agree] = first.view.form.fields;
  const input = async (action: unknown) =>
    expect((await c.request("session.input", { session, input: action })).ok).toBe(true);
  await input({ type: "setValue", id: name.id, value: "Ada" });
  await c.wait((v) => v.event === "session.view" && v.view.form?.fields[0].value === "Ada");
  await input({ type: "focusNext" });
  await input({ type: "setValue", id: secret.id, value: "hidden-password" });
  const masked = await c.wait((v) => v.event === "session.view" && v.view.form?.fields[1].hasValue);
  expect(JSON.stringify(masked)).not.toContain("hidden-password");
  await input({ type: "toggle", id: agree.id });
  await c.wait((v) => v.event === "session.view" && v.view.form?.fields[2].checked);
  await input({ type: "submit" });
  const submitted = await c.wait(
    (v) => v.event === "session.view" && v.view.title.includes('"name":"Ada"'),
  );
  expect(JSON.parse(submitted.view.title)).toEqual({ name: "Ada", secret: "<set>", agree: true });
  await c.request("engine.shutdown");
  expect(await c.exited).toBe(0);
}, 20_000);
