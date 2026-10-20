import type { CapabilityHandler } from "./broker.ts";
import {
  createExtensionHandle,
  type ExtensionHandle,
  type OpenExtensionOptions,
} from "./extension.ts";
import type { DependencyInstaller } from "./install-dependencies.ts";

/** Shared defaults and capability registrations for a group of extensions. */
export function createEngine(
  options: {
    timeoutMs?: number;
    dataDir?: string;
    installer?: DependencyInstaller;
    handlers?: Record<string, CapabilityHandler>;
  } = {},
) {
  const registrations = new Set<Record<string, CapabilityHandler>>();
  const extensions = new Set<ExtensionHandle>();
  let closing: Promise<void> | undefined;
  const ensureOpen = () => {
    if (closing) throw new Error("Engine is closed");
  };
  const registeredHandlers = (): Record<string, CapabilityHandler> =>
    Object.assign({}, ...registrations);
  if (options.handlers) registrations.add({ ...options.handlers });
  return {
    /** Later registrations win; changes apply to future launches. */
    register(handlers: Record<string, CapabilityHandler>) {
      ensureOpen();
      const registration = { ...handlers };
      registrations.add(registration);
      return () => {
        registrations.delete(registration);
      };
    },
    openExtension(extensionOptions: OpenExtensionOptions) {
      ensureOpen();
      const extension = createExtensionHandle(
        {
          ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
          ...(options.dataDir === undefined ? {} : { dataDir: options.dataDir }),
          ...(options.installer === undefined ? {} : { installer: options.installer }),
          ...extensionOptions,
        },
        registeredHandlers,
      );
      const close = extension.close;
      extension.close = async () => {
        try {
          await close();
        } finally {
          extensions.delete(extension);
        }
      };
      extensions.add(extension);
      return extension;
    },
    close() {
      return (closing ??= Promise.resolve().then(async () => {
        registrations.clear();
        await Promise.all([...extensions].map((extension) => extension.close()));
      }));
    },
  };
}
