import { afterAll, beforeAll, expect, test } from "bun:test";
import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createLineDecoder,
  createScenePatchApplier,
  encodeMessage,
  parseRuntimeMessage,
  PROTOCOL_VERSION,
  type HostMessage,
  type RuntimeMessage,
  type SceneMessage,
  type SceneNode,
} from "@blastlauncher/protocol";
import { writeWorkflow } from "./workflow-test-helper.ts";

// The real entrypoint under real Node: no Bun, no build step (decision 0021).
const nodePath = execFileSync("node", ["-p", "process.execPath"], { encoding: "utf8" }).trim();
const WAIT_MS = 10_000;
const noop = () => {};

let root = "";
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "blast-alfred-main-"));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

function find(
  node: SceneNode | null,
  predicate: (node: SceneNode) => boolean,
): SceneNode | undefined {
  if (!node) return undefined;
  if (predicate(node)) return node;
  for (const child of node.children) {
    const found = find(child, predicate);
    if (found) return found;
  }
  return undefined;
}

test("node runs a workflow over stdio from init to shutdown", async () => {
  const dir = await writeWorkflow(
    join(root, "hello"),
    [
      [
        "sf",
        "input.scriptfilter",
        {
          keyword: "hello",
          argumenttype: 1,
          queuedelaymode: 1,
          type: 0,
          scriptargtype: 1,
          script: `printf '{"items":[{"title":"Hello %s","arg":"%s"}]}' "$1" "$1"`,
        },
      ],
      ["clip", "output.clipboard", { clipboardtext: "{query}" }],
    ],
    [["sf", "clip"]],
  );
  const supportPath = join(root, "support");
  const child = spawn(nodePath, [fileURLToPath(new URL("./main.ts", import.meta.url))], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  const messages: RuntimeMessage[] = [];
  const invalid: string[] = [];
  const applier = createScenePatchApplier();
  let scene: SceneMessage | undefined;
  let stderr = "";
  let wake = noop;
  const decoder = createLineDecoder({
    onLine(value) {
      const parsed = parseRuntimeMessage(value);
      if (!parsed.ok) invalid.push(parsed.error);
      else {
        messages.push(parsed.message);
        if (parsed.message.type === "scene") scene = applier.reset(parsed.message);
        if (parsed.message.type === "scene.patch") scene = applier.apply(parsed.message);
      }
      wake();
    },
    onError(error) {
      invalid.push(error);
      wake();
    },
  });
  child.stdout.on("data", (chunk: Buffer) => decoder.push(chunk));
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk;
  });
  const exited = new Promise<number | null>((resolve) => child.on("close", resolve));
  const send = (message: HostMessage) => child.stdin.write(encodeMessage(message));
  const until = async <T>(read: () => T | undefined, what: string): Promise<T> => {
    const deadline = Date.now() + WAIT_MS;
    for (;;) {
      if (invalid.length > 0) throw new Error(invalid.join("\n"));
      const value = read();
      if (value !== undefined) return value;
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}: ${stderr}`);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 50);
        wake = () => {
          clearTimeout(timer);
          resolve();
        };
      });
    }
  };

  try {
    send({
      type: "init",
      protocol: PROTOCOL_VERSION,
      command: {
        extension: "com.example.fixture",
        name: "hello",
        entry: dir,
        mode: "view",
        arguments: { query: "world" },
      },
      preferences: {},
      environment: {
        extensionName: "com.example.fixture",
        commandName: "hello",
        ownerOrAuthorName: "Blast",
        assetsPath: dir,
        supportPath,
        isDevelopment: true,
        appearance: "dark",
        textSize: "medium",
      },
    });
    await until(() => messages.find((m) => m.type === "ready"), "ready");
    const open = await until(
      () =>
        find(scene?.root ?? null, (node) => node.props.title === "Hello world") &&
        find(scene?.root ?? null, (node) => node.type === "Action" && node.props.title === "Open"),
      "the Script Filter result",
    );
    expect(existsSync(join(supportPath, "cache"))).toBe(true);

    send({ type: "event", node: open.id, handler: "onAction", args: [] });
    const request = await until(
      () => messages.find((m) => m.type === "capability.request"),
      "a capability request",
    );
    expect(request).toMatchObject({ name: "clipboard.copy", params: { text: "world" } });
    send({ type: "capability.result", id: request.id, ok: true, value: null });
    await until(
      () => (scene?.root?.props.closeMainWindow === true ? true : undefined),
      "the window to close",
    );

    send({ type: "shutdown" });
    expect(await exited).toBe(0);
    expect(messages.filter((m) => m.type === "error")).toEqual([]);
    expect(messages.some((m) => m.type === "scene.patch")).toBe(true);
  } finally {
    child.kill();
  }
});
