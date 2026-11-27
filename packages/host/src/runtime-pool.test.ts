import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRuntimePool } from "./runtime-pool.ts";
import { defaultNodePath } from "./session.ts";
import {
  bundleCommand,
  createBroker,
  createEngine,
  runtimeEnvironment,
  startCommand,
} from "./index.ts";

const helloDir = resolve(import.meta.dirname, "../../../fixtures/extensions/hello-list");

test("runtime pool prewarms one standby child, serves isolated processes per command, and cleans up on close", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "blast-pool-"));
  const pool = createRuntimePool();
  try {
    const spec = {
      nodePath: defaultNodePath(),
      env: {
        ...runtimeEnvironment(process.env),
        NODE_ENV: "production",
        NODE_COMPILE_CACHE: join(dataDir, "compile-cache"),
      },
    };
    pool.prewarm(spec);
    const first = pool.acquire(spec, false);
    const second = pool.acquire(spec, false);
    expect(first.pid).toBeDefined();
    expect(second.pid).toBeDefined();
    expect(first.pid).not.toBe(second.pid);
    first.kill("SIGKILL");
    second.kill("SIGKILL");

    const bundled = await bundleCommand({
      extensionDir: helloDir,
      command: "index",
      dataDir,
      cacheDir: join(dataDir, "bundles"),
    });
    pool.prewarm(spec);
    // Allow standby child to boot briefly before claim.
    await new Promise((done) => setTimeout(done, 50));
    const session = await startCommand({
      ...bundled,
      dataDir,
      runtimePool: pool,
      broker: createBroker({}),
    });
    await new Promise<void>((done) => {
      const stop = session.scenes((scene) => {
        if (scene.root) {
          stop();
          done();
        }
      });
    });
    await session.shutdown();
  } finally {
    pool.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("engine root prewarms runtime pool and shuts down cleanly across multiple extensions", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "blast-engine-pool-"));
  const engine = createEngine({ dataDir });
  try {
    const ext = engine.openExtension({ extensionDir: helloDir });
    const root = engine.root({ views: { platform: "Linux" } });
    await root.ready();
    const first = await ext.launch("index");
    const second = await ext.launch("index");
    await first.close();
    await second.close();
    await root.close();
  } finally {
    await engine.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});
