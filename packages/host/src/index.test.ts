import { afterEach, expect, test } from "bun:test";
import type { SceneMessage, SceneNode } from "@blastlauncher/protocol";
import { spawn } from "node:child_process";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { bundleCommand, createBroker, linkAssets, startCommand, type Session } from "./index.ts";

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
    (title === undefined ||
      session.latestScene.root.children[0]!.children[0]!.props.navigationTitle === title)
  )
    return Promise.resolve(session.latestScene);
  return new Promise((resolve, reject) => {
    let unsubscribe: () => void;
    const accept = (snapshot: SceneMessage) => {
      if (
        snapshot.root &&
        (title === undefined ||
          snapshot.root.children[0]!.children[0]!.props.navigationTitle === title)
      ) {
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

const launchDir = fileURLToPath(new URL("../../../fixtures/extensions/launch", import.meta.url));

test("manifest arguments are read for the host and invalid ones fail loudly", async () => {
  const bundled = await bundleCommand({ extensionDir: launchDir, command: "index" });
  directories.push(join(bundled.entry, ".."));
  expect(bundled.arguments).toEqual([
    { name: "query", type: "text", placeholder: "What to search", required: true },
    { name: "option", type: "dropdown" },
  ]);
  const withoutArguments = await bundleCommand({ extensionDir: launchDir, command: "close" });
  directories.push(join(withoutArguments.entry, ".."));
  expect(withoutArguments.arguments).toEqual([]);
  // A malformed declaration is the extension's bug, not a silent no-argument run.
  const dir = await mkdtemp(join(tmpdir(), "blast-arguments-test-"));
  directories.push(dir);
  await cp(launchDir, dir, { recursive: true });
  for (const [argumentsValue, message] of [
    [[{ name: "query", type: "number" }], 'Argument "query" has an unknown type "number"'],
    [[{ type: "text" }], "Argument 1 needs a name"],
    [
      [
        { name: "query", type: "text" },
        { name: "query", type: "text" },
      ],
      "Duplicate argument",
    ],
  ] as const) {
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({
        name: "launch",
        commands: [{ name: "index", mode: "view", arguments: argumentsValue }],
      }),
    );
    await expect(bundleCommand({ extensionDir: dir, command: "index" })).rejects.toThrow(message);
  }
});

test("argument values and a launch context reach the command's launch props", async () => {
  const bundled = await bundleCommand({ extensionDir: launchDir, command: "props" });
  directories.push(join(bundled.entry, ".."));
  const session = await startCommand({
    ...bundled,
    argumentValues: { query: "hello", option: "one" },
    launchContext: { from: "session", nested: { deep: true } },
    broker: createBroker(),
  });
  sessions.push(session);
  expect(await session.exited).toEqual({ code: 0, signal: null });
  expect(JSON.parse(session.logs[0]!.message)).toEqual({
    args: { query: "hello", option: "one" },
    launchType: "userInitiated",
    launchContext: { from: "session", nested: { deep: true } },
  });
});

test("shared utils bundles and renders without embedding React or the API", async () => {
  const fixture = fileURLToPath(
    new URL("../../../fixtures/extensions/shared-utils", import.meta.url),
  );
  const dir = await mkdtemp(join(tmpdir(), "blast-utils-test-"));
  directories.push(dir);
  const extension = join(dir, "extension");
  await cp(fixture, extension, { recursive: true });
  for (const name of ["@raycast/utils", "@raycast/api", "react"]) {
    const local = join(extension, "node_modules", name);
    await mkdir(local, { recursive: true });
    await writeFile(join(local, "package.json"), JSON.stringify({ name, main: "index.js" }));
    await writeFile(join(local, "index.js"), 'throw new Error("extension-local package loaded");');
  }
  const bundled = await bundleCommand({
    extensionDir: extension,
    command: "index",
    outDir: join(dir, "out"),
  });
  const source = await readFile(bundled.entry, "utf8");
  expect(source).toContain("script-commands/");
  expect(source).toContain('from "@raycast/api"');
  expect(source).toContain('from "react"');
  expect(source).toContain('from "react/jsx-runtime"');
  expect(source).not.toMatch(/node_modules\/(?:react|@raycast\/api)\//);
  expect(source).not.toContain("extension-local package loaded");
  // The helper is small; a bundled React implementation would dwarf this output.
  expect(source.length).toBeLessThan(10_000);
  const session = await startCommand({ ...bundled, broker: createBroker() });
  sessions.push(session);
  expect(
    find((await scene(session)).root!, "Open raycast://script-commands/shared-utils"),
  ).toBeDefined();
});

test("unprovided imports report sorted package names even when locally installed", async () => {
  const fixture = fileURLToPath(
    new URL("../../../fixtures/extensions/missing-dependency", import.meta.url),
  );
  const dir = await mkdtemp(join(tmpdir(), "blast-missing-test-"));
  directories.push(dir);
  await cp(fixture, dir, { recursive: true });
  const local = join(dir, "node_modules/blast-unavailable");
  await mkdir(local, { recursive: true });
  for (const name of ["subpath", "other"]) {
    await writeFile(join(local, `${name}.js`), "export default (value) => value;");
  }
  await expect(bundleCommand({ extensionDir: dir, command: "index" })).rejects.toMatchObject({
    code: "MISSING_DEPENDENCY",
    packages: ["@blast-missing/scoped", "blast-unavailable"],
  });
  await writeFile(
    join(dir, "src/index.ts"),
    'import { dequal } from "dequal/lite"; console.log(dequal);',
  );
  await expect(bundleCommand({ extensionDir: dir, command: "index" })).rejects.toMatchObject({
    code: "MISSING_DEPENDENCY",
    packages: ["dequal"],
  });
});

test("CommonJS globals from the banner work and require is built-ins only", async () => {
  // Raycast's CommonJS bundles expose __filename, __dirname and require;
  // the fixture uses all three, so this exercises the ESM banner.
  const fixture = fileURLToPath(
    new URL("../../../fixtures/extensions/cjs-globals", import.meta.url),
  );
  const session = await startCommand({
    ...(await bundleCommand({ extensionDir: fixture, command: "index" })),
    broker: createBroker(),
  });
  sessions.push(session);
  const snapshot = await scene(session);
  const json = JSON.stringify(snapshot.root);
  // __filename is the bundled entry, so its basename is stable across runs.
  expect(json).toContain('"navigationTitle":"index.mjs"');
  expect(json).toMatch(/"title":"[^"]*[/\\]assets"/);
  // Non-built-in requires fail clearly even when nothing else can resolve them.
  const dir = await mkdtemp(join(tmpdir(), "blast-cjs-test-"));
  directories.push(dir);
  await cp(fixture, join(dir, "extension"), { recursive: true });
  await writeFile(
    join(dir, "extension/src/index.tsx"),
    'const pkg = require("left-pad");\nexport default function Command() { return null; }\n',
  );
  await expect(
    bundleCommand({ extensionDir: join(dir, "extension"), command: "index" }),
  ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY", packages: ["left-pad"] });
});

// Plain file list for "nothing new appeared" assertions; sorted for diffing.
async function filesOf(dir: string): Promise<string[]> {
  return (await readdir(dir, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .toSorted();
}

// Deterministic stand-in for platforms where symlink creation is unavailable.
const noSymlinks = () => Promise.reject(new Error("ENOSYS: symlinks unavailable"));

test("the build dir mirrors Raycast's assets layout and leaves the extension untouched", async () => {
  const fixture = fileURLToPath(new URL("../../../fixtures/extensions/assets", import.meta.url));
  const before = await filesOf(fixture);
  const bundled = await bundleCommand({ extensionDir: fixture, command: "index" });
  directories.push(join(bundled.entry, ".."));
  expect(bundled.assetsPath).toBe(join(bundled.entry, "..", "assets"));
  expect((await lstat(bundled.assetsPath!)).isSymbolicLink()).toBe(true);
  expect(await realpath(bundled.assetsPath!)).toBe(await realpath(join(fixture, "assets")));
  const session = await startCommand({ ...bundled, broker: createBroker() });
  sessions.push(session);
  const published = await scene(session);
  const json = JSON.stringify(published.root);
  // One copy of the file through `environment.assetsPath`, one through
  // `path.join(__dirname, "assets", …)` — both must be the real content.
  expect(json).toContain('"title":"from assets"');
  expect(json).toContain('"subtitle":"from assets"');
  expect(await filesOf(fixture)).toEqual(before);
});

test("the assets copy fallback is read-only and enforces the size cap", async () => {
  const fixture = fileURLToPath(new URL("../../../fixtures/extensions/assets", import.meta.url));
  const dir = await mkdtemp(join(tmpdir(), "blast-assets-test-"));
  directories.push(dir);
  await linkAssets(dir, fixture, noSymlinks);
  expect(await readFile(join(dir, "assets", "message.txt"), "utf8")).toBe("from assets\n");
  expect((await stat(join(dir, "assets", "message.txt"))).mode & 0o222).toBe(0);
  // Sparse file: size counts, disk usage does not.
  const oversized = join(dir, "huge");
  await mkdir(join(oversized, "assets"), { recursive: true });
  const file = await open(join(oversized, "assets", "big.bin"), "w");
  await file.truncate(64 * 1024 * 1024 + 1);
  await file.close();
  await expect(linkAssets(join(oversized, "out"), oversized, noSymlinks)).rejects.toThrow(
    "caps at",
  );
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
  expect(first.root!.children[0]!.children[0]!.props.navigationTitle).toBe("initial");
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
  expect(session.latestScene!.root!.children[0]!.children[0]!.props.navigationTitle).toBe("copied");
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
    expect(
      (await scene(session, title)).root!.children[0]!.children[0]!.props.navigationTitle,
    ).toBe(title);
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

test("the runtime gets an allowlisted environment and logs are bounded", async () => {
  process.env.BLAST_TEST_SECRET = "hunter2";
  try {
    const session = await startCommand({ ...(await bundle("env")), broker: createBroker() });
    sessions.push(session);
    expect(await session.exited).toEqual({ code: 0, signal: null });
    expect(session.logs[0]?.message).toBe("secret=unset path=set");
  } finally {
    delete process.env.BLAST_TEST_SECRET;
  }
  const bounded = await startCommand({
    ...(await bundle("env")),
    broker: createBroker(),
    maxLogs: 3,
  });
  sessions.push(bounded);
  await bounded.exited;
  expect(bounded.logs.map((log) => log.message)).toEqual(["line 2", "line 3", "line 4"]);
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
