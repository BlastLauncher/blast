import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { FilesystemExtensionCatalog, parseManifest } from "../dist/index.js";

const catalogRoot = fileURLToPath(new URL("./fixtures/catalog-root", import.meta.url));

function createCatalog() {
  return new FilesystemExtensionCatalog({ root: catalogRoot });
}

test("resolves Raycast-style manifests through the entrypoint convention", async () => {
  const catalog = createCatalog();

  const index = await catalog.resolve({ extensionId: "alpha", commandName: "index" });
  assert.deepEqual(index, {
    extensionId: "alpha",
    commandName: "index",
    entrypoint: path.join(catalogRoot, "alpha-extension", "src", "index.tsx"),
    rootDirectory: path.join(catalogRoot, "alpha-extension"),
  });

  const detail = await catalog.resolve({ extensionId: "alpha", commandName: "detail" });
  assert.equal(detail?.entrypoint, path.join(catalogRoot, "alpha-extension", "src", "detail.js"));
});

test("resolves explicit manifest entrypoints", async () => {
  const catalog = createCatalog();
  const descriptor = await catalog.resolve({ extensionId: "beta", commandName: "main" });

  assert.deepEqual(descriptor, {
    extensionId: "beta",
    commandName: "main",
    entrypoint: path.join(catalogRoot, "beta-extension", "lib", "main.cjs"),
    rootDirectory: path.join(catalogRoot, "beta-extension"),
  });
});

test("returns undefined for unknown identities", async (context) => {
  const catalog = createCatalog();

  await context.test("unknown extension", async () => {
    assert.equal(await catalog.resolve({ extensionId: "missing", commandName: "index" }), undefined);
  });

  await context.test("unknown command", async () => {
    assert.equal(await catalog.resolve({ extensionId: "alpha", commandName: "missing" }), undefined);
  });
});

test("skips unreadable and invalid manifests without failing valid extensions", async (context) => {
  const catalog = createCatalog();

  await context.test("valid extensions still resolve", async () => {
    assert.ok(await catalog.resolve({ extensionId: "alpha", commandName: "index" }));
  });

  await context.test("manifest without commands", async () => {
    assert.equal(await catalog.resolve({ extensionId: "delta", commandName: "index" }), undefined);
  });

  await context.test("unparsable manifest", async () => {
    assert.equal(await catalog.resolve({ extensionId: "epsilon", commandName: "index" }), undefined);
  });
});

test("resolves duplicate extension names deterministically", async (context) => {
  const catalog = createCatalog();

  await context.test("first sorted directory wins", async () => {
    const descriptor = await catalog.resolve({ extensionId: "dup", commandName: "index" });
    assert.equal(descriptor?.rootDirectory, path.join(catalogRoot, "duplicate-a"));
  });

  await context.test("unknown command in the duplicate", async () => {
    assert.equal(await catalog.resolve({ extensionId: "dup", commandName: "missing" }), undefined);
  });
});

test("rejects entrypoints that escape the extension root", async (context) => {
  const catalog = createCatalog();

  await context.test("relative traversal", async () => {
    await assert.rejects(
      () => catalog.resolve({ extensionId: "zeta", commandName: "escape" }),
      (error) => error.code === "catalog_entrypoint_outside_root",
    );
  });

  await context.test("absolute path", async () => {
    await assert.rejects(
      () => catalog.resolve({ extensionId: "zeta", commandName: "absolute" }),
      (error) => error.code === "catalog_entrypoint_outside_root",
    );
  });
});

test("rejects commands without an existing entrypoint", async () => {
  const catalog = createCatalog();
  await assert.rejects(
    () => catalog.resolve({ extensionId: "gamma", commandName: "index" }),
    (error) => error.code === "catalog_entrypoint_missing",
  );
});

test("rejects an unreadable catalog root", async () => {
  const catalog = new FilesystemExtensionCatalog({ root: path.join(catalogRoot, "does-not-exist") });
  await assert.rejects(
    () => catalog.resolve({ extensionId: "alpha", commandName: "index" }),
    (error) => error.code === "catalog_root_unreadable",
  );
});

test("rejects invalid identities without touching the filesystem", async () => {
  const catalog = createCatalog();
  await assert.rejects(
    () => catalog.resolve({ extensionId: "alpha", commandName: "" }),
    (error) => error.code === "invalid_command_identity",
  );
});

test("honors an aborted signal", async () => {
  const catalog = createCatalog();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => catalog.resolve({ extensionId: "alpha", commandName: "index" }, controller.signal));
});

test("parses manifests strictly", () => {
  assert.deepEqual(parseManifest({ name: "sample", commands: [{ name: "index", mode: "view" }] }), {
    name: "sample",
    commands: [{ name: "index", entrypoint: undefined }],
  });

  assert.equal(parseManifest({ commands: [] }), undefined);
  assert.equal(parseManifest({ name: "sample", commands: "index" }), undefined);
  assert.equal(parseManifest({ name: "sample", commands: [{ name: "" }] }), undefined);
  assert.equal(parseManifest({ name: "sample", commands: [{ name: "index", entrypoint: 7 }] }), undefined);
  assert.equal(parseManifest("sample"), undefined);
});
