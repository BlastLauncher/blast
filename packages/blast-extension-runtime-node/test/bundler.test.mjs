import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createBundlingEntrypointLoader } from "../dist/index.js";

const bundlesRoot = path.join(fileURLToPath(new URL("./fixtures", import.meta.url)), "bundles");
const vendorRoot = path.join(bundlesRoot, "vendor-node-modules");
const defaultAlias = { "@raycast/api": path.join(bundlesRoot, "raycast-api-stub.mjs") };

function createLoader(options = {}) {
  return createBundlingEntrypointLoader({ cacheDirectory: os.tmpdir(), alias: defaultAlias, ...options });
}

async function defaultBundleDirectories() {
  return new Set(
    (await readdir(os.tmpdir(), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("blast-extension-bundles-"))
      .map((entry) => entry.name),
  );
}

test("bundles a TSX entrypoint with alias resolution", async () => {
  const loader = createLoader();
  const entrypointModule = await loader(path.join(bundlesRoot, "tsx-command.tsx"));

  assert.equal(typeof entrypointModule.command, "function");
  assert.equal(typeof entrypointModule.default, "function");
  assert.equal(entrypointModule.command(), "stub-list:stub-circle");
});

test("reports bundling failures as structured entrypoint errors", async () => {
  const loader = createLoader();
  await assert.rejects(
    () => loader(path.join(bundlesRoot, "broken-syntax.tsx")),
    (error) => error.code === "entrypoint_load_failed",
  );
});

test("resolves dependencies only from explicitly configured vendor roots", async () => {
  const loader = createLoader({
    dependencyPolicy: { strategy: "vendored", vendorRoots: [vendorRoot] },
  });
  const entrypointModule = await loader(path.join(bundlesRoot, "vendor-command.tsx"));

  assert.equal(entrypointModule.command(), "vendored-value");
});

test("rejects invalid dependency policy roots", () => {
  assert.throws(
    () => createLoader({ dependencyPolicy: { strategy: "vendored", vendorRoots: ["relative-root"] } }),
    (error) => error.code === "dependency_policy_invalid",
  );
});

test("rejects temporary bundle directory prefixes that escape the temp directory", () => {
  assert.throws(
    () => createBundlingEntrypointLoader({ temporaryDirectoryPrefix: "../outside" }),
    (error) => error.code === "temporary_directory_prefix_invalid",
  );
});

test("cleans default temporary bundle directories after success and failure", async () => {
  const before = await defaultBundleDirectories();
  const loader = createBundlingEntrypointLoader({ alias: defaultAlias });

  const entrypointModule = await loader(path.join(bundlesRoot, "tsx-command.tsx"));
  assert.equal(typeof entrypointModule.command, "function");
  await assert.rejects(
    () => loader(path.join(bundlesRoot, "broken-syntax.tsx")),
    (error) => {
      return error.code === "entrypoint_load_failed";
    },
  );

  const after = await defaultBundleDirectories();
  assert.deepEqual(
    [...after].filter((directory) => !before.has(directory)),
    [],
  );
});

test("cleans default temporary bundle directories when terminated", async (t) => {
  if (process.platform === "win32") {
    t.skip("POSIX signals are not available on Windows");
    return;
  }

  const before = await defaultBundleDirectories();
  const moduleUrl = new URL("../dist/index.js", import.meta.url).href;
  const child = spawn(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { createBundlingEntrypointLoader } from ${JSON.stringify(moduleUrl)}; createBundlingEntrypointLoader(); await new Promise((resolve) => setTimeout(resolve, 100)); console.log("ready"); await new Promise(() => {});`,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );

  await new Promise((resolve, reject) => {
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.once("data", resolve);
    child.once("error", reject);
    child.stderr.once("data", (chunk) => reject(new Error(String(chunk))));
  });
  child.kill("SIGTERM");
  await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });

  const after = await defaultBundleDirectories();
  assert.deepEqual(
    [...after].filter((directory) => !before.has(directory)),
    [],
  );
});
