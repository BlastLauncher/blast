import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { FilesystemExtensionCatalog, parseManifest } from "../dist/index.js";

const catalogRoot = fileURLToPath(new URL("./fixtures/catalog-root", import.meta.url));
const secondaryCatalogRoot = fileURLToPath(new URL("./fixtures/catalog-root-secondary", import.meta.url));

function createCatalog() {
  return new FilesystemExtensionCatalog({ root: catalogRoot });
}

async function waitFor(predicate, description, timeoutMilliseconds = 2000) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${description}`);
}

test("lists deterministic path-free command summaries without resolving entrypoints", async () => {
  const catalog = createCatalog();
  const commands = await catalog.listCommands();

  assert.deepEqual(commands, [
    {
      extensionId: "alpha",
      commandName: "index",
      title: "Alpha Index",
      extensionName: "Alpha Extension",
      entryPointMode: "view",
    },
    {
      extensionId: "alpha",
      commandName: "detail",
      title: "Alpha Detail",
      extensionName: "Alpha Extension",
      entryPointMode: "view",
    },
    {
      extensionId: "beta",
      commandName: "main",
      title: "Beta Main",
      extensionName: "Beta Extension",
      ownerOrAuthorName: "beta-owner",
      entryPointMode: "view",
    },
    {
      extensionId: "dup",
      commandName: "index",
      title: "Duplicate Index",
      extensionName: "Duplicate A",
      entryPointMode: "view",
    },
    {
      extensionId: "gamma",
      commandName: "index",
      title: "Gamma Index",
      extensionName: "Gamma Extension",
      entryPointMode: "view",
    },
    {
      extensionId: "zeta",
      commandName: "escape",
      title: "Escape",
      extensionName: "Zeta Extension",
      entryPointMode: "view",
    },
    {
      extensionId: "zeta",
      commandName: "absolute",
      title: "Absolute",
      extensionName: "Zeta Extension",
      entryPointMode: "view",
    },
  ]);
  assert.equal(JSON.stringify(commands).includes(catalogRoot), false);
  assert.equal(JSON.stringify(commands).includes("secret"), false);
  for (const command of commands) {
    assert.equal("entrypoint" in command, false);
    assert.equal("rootDirectory" in command, false);
    assert.equal("preferences" in command, false);
    assert.equal("preferenceMetadata" in command, false);
  }
});

test("resolves Raycast-style manifests through the entrypoint convention", async () => {
  const catalog = createCatalog();

  const index = await catalog.resolve({ extensionId: "alpha", commandName: "index" });
  assert.deepEqual(index, {
    extensionId: "alpha",
    commandName: "index",
    entrypoint: path.join(catalogRoot, "alpha-extension", "src", "index.tsx"),
    rootDirectory: path.join(catalogRoot, "alpha-extension"),
    extensionName: "Alpha Extension",
    entryPointMode: "view",
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
    extensionName: "Beta Extension",
    ownerOrAuthorName: "beta-owner",
    entryPointMode: "view",
    preferences: { token: "secret", enabled: true, layout: "Grid" },
    preferenceMetadata: {
      token: {
        name: "token",
        type: "password",
        required: true,
        title: "Token",
        description: "API token",
        default: "secret",
        placeholder: "token...",
      },
      enabled: {
        name: "enabled",
        type: "checkbox",
        required: false,
        title: "Enabled",
        description: "Enable the fixture",
        default: true,
        label: "Enabled",
      },
      layout: {
        name: "layout",
        type: "dropdown",
        required: true,
        title: "Layout",
        description: "Choose a layout",
        default: "Grid",
        data: [
          { title: "Grid", value: "Grid" },
          { title: "List", value: "List" },
        ],
      },
    },
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

test("uses ordered additional roots without overriding the primary root", async () => {
  const catalog = new FilesystemExtensionCatalog({
    root: secondaryCatalogRoot,
    additionalRoots: [catalogRoot],
  });

  assert.deepEqual(catalog.roots, [secondaryCatalogRoot, catalogRoot]);
  assert.deepEqual(await catalog.listCommands(), [
    {
      extensionId: "alpha",
      commandName: "index",
      title: "Secondary Index",
      extensionName: "Secondary Alpha",
      entryPointMode: "view",
    },
    {
      extensionId: "secondary",
      commandName: "index",
      title: "Secondary Index",
      extensionName: "Secondary Extension",
      entryPointMode: "view",
    },
    {
      extensionId: "beta",
      commandName: "main",
      title: "Beta Main",
      extensionName: "Beta Extension",
      ownerOrAuthorName: "beta-owner",
      entryPointMode: "view",
    },
    {
      extensionId: "dup",
      commandName: "index",
      title: "Duplicate Index",
      extensionName: "Duplicate A",
      entryPointMode: "view",
    },
    {
      extensionId: "gamma",
      commandName: "index",
      title: "Gamma Index",
      extensionName: "Gamma Extension",
      entryPointMode: "view",
    },
    {
      extensionId: "zeta",
      commandName: "escape",
      title: "Escape",
      extensionName: "Zeta Extension",
      entryPointMode: "view",
    },
    {
      extensionId: "zeta",
      commandName: "absolute",
      title: "Absolute",
      extensionName: "Zeta Extension",
      entryPointMode: "view",
    },
  ]);
  assert.equal(
    (await catalog.resolve({ extensionId: "alpha", commandName: "index" })).rootDirectory,
    path.join(secondaryCatalogRoot, "alpha-override"),
  );
});

test("ignores a missing optional additional root", async () => {
  const catalog = new FilesystemExtensionCatalog({
    root: catalogRoot,
    additionalRoots: [path.join(catalogRoot, "missing-additional-root")],
  });
  assert.equal((await catalog.listCommands()).length, 7);
});

test("refreshes the cached catalog after extensions are added, changed, or removed", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "blast-catalog-refresh-"));
  try {
    const extensionDirectory = path.join(root, "fresh-extension");
    mkdirSync(path.join(extensionDirectory, "src"), { recursive: true });
    const manifestPath = path.join(extensionDirectory, "package.json");
    writeFileSync(
      manifestPath,
      JSON.stringify({ name: "fresh", title: "Fresh", commands: [{ name: "index", title: "Before" }] }),
    );

    const catalog = new FilesystemExtensionCatalog({ root });
    assert.equal((await catalog.listCommands())[0]?.title, "Before");

    writeFileSync(
      manifestPath,
      JSON.stringify({ name: "fresh", title: "Fresh", commands: [{ name: "index", title: "After" }] }),
    );
    const addedDirectory = path.join(root, "added-extension");
    mkdirSync(path.join(addedDirectory, "src"), { recursive: true });
    writeFileSync(
      path.join(addedDirectory, "package.json"),
      JSON.stringify({ name: "added", commands: [{ name: "index" }] }),
    );

    await catalog.refresh();
    assert.deepEqual(
      (await catalog.listCommands()).map(({ extensionId, title }) => ({ extensionId, title })),
      [
        { extensionId: "added", title: undefined },
        { extensionId: "fresh", title: "After" },
      ],
    );

    rmSync(extensionDirectory, { recursive: true, force: true });
    await catalog.refresh();
    assert.deepEqual(
      (await catalog.listCommands()).map(({ extensionId }) => extensionId),
      ["added"],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("watches manifest and extension-directory changes", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "blast-catalog-watch-"));
  const extensionDirectory = path.join(root, "watched-extension");
  mkdirSync(path.join(extensionDirectory, "src"), { recursive: true });
  const manifestPath = path.join(extensionDirectory, "package.json");
  writeFileSync(manifestPath, JSON.stringify({ name: "watched", title: "Before", commands: [{ name: "index" }] }));

  const catalog = new FilesystemExtensionCatalog({ root });
  let changeCount = 0;
  const watcher = await catalog.watch(() => {
    changeCount += 1;
  });
  try {
    const waitForNextChange = async (previousCount) =>
      waitFor(() => changeCount > previousCount, "the catalog watcher notification");

    const beforeManifestChange = changeCount;
    writeFileSync(manifestPath, JSON.stringify({ name: "watched", title: "After", commands: [{ name: "index" }] }));
    await waitForNextChange(beforeManifestChange);
    assert.equal((await catalog.listCommands())[0]?.extensionName, "After");

    const addedDirectory = path.join(root, "added-extension");
    const beforeAdd = changeCount;
    mkdirSync(path.join(addedDirectory, "src"), { recursive: true });
    writeFileSync(
      path.join(addedDirectory, "package.json"),
      JSON.stringify({ name: "added", commands: [{ name: "index" }] }),
    );
    await waitForNextChange(beforeAdd);
    assert.deepEqual(
      (await catalog.listCommands()).map(({ extensionId }) => extensionId),
      ["added", "watched"],
    );

    const beforeRemove = changeCount;
    rmSync(extensionDirectory, { recursive: true, force: true });
    await waitForNextChange(beforeRemove);
    assert.deepEqual(
      (await catalog.listCommands()).map(({ extensionId }) => extensionId),
      ["added"],
    );
  } finally {
    watcher.close();
    rmSync(root, { recursive: true, force: true });
  }
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
    commands: [{ name: "index", entrypoint: undefined, mode: "view" }],
    preferences: {},
    preferenceMetadata: {},
  });

  assert.deepEqual(
    parseManifest({
      name: "sample",
      commands: [
        { name: "view", mode: "view" },
        { name: "background", mode: "no-view" },
        { name: "menu", mode: "menu-bar" },
      ],
    })?.commands.map(({ name, mode }) => ({ name, mode })),
    [
      { name: "view", mode: "view" },
      { name: "background", mode: "no-view" },
      { name: "menu", mode: "menu-bar" },
    ],
  );

  assert.equal(parseManifest({ commands: [] }), undefined);
  assert.equal(parseManifest({ name: "sample", commands: "index" }), undefined);
  assert.equal(parseManifest({ name: "sample", commands: [{ name: "" }] }), undefined);
  assert.equal(parseManifest({ name: "sample", commands: [{ name: "index", entrypoint: 7 }] }), undefined);
  assert.equal(parseManifest({ name: "sample", commands: [{ name: "index", mode: "invalid" }] }), undefined);
  assert.equal(parseManifest("sample"), undefined);

  assert.deepEqual(
    parseManifest({
      name: "sample",
      title: "Sample Extension",
      author: "sample-author",
      owner: "sample-owner",
      commands: [{ name: "index" }],
    }),
    {
      name: "sample",
      title: "Sample Extension",
      author: "sample-author",
      owner: "sample-owner",
      commands: [{ name: "index", entrypoint: undefined }],
      preferences: {},
      preferenceMetadata: {},
    },
  );
  assert.equal(parseManifest({ name: "sample", title: 7, commands: [{ name: "index" }] }), undefined);
  assert.equal(parseManifest({ name: "sample", author: "", commands: [{ name: "index" }] }), undefined);
});

test("resolves manifest preference defaults", (context) => {
  context.test("defaults and checkbox fallback", () => {
    const manifest = parseManifest({
      name: "sample",
      commands: [{ name: "index" }],
      preferences: [
        { name: "city", type: "textfield", default: "Berlin" },
        { name: "enabled", type: "checkbox" },
        { name: "limit", type: "number", default: 5 },
      ],
    });
    assert.deepEqual(manifest.preferences, { city: "Berlin", enabled: false, limit: 5 });
    assert.deepEqual(manifest.preferenceMetadata, {
      city: {
        name: "city",
        type: "textfield",
        required: false,
        title: "",
        description: "",
        default: "Berlin",
      },
      enabled: {
        name: "enabled",
        type: "checkbox",
        required: false,
        title: "",
        description: "",
      },
    });
  });

  context.test("invalid checkbox default invalidates the manifest", () => {
    assert.equal(
      parseManifest({
        name: "sample",
        commands: [],
        preferences: [{ name: "enabled", type: "checkbox", default: "yes" }],
      }),
      undefined,
    );
  });

  context.test("descriptor carries preferences", async () => {
    const catalog = createCatalog();
    const descriptor = await catalog.resolve({ extensionId: "beta", commandName: "main" });
    assert.deepEqual(descriptor.preferences, { token: "secret", enabled: true, layout: "Grid" });
    assert.equal(descriptor.preferenceMetadata.layout.data[1].value, "List");
    assert.equal(descriptor.preferenceMetadata.token.placeholder, "token...");
  });

  context.test("parses command-scoped defaults", () => {
    const manifest = parseManifest({
      name: "sample",
      commands: [
        {
          name: "index",
          preferences: [
            { name: "layout", type: "dropdown", default: "Grid" },
            { name: "enabled", type: "checkbox" },
          ],
        },
      ],
    });
    assert.deepEqual(manifest.commands[0], {
      name: "index",
      entrypoint: undefined,
      preferences: { layout: "Grid", enabled: false },
      preferenceMetadata: {
        layout: {
          name: "layout",
          type: "dropdown",
          required: false,
          title: "",
          description: "",
          default: "Grid",
        },
        enabled: {
          name: "enabled",
          type: "checkbox",
          required: false,
          title: "",
          description: "",
        },
      },
    });
  });

  context.test("command defaults override extension defaults", () => {
    const manifest = parseManifest({
      name: "sample",
      commands: [
        {
          name: "index",
          preferences: [{ name: "layout", type: "dropdown", default: "Grid" }],
        },
      ],
      preferences: [{ name: "layout", type: "dropdown", default: "List" }],
    });
    assert.deepEqual(manifest.commands[0].preferences, { layout: "Grid" });
    assert.equal(manifest.commands[0].preferenceMetadata.layout.default, "Grid");
  });
});
