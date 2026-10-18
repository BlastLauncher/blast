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
  expect(first.root!.props.navigationTitle).toBe("0:false");
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
  expect(second.root!.props.navigationTitle).toBe("1:false");
  action(runtime, second.root!, "Copy to Clipboard");
  const request = await runtime.next("capability.request");
  expect(request.name).toBe("clipboard.copy");
  expect(request.params).toEqual({ text: "hello" });
  runtime.send({ type: "capability.result", id: request.id, ok: true, value: null });
  const copied = await runtime.next("scene");
  expect(copied.root!.props.navigationTitle).toBe("1:true");
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
  expect((await runtime.next("scene")).root!.props.navigationTitle).toBe("2:true");
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
  runtime.init("throw.js");
  expect(await runtime.next("error")).toMatchObject({ fatal: true, message: "render failed" });
  expect(await runtime.exited).toBe(1);
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
    if (mode === "version") runtime.init("command.js", 999);
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
