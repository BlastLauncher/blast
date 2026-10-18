import { afterEach, expect, test } from "bun:test";
import type { SceneMessage, SceneNode } from "@blastlauncher/protocol";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { bundleCommand, createBroker, startCommand, type Session } from "./index.ts";

const extensionDir = fileURLToPath(
  new URL("../../../fixtures/extensions/host-session", import.meta.url),
);
const sessions: Session[] = [];
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(sessions.splice(0).map((session) => session.shutdown({ timeoutMs: 20 })));
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
async function bundle(command = "session") {
  const outDir = await mkdtemp(join(tmpdir(), "blast-host-test-"));
  directories.push(outDir);
  return bundleCommand({ extensionDir, command, outDir });
}
async function start(command = "session", broker = createBroker()) {
  const session = await startCommand({ ...(await bundle(command)), broker });
  sessions.push(session);
  return session;
}
function scene(session: Session, title?: string): Promise<SceneMessage> {
  if (
    session.latestScene?.root &&
    (title === undefined || session.latestScene.root.props.navigationTitle === title)
  )
    return Promise.resolve(session.latestScene);
  return new Promise((resolve, reject) => {
    let unsubscribe: () => void;
    const accept = (snapshot: SceneMessage) => {
      if (snapshot.root && (title === undefined || snapshot.root.props.navigationTitle === title)) {
        resolve(snapshot);
        unsubscribe?.();
      }
    };
    unsubscribe = session.scenes(accept);
    void session.exited.then((exit) => {
      unsubscribe();
      reject(exit.error ?? new Error("Exited before scene"));
    });
  });
}
function find(node: SceneNode, title: string): SceneNode | undefined {
  if (node.props.title === title) return node;
  return node.children.map((child) => find(child, title)).find(Boolean);
}
function action(session: Session, snapshot: SceneMessage, title: string) {
  const node = find(snapshot.root!, title)!;
  session.sendEvent(node.id, (node.props.onAction as { $handler: string }).$handler, []);
}

test("bundles deterministic ESM and returns manifest identity and mode", async () => {
  const first = await bundle();
  const second = await bundle();
  expect(await readFile(first.entry, "utf8")).toBe(await readFile(second.entry, "utf8"));
  expect(first).toMatchObject({
    extensionName: "host-session",
    commandName: "session",
    mode: "view",
  });
  const defaults = await bundleCommand({ extensionDir, command: "session" });
  directories.push(join(defaults.entry, ".."));
  expect(defaults.entry.startsWith(join(tmpdir(), "blast", "builds"))).toBe(true);
  await expect(bundle("missing")).rejects.toThrow("Unknown extension command");
});

test("real Node runtime publishes scenes, routes events, grants clipboard and captures logs", async () => {
  const copied: unknown[] = [];
  const session = await start(
    "session",
    createBroker({
      "clipboard.copy": (params) => {
        copied.push(params);
      },
    }),
  );
  const first = await scene(session);
  expect(first.root!.props.navigationTitle).toBe("initial");
  expect(session.logs).toContainEqual({
    type: "log",
    level: "info",
    message: "host fixture loaded",
  });
  action(session, first, "Increment");
  const updated = await scene(session, "updated");
  expect(updated.revision).toBeGreaterThan(first.revision);
  action(session, updated, "Copy");
  await scene(session, "copied");
  expect(copied).toEqual([{ text: "hello" }]);
  expect(session.latestScene!.root!.props.navigationTitle).toBe("copied");
  expect(await session.shutdown()).toMatchObject({ code: 0, signal: null });
});

for (const [title, broker] of [
  ["denied", createBroker()],
  [
    "failed",
    createBroker({
      "clipboard.copy": () => {
        throw new Error("provider failed");
      },
    }),
  ],
] as const) {
  test(`extension sees ${title} capability rejection`, async () => {
    const session = await start("session", broker);
    action(session, await scene(session), "Copy");
    expect((await scene(session, title)).root!.props.navigationTitle).toBe(title);
  });
}

test("an extension crash resolves exit without killing the host", async () => {
  const session = await start();
  action(session, await scene(session), "Crash");
  expect(await session.exited).toEqual({ code: 3, signal: null });
  const survivor = await start();
  expect((await scene(survivor)).root).not.toBeNull();
});

test("manifest no-view mode waits for capabilities and exits without a scene", async () => {
  const copied: unknown[] = [];
  const session = await startCommand({
    ...(await bundle("no-view")),
    preferences: { text: "preference" },
    broker: createBroker({
      "clipboard.copy": (params) => {
        copied.push(params);
      },
    }),
  });
  sessions.push(session);
  expect(await session.exited).toEqual({ code: 0, signal: null });
  expect(copied).toEqual([{ text: "preference" }]);
  expect(session.latestScene).toBeUndefined();
});

test("shutdown escalates through SIGTERM to SIGKILL and is idempotent", async () => {
  let started!: () => void;
  const startup = new Promise<void>((resolve) => {
    started = resolve;
  });
  const session = await start(
    "stubborn",
    createBroker({
      "clipboard.copy": () => {
        started();
      },
    }),
  );
  await Promise.race([
    startup,
    session.exited.then(() => {
      throw new Error("Exited before startup");
    }),
  ]);
  const shutdown = session.shutdown({ timeoutMs: 20 });
  expect(session.shutdown()).toBe(shutdown);
  expect(await shutdown).toEqual({ code: null, signal: "SIGKILL" });
});

for (const wire of [
  "invalid protocol\n",
  '{"type":"unknown"}\n',
  '{"type":"ready","protocol":1}\n',
]) {
  test(`invalid runtime output: ${wire.trim()}`, async () => {
    const session = await startCommand({
      ...(await bundle("invalid")),
      preferences: { wire },
      broker: createBroker(),
    });
    sessions.push(session);
    const exit = await session.exited;
    expect(exit.error).toMatchObject({ code: "PROTOCOL_ERROR" });
    expect(exit.signal).toBe("SIGKILL");
  });
}

test("handshake timeout and spawn errors clean up and reject", async () => {
  const command = await bundle();
  await expect(
    startCommand({
      ...command,
      broker: createBroker(),
      nodePath: fileURLToPath(new URL("../../../fixtures/host/silent-node", import.meta.url)),
      handshakeTimeoutMs: 30,
    }),
  ).rejects.toThrow("handshake timed out");
  await expect(
    startCommand({
      ...command,
      broker: createBroker(),
      nodePath: join(command.entry, "missing-node"),
    }),
  ).rejects.toThrow();
});

test("broker denies inherited names and converts handler throws to failed results", async () => {
  const broker = createBroker({
    broken: () => {
      throw new Error("broken");
    },
  });
  expect(
    await broker({ type: "capability.request", id: "1", name: "toString", params: null }),
  ).toMatchObject({ ok: false, error: { code: "denied" } });
  expect(
    await broker({ type: "capability.request", id: "2", name: "broken", params: null }),
  ).toMatchObject({ ok: false, error: { code: "failed", message: "broken" } });
});

test("host package itself runs under Node 24 without a build step", async () => {
  const command = await bundle("no-view");
  const child = spawn(
    "node",
    [
      "--input-type=module",
      "-e",
      `
    import { startCommand, createBroker } from ${JSON.stringify(new URL("./index.ts", import.meta.url).href)};
    const session = await startCommand({ ...${JSON.stringify(command)}, broker: createBroker({ "clipboard.copy": () => null }) });
    const exit = await session.exited;
    console.log(JSON.stringify({ version: process.versions.node, code: exit.code }));
  `,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  try {
    const code = await new Promise((resolve, reject) => {
      child.on("close", resolve);
      child.on("error", reject);
    });
    expect(code).toBe(0);
    expect(stderr).toBe("");
    expect(JSON.parse(stdout)).toMatchObject({ version: expect.stringMatching(/^24\./), code: 0 });
  } finally {
    child.kill("SIGKILL");
  }
});
