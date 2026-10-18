import { fileURLToPath } from "node:url";
import { createElement } from "react";

import { configureRaycastCompat, runCommand } from "@blastlauncher/raycast-compat";
import { createBundlingEntrypointLoader, runNodeExtensionBootstrap } from "@blastlauncher/extension-runtime-node";

const raycastCompatPath = fileURLToPath(import.meta.resolve("@blastlauncher/raycast-compat"));
const reactModulePath = fileURLToPath(import.meta.resolve("react")).replace(/\/index\.js$/, "");
const workspaceVendorRoot = fileURLToPath(new URL("../../../../node_modules", import.meta.url));

let messageId = 0;
await runNodeExtensionBootstrap({
  implementation: { name: "e2e-runtime", version: "0.0.0" },
  createMessageId: () => `runtime-${++messageId}`,
  loadEntrypoint: createBundlingEntrypointLoader({
    alias: { "@raycast/api": raycastCompatPath },
    dependencyPolicy: { strategy: "vendored", vendorRoots: [workspaceVendorRoot] },
    reactModulePath,
    ...(process.env.BLAST_EXTENSION_BUNDLE_PREFIX === undefined
      ? {}
      : { temporaryDirectoryPrefix: process.env.BLAST_EXTENSION_BUNDLE_PREFIX }),
  }),
  configureApi: (context) => {
    configureRaycastCompat(context);
  },
  renderComponent: (context, Component) => {
    runCommand(context, (launchProps) => createElement(Component, launchProps));
  },
});
