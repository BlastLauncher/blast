import { resolve } from "node:path";
import type { CapabilityHandler } from "./broker.ts";
import {
  createExtensionHandle,
  type ExtensionHandle,
  type OpenExtensionOptions,
} from "./extension.ts";
import type { DependencyInstaller } from "./install-dependencies.ts";
import { createRoot, type Root, type RootOptions, type RootSource } from "./root.ts";

/** Shared defaults and capability registrations for a group of extensions. */
export function createEngine(
  options: {
    timeoutMs?: number;
    dataDir?: string;
    installer?: DependencyInstaller;
    watcher?: OpenExtensionOptions["watcher"];
    debounce?: OpenExtensionOptions["debounce"];
    dependencies?: "manual" | "auto";
    handlers?: Record<string, CapabilityHandler>;
  } = {},
) {
  const registrations = new Set<Record<string, CapabilityHandler>>();
  const extensions = new Set<ExtensionHandle>();
  const directories = new Map<ExtensionHandle, string>();
  const roots = new Set<Root>();
  const changes = new Set<Parameters<RootSource["onChange"]>[0]>();
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
          ...(options.watcher === undefined ? {} : { watcher: options.watcher }),
          ...(options.debounce === undefined ? {} : { debounce: options.debounce }),
          ...extensionOptions,
        },
        registeredHandlers,
        options.dependencies === "auto",
      );
      const close = extension.close;
      extension.close = async () => {
        try {
          await close();
        } finally {
          extensions.delete(extension);
          directories.delete(extension);
          for (const listener of changes) listener({ type: "close", handle: extension });
        }
      };
      extensions.add(extension);
      directories.set(extension, resolve(extensionOptions.extensionDir));
      for (const listener of changes) listener({ type: "open", handle: extension });
      return extension;
    },
    /**
     * Root search over every extension opened on this engine, now and later:
     * a list `ControllerView` of their commands. A primary input launches the
     * selected command and the view becomes that command's until its session
     * ends or goes `back` at its root. See `RootOptions.launch` to own launching.
     */
    root(rootOptions: RootOptions): Root {
      ensureOpen();
      const root = createRoot(
        {
          extensions: () => [...extensions],
          onChange(listener) {
            changes.add(listener);
            return () => changes.delete(listener);
          },
          dirOf: (handle) => directories.get(handle),
        },
        rootOptions,
      );
      const close = root.close;
      root.close = async () => {
        roots.delete(root);
        await close();
      };
      roots.add(root);
      return root;
    },
    close() {
      return (closing ??= Promise.resolve().then(async () => {
        registrations.clear();
        await Promise.all([...roots].map((root) => root.close()));
        await Promise.all([...extensions].map((extension) => extension.close()));
      }));
    },
  };
}
