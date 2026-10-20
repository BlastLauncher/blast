import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { createEngine } from "@blastlauncher/engine";

const timeout = setTimeout(() => {
  console.error("Release smoke timed out");
  process.exit(1);
}, 20_000);
const engine = createEngine({ dataDir: resolve("data") });
const extensionDir = resolve("hello-list");
function firstItem(node) {
  if (node?.type === "List.Item") return node.props.title;
  for (const child of node?.children ?? []) {
    const title = firstItem(child);
    if (title) return title;
  }
}
try {
  const extension = engine.openExtension({ extensionDir });
  const { session } = await extension.launch("index");
  const title = await new Promise((done, reject) => {
    session.scenes((scene) => {
      const item = firstItem(scene.root);
      if (item) done(item);
    });
    void session.exited.then((exit) => reject(new Error(JSON.stringify(exit))));
  });
  assert.equal(title, "apple");
  console.log(`In-process first item: ${title}`);
} finally {
  await engine.close();
}

const serve = spawn("npx", ["--no-install", "blast-serve"], {
  stdio: ["pipe", "pipe", "pipe"],
});
const exited = new Promise((done, reject) => {
  serve.once("error", reject);
  serve.once("exit", (code) => done(code));
});
let stderr = "";
serve.stderr.on("data", (chunk) => {
  stderr += chunk;
});
const send = (message) => serve.stdin.write(`${JSON.stringify(message)}\n`);
let sawScene = false;
try {
  // Drive the hello/open/launch transcript through pipes, waiting for opaque
  // handles rather than assuming their values or racing EOF against rendering.
  send({ type: "hello", protocol: 1, capabilities: [] });
  for await (const line of createInterface({ input: serve.stdout })) {
    const message = JSON.parse(line);
    assert.notEqual(message.type, "error", line);
    if (message.type === "welcome")
      send({
        type: "request",
        id: "open",
        method: "extension.open",
        params: { dir: extensionDir },
      });
    if (message.type === "response") {
      assert.equal(message.ok, true, line);
      if (message.id === "open")
        send({
          type: "request",
          id: "launch",
          method: "extension.launch",
          params: { extension: message.result.extension, command: "index" },
        });
    }
    if (!sawScene && message.type === "event" && message.event === "session.scene") {
      assert.equal(firstItem(message.scene.root), "apple");
      sawScene = true;
      console.log("Serve event: session.scene (first item: apple)");
      send({ type: "request", id: "shutdown", method: "engine.shutdown", params: {} });
    }
  }
  assert.equal(await exited, 0, stderr);
  assert.equal(sawScene, true, stderr);
} finally {
  serve.stdin.end();
  if (serve.exitCode === null) serve.kill();
  clearTimeout(timeout);
}

const cli = spawnSync("npx", ["--no-install", "blast", "run", extensionDir, "index"], {
  encoding: "utf8",
  timeout: 15_000,
});
assert.equal(cli.status, 0, cli.stderr);
assert.match(cli.stdout, /apple/);
console.log("CLI bin: blast run (apple)");
