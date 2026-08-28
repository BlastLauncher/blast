import { initializeExtensionRuntime } from "@blastlauncher/extension-runtime";
import { createProcessStdioTransport } from "@blastlauncher/transport-node";

let messageId = 0;
const runtime = await initializeExtensionRuntime(createProcessStdioTransport(), {
  implementation: { name: "node-test-runtime", version: "0.0.0" },
  createMessageId: () => `runtime-${++messageId}`,
  initialize(descriptor) {
    process.stderr.write(`initialized:${descriptor.extensionId}:${descriptor.commandName}\n`);
  },
});

while (runtime.session.state === "ready") {
  const message = await runtime.session.receive();
  if (message === undefined || message.type === "shutdown") {
    break;
  }
}
