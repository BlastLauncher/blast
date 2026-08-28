import { fileURLToPath } from "node:url";
import { createElement } from "react";

import { configureRaycastCompat, runCommand } from "@blastlauncher/raycast-compat";
import { createBundlingEntrypointLoader, runNodeExtensionBootstrap } from "@blastlauncher/extension-runtime-node";

const raycastCompatPath = fileURLToPath(import.meta.resolve("@blastlauncher/raycast-compat"));
const reactModulePath = fileURLToPath(import.meta.resolve("react")).replace(/\/index\.js$/, "");

let messageId = 0;
await runNodeExtensionBootstrap({
  implementation: { name: "e2e-runtime", version: "0.0.0" },
  createMessageId: () => `runtime-${++messageId}`,
  loadEntrypoint: createBundlingEntrypointLoader({
    alias: { "@raycast/api": raycastCompatPath },
    reactModulePath,
  }),
  configureApi: (context) => {
    configureRaycastCompat(context);
  },
  renderComponent: (context, Component) => {
    runCommand(context, () => createElement(Component));
  },
});
