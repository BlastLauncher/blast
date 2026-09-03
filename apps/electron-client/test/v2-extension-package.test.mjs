import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const {
  createV2ExtensionPackageFailure,
  createV2ExtensionPackageSuccess,
  parseV2ExtensionPackageId,
  runV2ExtensionPackageIdentityOperation,
  runV2ExtensionPackageSourceOperation,
} = await import("../dist/v2ExtensionPackageTypes.js");
const { registerV2ExtensionPackageIPCEvents } = await import("../dist/v2ExtensionPackages.js");
const {
  V2ExtensionPackageConfirmation,
  V2ExtensionPackageControls,
  describeV2ExtensionPackageCancellation,
  describeV2ExtensionPackageProgress,
} = await import("../dist/renderer/V2ExtensionPackageControls.js");
const { V2ClientChannels } = await import("../dist/v2ClientChannels.js");

test("serializes package results without managed paths", () => {
  const success = createV2ExtensionPackageSuccess({
    extensionId: "demo.extension",
    version: "1.2.3",
    directory: "/home/example/.blast/external-extensions/demo.extension",
    sourceKind: "external",
  });
  assert.deepEqual(success, {
    ok: true,
    package: {
      extensionId: "demo.extension",
      version: "1.2.3",
      sourceKind: "external",
    },
  });
  assert.equal(JSON.stringify(success).includes("/home/example"), false);
});

test("creates structured package failures and validates IDs", () => {
  assert.deepEqual(createV2ExtensionPackageFailure("package_source_cancelled", "Cancelled"), {
    ok: false,
    error: { code: "package_source_cancelled", message: "Cancelled" },
  });
  assert.equal(parseV2ExtensionPackageId("@vendor/demo"), "@vendor/demo");
  assert.equal(parseV2ExtensionPackageId(""), undefined);
  assert.equal(parseV2ExtensionPackageId({ extensionId: "demo" }), undefined);
  assert.equal(parseV2ExtensionPackageId("x".repeat(257)), undefined);
});

test("keeps chooser cancellation and store failures renderer-safe", async () => {
  let installCalled = false;
  const store = {
    install: async (source) => {
      installCalled = true;
      assert.equal(source, "/home/example/extension.tgz");
      return {
        extensionId: "demo.extension",
        version: "1.0.0",
        directory: "/home/example/.blast/external-extensions/demo.extension",
        sourceKind: "external",
      };
    },
    update: async () => {
      throw { code: "extension_not_installed", message: "Missing package", details: "/secret/path" };
    },
    remove: async () => {
      throw new Error("unexpected remove");
    },
    rollback: async () => {
      throw new Error("unexpected rollback");
    },
  };

  const cancelled = await runV2ExtensionPackageSourceOperation(store, "install", async () => undefined);
  assert.deepEqual(cancelled, {
    ok: false,
    error: { code: "package_source_cancelled", message: "Extension package selection cancelled." },
  });
  assert.equal(installCalled, false);

  const installed = await runV2ExtensionPackageSourceOperation(
    store,
    "install",
    async () => "/home/example/extension.tgz",
  );
  assert.deepEqual(installed, {
    ok: true,
    package: { extensionId: "demo.extension", version: "1.0.0", sourceKind: "external" },
  });
  assert.equal(JSON.stringify(installed).includes("/home/example"), false);
  assert.equal(installCalled, true);

  const failed = await runV2ExtensionPackageSourceOperation(store, "update", async () => "/secret/path/update.tgz");
  assert.deepEqual(failed, {
    ok: false,
    error: { code: "extension_not_installed", message: "The requested extension package is not installed." },
  });
  assert.equal(JSON.stringify(failed).includes("/secret"), false);

  const invalidIdentity = await runV2ExtensionPackageIdentityOperation(store, "remove", { extensionId: "demo" });
  assert.deepEqual(invalidIdentity, {
    ok: false,
    error: {
      code: "invalid_extension_package",
      message: "Extension package operations require a non-empty extension ID.",
    },
  });
});

test("registers path-free package IPC handlers and cleans them up", async () => {
  const handlers = new Map();
  const removedChannels = [];
  const fakeIpcMain = {
    handle: (channel, handler) => handlers.set(channel, handler),
    removeHandler: (channel) => {
      removedChannels.push(channel);
      handlers.delete(channel);
    },
  };
  let selectedOperation;
  let selectedSource;
  const store = {
    install: async (source) => {
      selectedSource = source;
      return { extensionId: "demo.extension", version: "1.0.0", directory: "/secret", sourceKind: "external" };
    },
    update: async () => {
      throw { code: "extension_target_unsafe", message: "contains /secret" };
    },
    remove: async (extensionId) => ({ extensionId, directory: "/secret", sourceKind: "external" }),
    rollback: async (extensionId) => ({ extensionId, directory: "/secret", sourceKind: "external" }),
  };
  const registration = registerV2ExtensionPackageIPCEvents({
    ipcMain: fakeIpcMain,
    store,
    selectSource: async (_event, operation) => {
      selectedOperation = operation;
      return "/selected/package.tgz";
    },
  });
  const event = { sender: {} };

  assert.equal(await handlers.get(V2ClientChannels.extensionPackagesEnabled)(event), true);
  const installed = await handlers.get(V2ClientChannels.installExtensionPackage)(event, "/renderer/path.tgz");
  assert.deepEqual(installed, {
    ok: true,
    package: { extensionId: "demo.extension", version: "1.0.0", sourceKind: "external" },
  });
  assert.equal(selectedOperation, "install");
  assert.equal(selectedSource, "/selected/package.tgz");

  const invalid = await handlers.get(V2ClientChannels.removeExtensionPackage)(event, { extensionId: "demo" });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error.code, "invalid_extension_package");

  const removed = await handlers.get(V2ClientChannels.removeExtensionPackage)(event, "demo.extension");
  assert.deepEqual(removed, {
    ok: true,
    package: { extensionId: "demo.extension", sourceKind: "external" },
  });
  const failed = await handlers.get(V2ClientChannels.updateExtensionPackage)(event);
  assert.deepEqual(failed, {
    ok: false,
    error: { code: "extension_target_unsafe", message: "Managed extension storage is unsafe." },
  });

  registration.dispose();
  registration.dispose();
  assert.equal(handlers.size, 0);
  assert.deepEqual(removedChannels, [
    V2ClientChannels.extensionPackagesEnabled,
    V2ClientChannels.installExtensionPackage,
    V2ClientChannels.updateExtensionPackage,
    V2ClientChannels.removeExtensionPackage,
    V2ClientChannels.rollbackExtensionPackage,
  ]);
});

test("renders minimal external package management controls", () => {
  const markup = renderToStaticMarkup(
    React.createElement(V2ExtensionPackageControls, {
      api: {
        isEnabled: async () => true,
        install: async () => ({ ok: false, error: { code: "package_source_cancelled", message: "Cancelled" } }),
        update: async () => ({ ok: false, error: { code: "package_source_cancelled", message: "Cancelled" } }),
        remove: async () => ({ ok: false, error: { code: "package_source_cancelled", message: "Cancelled" } }),
        rollback: async () => ({ ok: false, error: { code: "package_source_cancelled", message: "Cancelled" } }),
      },
      commands: [
        { extensionId: "demo.extension", commandName: "index", sourceKind: "external" },
        { extensionId: "demo.extension", commandName: "other", sourceKind: "external" },
        { extensionId: "curated.extension", commandName: "index", sourceKind: "raycast-curated" },
      ],
      disabled: false,
      enabled: true,
      onRefresh: async () => {},
    }),
  );

  assert.match(markup, /External packages/);
  assert.match(markup, /data-v2-package-controls="true"/);
  assert.match(markup, /aria-busy="false"/);
  assert.match(markup, /Import package/);
  assert.match(markup, /Update package/);
  assert.match(markup, /Remove demo\.extension/);
  assert.match(markup, /Rollback demo\.extension/);
  assert.doesNotMatch(markup, /curated\.extension/);
  assert.doesNotMatch(markup, /\/home\/example|\.blast\/external-extensions/);
});

test("requires explicit confirmation for destructive package actions", () => {
  const removeMarkup = renderToStaticMarkup(
    React.createElement(V2ExtensionPackageConfirmation, {
      disabled: false,
      extensionId: "demo.extension",
      onCancel: () => {},
      onConfirm: () => {},
      operation: "remove",
    }),
  );
  assert.match(removeMarkup, /Remove demo\.extension from managed packages\?/);
  assert.match(removeMarkup, /Remove demo\.extension confirmation/);
  assert.match(removeMarkup, />Cancel</);
  assert.match(removeMarkup, />Remove</);

  const rollbackMarkup = renderToStaticMarkup(
    React.createElement(V2ExtensionPackageConfirmation, {
      disabled: true,
      extensionId: "demo.extension",
      onCancel: () => {},
      onConfirm: () => {},
      operation: "rollback",
    }),
  );
  assert.match(rollbackMarkup, /Restore the previous package for demo\.extension\?/);
  assert.match(rollbackMarkup, /disabled=""/);
  assert.equal(describeV2ExtensionPackageProgress("remove", "demo.extension"), "Removing demo.extension…");
  assert.equal(describeV2ExtensionPackageProgress("rollback", "demo.extension"), "Restoring demo.extension…");
  assert.equal(describeV2ExtensionPackageCancellation("install"), "Import cancelled; no package was changed.");
  assert.equal(describeV2ExtensionPackageCancellation("update"), "Update cancelled; no package was changed.");
});

test("does not render package controls when the main bridge is unavailable", () => {
  const markup = renderToStaticMarkup(
    React.createElement(V2ExtensionPackageControls, {
      api: {
        isEnabled: async () => false,
        install: async () => ({ ok: false, error: { code: "package_lifecycle_unavailable", message: "Unavailable" } }),
        update: async () => ({ ok: false, error: { code: "package_lifecycle_unavailable", message: "Unavailable" } }),
        remove: async () => ({ ok: false, error: { code: "package_lifecycle_unavailable", message: "Unavailable" } }),
        rollback: async () => ({ ok: false, error: { code: "package_lifecycle_unavailable", message: "Unavailable" } }),
      },
      commands: [],
      disabled: false,
      enabled: false,
      onRefresh: async () => {},
    }),
  );

  assert.equal(markup, "");
});
