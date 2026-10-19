import {
  bundleCommand,
  startCommand,
  createBroker,
  createHeadlessHandlers,
  createStorageHandlers,
  createOAuthHandlers,
  type CapabilityHandler,
} from "@blastlauncher/host";
import { dirname } from "node:path";
import { rm } from "node:fs/promises";

export async function openCommand(
  extensionDir: string,
  command: string,
  options: {
    dataDir?: string;
    handlers?: Record<string, CapabilityHandler>;
  } = {},
) {
  const bundled = await bundleCommand({ extensionDir, command });
  const cleanup = () => rm(dirname(bundled.entry), { recursive: true, force: true });
  try {
    const storage = {
      extensionName: bundled.extensionName,
      ...(options.dataDir === undefined ? {} : { dataDir: options.dataDir }),
    };
    const session = await startCommand({
      ...bundled,
      ...(options.dataDir === undefined ? {} : { dataDir: options.dataDir }),
      broker: createBroker({
        ...createHeadlessHandlers(),
        ...options.handlers,
        ...createStorageHandlers(storage),
        ...createOAuthHandlers(storage),
      }),
    });
    let closing: Promise<void> | undefined;
    return {
      session,
      close: () =>
        (closing ??= (async () => {
          try {
            await session.shutdown({ timeoutMs: 5000 });
          } finally {
            await cleanup();
          }
        })()),
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
