import { runNodeExtensionBootstrap } from "@blastlauncher/extension-runtime-node";

let messageId = 0;
await runNodeExtensionBootstrap({
  implementation: { name: "e2e-runtime", version: "0.0.0" },
  createMessageId: () => `runtime-${++messageId}`,
});
