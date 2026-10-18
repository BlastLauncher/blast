import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { ensureExtensionDependencies, ExtensionDepsError } from "../dist/index.js";

async function makeRoots() {
  const base = await mkdtemp(path.join(tmpdir(), "blast-deps-test-"));
  return { base, extensionRoot: path.join(base, "ext"), storeRoot: path.join(base, "store") };
}

async function writeManifest(extensionRoot, dependencies) {
  await mkdir(extensionRoot, { recursive: true });
  await writeFile(
    path.join(extensionRoot, "package.json"),
    JSON.stringify({ name: "fixture", version: "1.0.0", dependencies }),
    "utf8",
  );
}

function stubInstall({ packages = {}, fail, extraFiles = {} } = {}) {
  let calls = 0;
  const runInstall = async (command, args, options) => {
    calls += 1;
    assert.equal(command, "npm");
    assert.ok(args.includes("install"));
    if (fail !== undefined) {
      throw fail;
    }
    for (const [name, version] of Object.entries(packages)) {
      const directory = path.join(options.cwd, "node_modules", ...name.split("/"));
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, "package.json"), JSON.stringify({ name, version }));
    }
    for (const [relative, content] of Object.entries(extraFiles)) {
      const full = path.join(options.cwd, relative);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, content);
    }
    return { stdout: "", stderr: "" };
  };
  return { runInstall, calls: () => calls };
}

async function storeEntries(storeRoot) {
  const { readdir } = await import("node:fs/promises");
  return readdir(storeRoot).catch(() => []);
}

test("skips installation when the manifest has no dependencies", async (t) => {
  const { base, extensionRoot, storeRoot } = await makeRoots();
  t.after(() => rm(base, { recursive: true, force: true }));
  await writeManifest(extensionRoot, {});
  const stub = stubInstall({ packages: {} });

  const view = await ensureExtensionDependencies({
    extensionRoot,
    extensionId: "example.empty",
    storeRoot,
    runInstall: stub.runInstall,
  });

  assert.equal(view.installed, false);
  assert.deepEqual(view.resolved, {});
  assert.equal(stub.calls(), 0);
});

test("installs once and reuses the lockfile on the second call", async (t) => {
  const { base, extensionRoot, storeRoot } = await makeRoots();
  t.after(() => rm(base, { recursive: true, force: true }));
  await writeManifest(extensionRoot, { leftpad: "^1.3.0" });
  const stub = stubInstall({ packages: { leftpad: "1.3.0" } });
  const options = { extensionRoot, extensionId: "example.cached", storeRoot, runInstall: stub.runInstall };

  const first = await ensureExtensionDependencies(options);
  assert.equal(first.installed, true);
  assert.deepEqual(first.resolved, { leftpad: "1.3.0" });

  const second = await ensureExtensionDependencies(options);
  assert.equal(second.installed, false);
  assert.deepEqual(second.resolved, { leftpad: "1.3.0" });
  assert.equal(second.nodeModulesRoot, first.nodeModulesRoot);
  assert.equal(stub.calls(), 1);

  const lockfile = JSON.parse(
    await readFile(path.join(path.dirname(first.nodeModulesRoot), "blast-deps-lock.json"), "utf8"),
  );
  assert.equal(lockfile.version, 1);
  assert.equal(lockfile.extensionId, "example.cached");
});

test("reinstalls when manifest dependencies change", async (t) => {
  const { base, extensionRoot, storeRoot } = await makeRoots();
  t.after(() => rm(base, { recursive: true, force: true }));
  await writeManifest(extensionRoot, { leftpad: "^1.3.0" });
  const stub = stubInstall({ packages: { leftpad: "1.3.0", isodd: "3.0.1" } });
  const options = { extensionRoot, extensionId: "example.changed", storeRoot, runInstall: stub.runInstall };

  await ensureExtensionDependencies(options);
  await writeManifest(extensionRoot, { leftpad: "^1.3.0", isodd: "^3.0.1" });
  const second = await ensureExtensionDependencies(options);

  assert.equal(second.installed, true);
  assert.equal(stub.calls(), 2);
});

test("isolates views per extension identity", async (t) => {
  const { base, extensionRoot, storeRoot } = await makeRoots();
  t.after(() => rm(base, { recursive: true, force: true }));
  await writeManifest(extensionRoot, { leftpad: "^1.3.0" });
  const stub = stubInstall({ packages: { leftpad: "1.3.0" } });

  const first = await ensureExtensionDependencies({
    extensionRoot,
    extensionId: "example.one",
    storeRoot,
    runInstall: stub.runInstall,
  });
  const second = await ensureExtensionDependencies({
    extensionRoot,
    extensionId: "example.two",
    storeRoot,
    runInstall: stub.runInstall,
  });

  assert.notEqual(first.nodeModulesRoot, second.nodeModulesRoot);
  assert.equal(stub.calls(), 2);
});

test("skips gracefully when the manifest is missing", async (t) => {
  const { base, extensionRoot, storeRoot } = await makeRoots();
  t.after(() => rm(base, { recursive: true, force: true }));
  const stub = stubInstall({});

  const view = await ensureExtensionDependencies({
    extensionRoot,
    extensionId: "example.nomani",
    storeRoot,
    runInstall: stub.runInstall,
  });

  assert.equal(view.installed, false);
  assert.equal(stub.calls(), 0);
});

test("rejects an invalid manifest with a structured code", async (t) => {
  const { base, extensionRoot, storeRoot } = await makeRoots();
  t.after(() => rm(base, { recursive: true, force: true }));
  await mkdir(extensionRoot, { recursive: true });
  await writeFile(path.join(extensionRoot, "package.json"), "{not json", "utf8");

  await assert.rejects(
    () =>
      ensureExtensionDependencies({
        extensionRoot,
        extensionId: "example.broken",
        storeRoot,
        runInstall: stubInstall({}).runInstall,
      }),
    (error) => error instanceof ExtensionDepsError && error.code === "dependency_manifest_invalid",
  );
});

test("maps install failures to dependency_install_failed with bounded output", async (t) => {
  const { base, extensionRoot, storeRoot } = await makeRoots();
  t.after(() => rm(base, { recursive: true, force: true }));
  await writeManifest(extensionRoot, { nope: "^9.9.9" });
  const failure = Object.assign(new Error("npm ERR! 404 Not Found"), { stderr: `npm ERR! 404\n${"x".repeat(10_000)}` });
  const stub = stubInstall({ fail: failure });

  const error = await ensureExtensionDependencies({
    extensionRoot,
    extensionId: "example.failed",
    storeRoot,
    runInstall: stub.runInstall,
  }).then(
    () => undefined,
    (value) => value,
  );

  assert.ok(error instanceof ExtensionDepsError);
  assert.equal(error.code, "dependency_install_failed");
  assert.ok(JSON.stringify(error.details).length < 8_192);
});

test("maps platform refusals to dependency_platform_unsupported", async (t) => {
  const { base, extensionRoot, storeRoot } = await makeRoots();
  t.after(() => rm(base, { recursive: true, force: true }));
  await writeManifest(extensionRoot, { nativeish: "^1.0.0" });
  const failure = Object.assign(new Error("npm ERR! not compatible"), {
    stderr: "npm ERR! EBADPLATFORM Unsupported platform for nativeish: wanted darwin, current linux",
  });

  await assert.rejects(
    () =>
      ensureExtensionDependencies({
        extensionRoot,
        extensionId: "example.native",
        storeRoot,
        runInstall: stubInstall({ fail: failure }).runInstall,
      }),
    (error) => error instanceof ExtensionDepsError && error.code === "dependency_platform_unsupported",
  );
});

test("maps offline cache misses to dependency_offline_unavailable", async (t) => {
  const { base, extensionRoot, storeRoot } = await makeRoots();
  t.after(() => rm(base, { recursive: true, force: true }));
  await writeManifest(extensionRoot, { leftpad: "^1.3.0" });
  const failure = Object.assign(new Error("npm ERR! cache miss"), { stderr: "npm ERR! cache miss in offline mode" });

  await assert.rejects(
    () =>
      ensureExtensionDependencies({
        extensionRoot,
        extensionId: "example.offline",
        storeRoot,
        offline: true,
        runInstall: stubInstall({ fail: failure }).runInstall,
      }),
    (error) => error instanceof ExtensionDepsError && error.code === "dependency_offline_unavailable",
  );
});

test("enforces the per-extension install quota and removes the view", async (t) => {
  const { base, extensionRoot, storeRoot } = await makeRoots();
  t.after(() => rm(base, { recursive: true, force: true }));
  await writeManifest(extensionRoot, { heavy: "^1.0.0" });
  const stub = stubInstall({
    packages: { heavy: "1.0.0" },
    extraFiles: { "node_modules/heavy/blob.bin": "x".repeat(4_096) },
  });

  await assert.rejects(
    () =>
      ensureExtensionDependencies({
        extensionRoot,
        extensionId: "example.heavy",
        storeRoot,
        maxInstallBytes: 128,
        runInstall: stub.runInstall,
      }),
    (error) => error instanceof ExtensionDepsError && error.code === "dependency_install_too_large",
  );
  assert.deepEqual(await storeEntries(storeRoot), []);
});

test("evicts the least-recently-used view when the cache quota is exceeded", async (t) => {
  const { base, extensionRoot, storeRoot } = await makeRoots();
  t.after(() => rm(base, { recursive: true, force: true }));
  await writeManifest(extensionRoot, { leftpad: "^1.3.0" });
  const payload = "x".repeat(2_048);
  const stub = stubInstall({
    packages: { leftpad: "1.3.0" },
    extraFiles: { "node_modules/leftpad/data.bin": payload },
  });

  const first = await ensureExtensionDependencies({
    extensionRoot,
    extensionId: "example.first",
    storeRoot,
    maxInstallBytes: 1_048_576,
    maxCacheBytes: 3_000,
    runInstall: stub.runInstall,
  });
  const second = await ensureExtensionDependencies({
    extensionRoot,
    extensionId: "example.second",
    storeRoot,
    maxInstallBytes: 1_048_576,
    maxCacheBytes: 3_000,
    runInstall: stub.runInstall,
  });

  await assert.rejects(stat(first.nodeModulesRoot), { code: "ENOENT" });
  await stat(second.nodeModulesRoot);
});

test("rebases file ranges to the extension root", async (t) => {
  const { base, extensionRoot, storeRoot } = await makeRoots();
  t.after(() => rm(base, { recursive: true, force: true }));
  await writeManifest(extensionRoot, { localish: "file:./vendor/localish" });
  const stub = stubInstall({ packages: { localish: "1.0.0" } });

  const view = await ensureExtensionDependencies({
    extensionRoot,
    extensionId: "example.local",
    storeRoot,
    runInstall: stub.runInstall,
  });

  assert.equal(view.installed, true);
  const synthetic = JSON.parse(await readFile(path.join(path.dirname(view.nodeModulesRoot), "package.json"), "utf8"));
  assert.equal(synthetic.dependencies.localish, `file:${path.join(extensionRoot, "vendor/localish")}`);
});

test("rejects invalid options with a structured code", async (t) => {
  const { base, extensionRoot } = await makeRoots();
  t.after(() => rm(base, { recursive: true, force: true }));

  await assert.rejects(
    () => ensureExtensionDependencies({ extensionRoot, extensionId: "example.bad", storeRoot: "relative/path" }),
    (error) => error instanceof ExtensionDepsError && error.code === "invalid_deps_options",
  );
});
