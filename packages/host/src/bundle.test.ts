import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bundleCommand, BundleTimeoutError } from "./bundle.ts";
import { createEngine } from "./engine.ts";

const fixture = fileURLToPath(new URL("../../../fixtures/extensions/hello-list", import.meta.url));
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function graph(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "blast-bundle-timeout-"));
  directories.push(dir);
  await mkdir(join(dir, "src"));
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({
      name: "bundle-timeout",
      commands: [{ name: "index", mode: "no-view" }],
    }),
  );
  // A deep graph forces successive asynchronous resolver calls, independent of
  // how quickly any single module is parsed on the test machine.
  await Promise.all(
    Array.from({ length: 512 }, async (_, i) => {
      await writeFile(
        join(dir, "src", i === 0 ? "index.ts" : `part${i}.ts`),
        i === 511 ? "console.log('end');" : `import './part${i + 1}.ts';`,
      );
    }),
  );
  return dir;
}

test("a tiny deadline cancels a generated import graph and settles promptly", async () => {
  const extensionDir = await graph();
  const started = performance.now();
  const error = await bundleCommand({
    extensionDir,
    command: "index",
    timeoutMs: 1,
    installedDependencies: false,
    sharedDependencies: async () => ({
      resolveShared: () => undefined,
      dependencyWarnings: () => [],
    }),
  }).catch((error: unknown) => error);
  expect(error).toBeInstanceOf(BundleTimeoutError);
  expect(error).toMatchObject({
    code: "BUNDLE_TIMEOUT",
    extension: "bundle-timeout",
    command: "index",
    timeoutMs: 1,
  });
  expect(performance.now() - started).toBeLessThan(3000);
  // A cancelled build must release its context so subsequent builds still work.
  const bundled = await bundleCommand({ extensionDir: fixture, command: "index" });
  directories.push(dirname(bundled.entry));
  expect(bundled.bundleMs).toBeGreaterThan(0);
});

test("zero disables the deadline and successful bundles report finite elapsed time", async () => {
  const bundled = await bundleCommand({ extensionDir: fixture, command: "index", timeoutMs: 0 });
  directories.push(dirname(bundled.entry));
  expect(Number.isFinite(bundled.bundleMs)).toBe(true);
  expect(bundled.bundleMs).toBeGreaterThan(0);
});

test("abort before bundling and during plugin resolution preserves the caller's reason", async () => {
  const controller = new AbortController();
  const reason = new Error("cancelled by embedder");
  controller.abort(reason);
  await expect(
    bundleCommand({ extensionDir: fixture, command: "index", signal: controller.signal }),
  ).rejects.toBe(reason);
  const extensionDir = await graph();
  await writeFile(join(extensionDir, "src/index.ts"), "import 'cancel-build';");
  const active = new AbortController();
  await expect(
    bundleCommand({
      extensionDir,
      command: "index",
      timeoutMs: 0,
      signal: active.signal,
      installedDependencies: false,
      sharedDependencies: async () => ({
        resolveShared() {
          active.abort(reason);
          return join(extensionDir, "src/part1.ts");
        },
        dependencyWarnings: () => [],
      }),
    }),
  ).rejects.toBe(reason);
});

test("engine deadlines inherit through handles and launch overrides win", async () => {
  const extensionDir = await graph();
  const engine = createEngine({ timeoutMs: 1 });
  const handle = engine.openExtension({ extensionDir });
  try {
    await expect(handle.launch("index")).rejects.toBeInstanceOf(BundleTimeoutError);
    const opened = await handle.launch("index", { timeoutMs: 0 });
    await opened.session.exited;
    await opened.close();
    const reason = new Error("cancel launch");
    await expect(handle.launch("index", { signal: AbortSignal.abort(reason) })).rejects.toBe(
      reason,
    );
  } finally {
    await engine.close();
  }
});
