import { expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createBroker, startCommand, type Session } from "./index.ts";

// @covers Cache
// @covers Cache.get
// @covers Cache.set
test("host creates stable escaped support paths and Cache persists across runtime processes", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "blast-cache-process-"));
  const sessions: Session[] = [];
  try {
    async function run(extensionName: string, commandName: string) {
      const session = await startCommand({
        entry: fileURLToPath(new URL("../../../fixtures/runtime/cache.js", import.meta.url)),
        extensionName,
        commandName,
        mode: "no-view",
        dataDir,
        broker: createBroker(),
      });
      sessions.push(session);
      expect(await session.exited).toEqual({ code: 0, signal: null });
      return JSON.parse(session.logs[0]!.message);
    }
    const first = await run("@scope/extension", "first");
    expect(first).toEqual({
      previous: "0",
      supportPath: join(dataDir, "support", "%40scope%2fextension"),
      exists: true,
    });
    expect(await run("@scope/extension", "second")).toEqual({ ...first, previous: "1" });
    expect((await run("other", "first")).previous).toBe("0");
    const dots = await run("..", "first");
    expect(dots.supportPath).toBe(join(dataDir, "support", "%2e%2e"));
    expect(await readdir(join(first.supportPath, "cache"))).toEqual(["entries.json"]);
  } finally {
    await Promise.all(sessions.map((session) => session.shutdown()));
    await rm(dataDir, { recursive: true, force: true });
  }
});
