import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import tar from "tar";

import { ExternalExtensionStore, FilesystemExtensionCatalog } from "../dist/index.js";

async function createPackage(parent, options = {}) {
  const extensionDirectory = await mkdtemp(path.join(parent, "package-source-"));
  const commandDirectory = path.join(extensionDirectory, "src");
  await mkdir(commandDirectory, { recursive: true });
  const extensionId = options.name ?? "demo.extension";
  const commandName = options.commandName ?? "index";
  const manifest = {
    name: extensionId,
    version: options.version ?? "1.0.0",
    title: options.title ?? "Demo Extension",
    commands: [{ name: commandName, title: options.commandTitle ?? "Run demo" }],
  };
  await writeFile(path.join(extensionDirectory, "package.json"), JSON.stringify(manifest));
  if (options.includeEntrypoint !== false) {
    await writeFile(path.join(commandDirectory, `${commandName}.js`), "module.exports = {};\n");
  }
  return extensionDirectory;
}

async function createSandbox() {
  return mkdtemp(path.join(os.tmpdir(), "blast-extension-store-"));
}

async function assertStoreError(action, code) {
  await assert.rejects(action, (error) => {
    assert.equal(error?.code, code);
    return true;
  });
}

async function assertDirectoryNames(directory, expected) {
  assert.deepEqual((await readdir(directory)).toSorted(), expected.toSorted());
}

test("imports a validated directory and refreshes the catalog once", async () => {
  const sandbox = await createSandbox();
  try {
    const root = path.join(sandbox, "external");
    const source = await createPackage(sandbox, { name: "demo.directory" });
    const catalog = new FilesystemExtensionCatalog({ root, rootSourceKind: "external" });
    let refreshCount = 0;
    const store = new ExternalExtensionStore({
      root,
      refreshCatalog: async () => {
        refreshCount += 1;
        await catalog.refresh();
      },
    });

    const installed = await store.install(source);
    const target = path.join(root, "demo.directory");
    assert.deepEqual(installed, {
      extensionId: "demo.directory",
      version: "1.0.0",
      directory: target,
      sourceKind: "external",
    });
    assert.equal(refreshCount, 1);
    assert.deepEqual(await store.getInstalled("demo.directory"), installed);
    assert.deepEqual(await catalog.listCommands(), [
      {
        extensionId: "demo.directory",
        commandName: "index",
        title: "Run demo",
        extensionName: "Demo Extension",
        entryPointMode: "view",
        sourceKind: "external",
      },
    ]);
    await assertStoreError(() => store.install(source), "extension_already_installed");
    assert.equal(refreshCount, 1);
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test("extracts a package archive with a single top-level directory", async () => {
  const sandbox = await createSandbox();
  try {
    const root = path.join(sandbox, "external");
    const source = await createPackage(sandbox, { name: "@vendor/archive-extension", version: "2.0.0" });
    const archive = path.join(sandbox, "archive-extension.tgz");
    await tar.c({ cwd: sandbox, file: archive, gzip: true }, [path.basename(source)]);

    const store = new ExternalExtensionStore({ root });
    const installed = await store.install(archive);
    assert.equal(installed.extensionId, "@vendor/archive-extension");
    assert.equal(installed.version, "2.0.0");
    assert.equal(installed.directory, path.join(root, "%40vendor%2Farchive-extension"));
    assert.equal(await readFile(path.join(installed.directory, "src", "index.js"), "utf8"), "module.exports = {};\n");
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test("updates, rolls back, removes, and restores a package through one backup slot", async () => {
  const sandbox = await createSandbox();
  try {
    const root = path.join(sandbox, "external");
    const sourceV1 = await createPackage(sandbox, { name: "recoverable.extension", version: "1.0.0" });
    const sourceV2 = await createPackage(sandbox, { name: "recoverable.extension", version: "2.0.0" });
    let refreshCount = 0;
    const store = new ExternalExtensionStore({
      root,
      refreshCatalog: () => {
        refreshCount += 1;
      },
    });

    await store.install(sourceV1);
    const invalidUpdate = await createPackage(sandbox, {
      name: "recoverable.extension",
      version: "broken",
      includeEntrypoint: false,
    });
    await assertStoreError(() => store.update(invalidUpdate), "invalid_extension_package");
    assert.equal((await store.getInstalled("recoverable.extension"))?.version, "1.0.0");
    assert.equal(refreshCount, 1);

    await store.update(sourceV2);
    assert.equal((await store.getInstalled("recoverable.extension"))?.version, "2.0.0");

    await store.rollback("recoverable.extension");
    assert.equal((await store.getInstalled("recoverable.extension"))?.version, "1.0.0");

    const removed = await store.remove("recoverable.extension");
    assert.equal(removed.version, "1.0.0");
    assert.equal(await store.getInstalled("recoverable.extension"), undefined);
    await assertDirectoryNames(root, []);

    const restored = await store.rollback("recoverable.extension");
    assert.equal(restored.version, "1.0.0");
    assert.equal((await store.getInstalled("recoverable.extension"))?.version, "1.0.0");
    assert.equal(refreshCount, 5);
    await assertDirectoryNames(store.backupRoot, []);
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test("rejects invalid packages without changing the active root", async () => {
  const sandbox = await createSandbox();
  try {
    const root = path.join(sandbox, "external");
    let refreshCount = 0;
    const store = new ExternalExtensionStore({
      root,
      refreshCatalog: () => {
        refreshCount += 1;
      },
    });
    const missingEntrypoint = await createPackage(sandbox, {
      name: "missing.entrypoint",
      includeEntrypoint: false,
    });
    await assertStoreError(() => store.install(missingEntrypoint), "invalid_extension_package");

    const unsafeSource = await createPackage(sandbox, { name: "unsafe.source" });
    await symlink(path.join(unsafeSource, "src", "index.js"), path.join(unsafeSource, "linked.js"));
    await assertStoreError(() => store.install(unsafeSource), "package_source_unsafe");

    const oversizedSource = await createPackage(sandbox, { name: "oversized.source" });
    const limitedStore = new ExternalExtensionStore({ root, maxPackageBytes: 100 });
    await assertStoreError(() => limitedStore.install(oversizedSource), "archive_too_large");

    await assertDirectoryNames(root, []);
    assert.equal(refreshCount, 0);
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test("rejects archives with links before extraction", async () => {
  const sandbox = await createSandbox();
  try {
    const root = path.join(sandbox, "external");
    const source = await createPackage(sandbox, { name: "unsafe.archive" });
    await symlink(path.join(source, "src", "index.js"), path.join(source, "linked.js"));
    const archive = path.join(sandbox, "unsafe.tgz");
    await tar.c({ cwd: sandbox, file: archive, gzip: true }, [path.basename(source)]);

    const store = new ExternalExtensionStore({ root });
    await assertStoreError(() => store.install(archive), "archive_invalid");
    await assertDirectoryNames(root, []);
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test("requires an active package or backup for destructive lifecycle operations", async () => {
  const sandbox = await createSandbox();
  try {
    const store = new ExternalExtensionStore({ root: path.join(sandbox, "external") });
    const source = await createPackage(sandbox, { name: "missing.update" });
    await assertStoreError(() => store.update(source), "extension_not_installed");
    await assertStoreError(() => store.install(path.join(sandbox, "missing.tgz")), "invalid_package_source");
    await assertStoreError(() => store.remove("missing.extension"), "extension_not_installed");
    await assertStoreError(() => store.rollback("missing.extension"), "rollback_unavailable");
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test("rejects nested roots and invalid lifecycle limits", () => {
  assert.throws(
    () => new ExternalExtensionStore({ root: "/tmp/blast-external", backupRoot: "/tmp/blast-external/backups" }),
    (error) => error?.code === "extension_store_invalid_options",
  );
  assert.throws(
    () => new ExternalExtensionStore({ root: "/tmp/blast-external", maxArchiveEntries: 0 }),
    (error) => error?.code === "extension_store_invalid_options",
  );
});
