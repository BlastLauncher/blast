import { expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";

const cli = fileURLToPath(new URL("./cli.ts", import.meta.url));
const fixture = fileURLToPath(
  new URL("../../../fixtures/extensions/browser-bridge", import.meta.url),
);

test("CLI bridge delivers companion content to the runtime scene", async () => {
  const directory = await mkdtemp(join(tmpdir(), "blast-browser-bridge-"));
  const child = spawn(
    "node",
    [
      cli,
      "run",
      fixture,
      "index",
      "--browser-bridge",
      "0",
      "--data-dir",
      directory,
      "--timeout",
      "10000",
      "--script",
      "-",
    ],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  child.stdin.end("wait\nwait\nexpect specific browser content\nquit\n");
  let stdout = "",
    stderr = "";
  let socket: WebSocket | undefined;
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
    const port = /browser bridge listening on 127\.0\.0\.1:(\d+)/.exec(stderr)?.[1];
    if (!port || socket) return;
    socket = new WebSocket(`ws://127.0.0.1:${port}`, {
      headers: { Origin: "chrome-extension://fixture" },
    });
    socket.on("error", () => {});
    socket.on("message", (raw) => {
      const { id, method, params } = JSON.parse(raw.toString());
      const value =
        method === "getTabs"
          ? [{ tabId: 2, url: "https://example.com", active: true }]
          : params.tabId === 2 && params.format === "html" && params.selector === "main"
            ? "specific browser content"
            : "active browser content";
      socket!.send(JSON.stringify({ jsonrpc: "2.0", id, result: { value } }));
    });
  });
  try {
    const code = await new Promise<number | null>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    expect(code).toBe(0);
    expect(stdout).toContain("browser available:true");
    expect(stdout).toContain("active browser content");
    expect(stdout).toContain("specific browser content");
    expect(stderr).toMatch(/browser bridge listening on 127\.0\.0\.1:\d+/);
  } finally {
    socket?.terminate();
    child.kill();
    await rm(directory, { recursive: true, force: true });
  }
}, 20_000);

test("CLI rejects conflicting browser flags and invalid ports", async () => {
  for (const flags of [
    ["--browser-bridge", "--browser-tabs", "absent.json"],
    ["--browser-bridge=-1"],
    ["--browser-bridge=65536"],
  ]) {
    const child = Bun.spawn(["node", cli, "run", fixture, "index", ...flags], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const stderr = await new Response(child.stderr).text();
    expect(await child.exited).toBe(2);
    expect(stderr).toContain("--browser-bridge");
    if (flags.length > 1) expect(stderr).toContain("conflicts with --browser-tabs");
  }
});
