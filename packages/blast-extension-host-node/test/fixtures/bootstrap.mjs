import { runNodeExtensionBootstrap } from "@blastlauncher/extension-runtime-node";

let messageId = 0;
await runNodeExtensionBootstrap({
  implementation: { name: "node-test-runtime", version: "0.0.0" },
  createMessageId: () => `runtime-${++messageId}`,
  onLoaded(entrypointModule, descriptor) {
    process.stderr.write(`loaded:${descriptor.extensionId}:${descriptor.commandName}:${entrypointModule.marker}\n`);
  },
});
