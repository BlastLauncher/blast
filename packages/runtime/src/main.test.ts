import { afterEach, expect, test } from "bun:test";
import type { SceneNode } from "@blastlauncher/protocol";
import { startRuntime } from "./process-test-helper.ts";

const runtimes: ReturnType<typeof startRuntime>[] = [];
function start() {
  const runtime = startRuntime();
  runtimes.push(runtime);
  return runtime;
}
afterEach(async () => {
  for (const runtime of runtimes.splice(0)) {
    runtime.child.kill();
    await runtime.exited;
    expect(runtime.invalid).toEqual([]);
    expect(runtime.stderr).toBe("");
  }
});
function find(node: SceneNode, title: string): SceneNode | undefined {
  if (node.props.title === title) return node;
  for (const child of node.children) {
    const match = find(child, title);
    if (match) return match;
  }
}
function action(runtime: ReturnType<typeof start>, root: SceneNode, title: string) {
  const node = find(root, title)!;
  const ref = node.props.onAction as { $handler: string };
  runtime.send({ type: "event", node: node.id, handler: ref.$handler, args: [] });
}

test("Node handshake, shared React hooks, events, clipboard results, logs and shutdown", async () => {
  const runtime = start();
  runtime.init();
  expect(await runtime.next("ready")).toEqual({ type: "ready", protocol: 1 });
  const first = await runtime.next("scene");
  expect(first.root!.children[0]!.children[0]!.props.navigationTitle).toBe("0:false");
  expect(runtime.messages).toContainEqual({
    type: "log",
    level: "info",
    message: "fixture loaded",
  });
  expect(runtime.messages).toContainEqual({
    type: "log",
    level: "warn",
    message: "fixture warning",
  });
  expect(runtime.messages).toContainEqual({
    type: "log",
    level: "error",
    message: "Assertion failed: fixture assertion",
  });
  action(runtime, first.root!, "Increment");
  const second = await runtime.next("scene");
  expect(second.revision).toBeGreaterThan(first.revision);
  expect(second.root!.children[0]!.children[0]!.props.navigationTitle).toBe("1:false");
  action(runtime, second.root!, "Copy to Clipboard");
  const request = await runtime.next("capability.request");
  expect(request.name).toBe("clipboard.copy");
  expect(request.params).toEqual({ text: "hello" });
  runtime.send({ type: "capability.result", id: request.id, ok: true, value: null });
  const copied = await runtime.next("scene");
  expect(copied.root!.children[0]!.children[0]!.props.navigationTitle).toBe("1:true");
  action(runtime, copied.root!, "Copy to Clipboard");
  const denied = await runtime.next("capability.request");
  expect(denied.id).not.toBe(request.id);
  runtime.send({
    type: "capability.result",
    id: denied.id,
    ok: false,
    error: { code: "DENIED", message: "copy denied" },
  });
  expect(await runtime.next("error")).toMatchObject({ fatal: false, message: "copy denied" });
  action(runtime, copied.root!, "Throw");
  expect(await runtime.next("error")).toMatchObject({ fatal: false, message: "handler failed" });
  action(runtime, copied.root!, "Increment");
  expect((await runtime.next("scene")).root!.children[0]!.children[0]!.props.navigationTitle).toBe(
    "2:true",
  );
  runtime.send({ type: "shutdown" });
  expect(await runtime.exited).toBe(0);
  expect(runtime.messages).toContainEqual({ type: "log", level: "info", message: "unmounted" });
  expect(runtime.messages.filter((message) => message.type === "scene").at(-1)).toMatchObject({
    type: "scene",
    root: null,
  });
});

for (const [title, message] of [
  ["Async crash", "async render failed"],
  ["Uncaught", "uncaught"],
  ["Unhandled", "unhandled"],
]) {
  test(`${title} reports a fatal error without another event`, async () => {
    const runtime = start();
    runtime.init();
    const scene = await runtime.next("scene");
    action(runtime, scene.root!, title!);
    expect(await runtime.next("error")).toMatchObject({ fatal: true, message });
    expect(await runtime.exited).toBe(1);
  });
}

test("render failure is fatal", async () => {
  const runtime = start();
  runtime.init({ fixture: "throw.js" });
  expect(await runtime.next("error")).toMatchObject({ fatal: true, message: "render failed" });
  expect(await runtime.exited).toBe(1);
});

test("no-view command runs, sees environment and preferences, and exits 0 without a scene", async () => {
  const runtime = start();
  runtime.init({
    fixture: "no-view.js",
    mode: "no-view",
    preferences: { maxItems: 20, pinned: true },
    environment: {
      extensionName: "Clipboard History",
      commandName: "history",
      ownerOrAuthorName: "Raycast",
      assetsPath: "/ext/assets",
      supportPath: "/ext/support",
      isDevelopment: false,
      appearance: "light",
      textSize: "large",
    },
  });
  expect(await runtime.next("ready")).toEqual({ type: "ready", protocol: 1 });
  // The fixture writes to stdout while it loads; it must arrive as a log, not
  // as a line that breaks the framing of the protocol stream.
  expect(await runtime.next("log")).toEqual({ type: "log", level: "info", message: "raw" });
  const reported = await runtime.next("log");
  expect(JSON.parse(reported.message)).toEqual({
    props: { arguments: {}, launchType: "userInitiated" },
    commandName: "history",
    extensionName: "Clipboard History",
    preferences: { maxItems: 20, pinned: true },
  });
  expect(await runtime.exited).toBe(0);
  expect(runtime.messages.filter((message) => message.type === "scene")).toEqual([]);
  expect(runtime.invalid).toEqual([]);
});

// @covers LaunchProps
// @covers LaunchProps.arguments
// @covers LaunchProps.launchType
// @covers LaunchProps.launchContext
test("launch props carry manifest arguments and the launch context", async () => {
  const runtime = start();
  runtime.init({
    fixture: "no-view.js",
    mode: "no-view",
    arguments: { query: "raycast", option: "one" },
    launchContext: { from: "launcher", nested: { deep: true } },
  });
  expect(await runtime.next("ready")).toEqual({ type: "ready", protocol: 1 });
  expect(await runtime.next("log")).toEqual({ type: "log", level: "info", message: "raw" });
  const reported = await runtime.next("log");
  expect(JSON.parse(reported.message).props).toEqual({
    arguments: { query: "raycast", option: "one" },
    launchType: "userInitiated",
    launchContext: { from: "launcher", nested: { deep: true } },
  });
  expect(await runtime.exited).toBe(0);
});

test("no-view rejection is fatal", async () => {
  const runtime = start();
  runtime.init({ fixture: "no-view-reject.js", mode: "no-view" });
  expect(await runtime.next("error")).toMatchObject({ fatal: true, message: "no-view failed" });
  expect(await runtime.exited).toBe(1);
});

test("menu-bar renders without Navigation, retains callbacks after loading and shuts down", async () => {
  const runtime = start();
  runtime.init({ fixture: "menu-bar.js", mode: "menu-bar" });
  const first = await runtime.next("scene");
  expect(first.root).toMatchObject({
    type: "MenuBarExtra",
    props: { title: "Ready", isLoading: true },
  });
  for (const type of ["left-click", "right-click"]) {
    const node = find(first.root!, "Click")!;
    const ref = node.props.onAction as { $handler: string };
    runtime.send({ type: "event", node: node.id, handler: ref.$handler, args: [{ type }] });
    const next = await runtime.next("scene");
    expect(next.root?.props).toMatchObject({ title: type, isLoading: false });
  }
  action(runtime, first.root!, "Hide");
  expect((await runtime.next("scene")).root).toBeNull();
  runtime.send({ type: "shutdown" });
  expect(await runtime.exited).toBe(0);
  expect(runtime.messages).toContainEqual({
    type: "log",
    level: "info",
    message: "menu unmounted",
  });
});

for (const mode of [
  "version",
  "first message",
  "unknown id",
  "duplicate init",
  "invalid JSON",
  "partial EOF",
  "invalid message",
]) {
  test(`protocol failure: ${mode}`, async () => {
    const runtime = start();
    if (mode === "version") runtime.init({ protocol: 999 });
    else if (mode === "first message") runtime.send({ type: "shutdown" });
    else if (mode === "invalid JSON") runtime.child.stdin.write("broken\n");
    else if (mode === "partial EOF") runtime.child.stdin.end("{");
    else if (mode === "invalid message") runtime.child.stdin.write('{"type":"unknown"}\n');
    else {
      runtime.init();
      await runtime.next("scene");
      if (mode === "duplicate init") runtime.init();
      else runtime.send({ type: "capability.result", id: "unknown", ok: true, value: null });
    }
    expect(await runtime.next("error")).toMatchObject({ fatal: true, code: "PROTOCOL_ERROR" });
    expect(await runtime.exited).toBe(1);
  });
}

test("stdin EOF unmounts and exits cleanly", async () => {
  const runtime = start();
  runtime.init();
  await runtime.next("scene");
  runtime.child.stdin.end();
  expect(await runtime.exited).toBe(0);
  expect(runtime.messages.filter((message) => message.type === "scene").at(-1)).toMatchObject({
    type: "scene",
    root: null,
  });
});

for (const [fixture, mode, path] of [
  ["unsupported.js", "view", "WindowManagement"],
  ["unsupported-reject.js", "no-view", "getDefaultApplication"],
] as const) {
  test(`unsupported API is fatal: ${fixture}`, async () => {
    const runtime = start();
    runtime.init({ fixture, mode });
    expect(await runtime.next("error")).toMatchObject({
      fatal: true,
      code: "UNSUPPORTED_API",
      message: `Unsupported API in Blast: ${path}`,
    });
    expect(await runtime.exited).toBe(1);
  });
}

for (const title of ["Unsupported sync", "Unsupported async"]) {
  test(`${title} event errors are fatal`, async () => {
    const runtime = start();
    runtime.init({ fixture: "unsupported-event.js" });
    const scene = await runtime.next("scene");
    action(runtime, scene.root!, title);
    expect(await runtime.next("error")).toMatchObject({
      fatal: true,
      code: "UNSUPPORTED_API",
      message: "Unsupported API in Blast: getDefaultApplication",
    });
    expect(await runtime.exited).toBe(1);
  });
}

for (const fixture of ["async-view.js", "thenable-view.js"]) {
  test(`promise-returning view exits with feedback: ${fixture}`, async () => {
    const runtime = start();
    runtime.init({ fixture });
    expect(await runtime.exited).toBe(0);
    expect(
      runtime.messages.filter((m) => m.type === "log" && m.message === "called once"),
    ).toHaveLength(1);
    const scenes = runtime.messages.filter((m) => m.type === "scene");
    expect(scenes.some((m) => m.root?.children.some((node) => node.type === "Toast"))).toBe(true);
    if (fixture === "async-view.js") {
      expect(scenes.some((m) => m.root?.children.some((node) => node.type === "HUD"))).toBe(true);
      expect(scenes.at(-1)?.root?.props.closeMainWindow).toEqual({});
    }
    expect(runtime.messages.filter((m) => m.type === "error")).toEqual([]);
  }, 2000);
}

test("promise-returning view rejection is fatal", async () => {
  const runtime = start();
  runtime.init({ fixture: "no-view-reject.js" });
  expect(await runtime.next("error")).toMatchObject({ fatal: true, message: "no-view failed" });
  expect(await runtime.exited).toBe(1);
}, 2000);
