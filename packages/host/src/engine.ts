import { join, resolve } from "node:path";
import type { CapabilityHandler } from "./broker.ts";
import {
  createExtensionHandle,
  type ExtensionHandle,
  type OpenExtensionOptions,
} from "./extension.ts";
import type { DependencyInstaller } from "./install-dependencies.ts";
import { createRoot, type Root, type RootOptions, type RootSource } from "./root.ts";
import { createRuntimePool } from "./runtime-pool.ts";
import { defaultNodePath, runtimeEnvironment } from "./session.ts";
import { defaultDataDir } from "./storage.ts";

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
    inheritEnv?: OpenExtensionOptions["inheritEnv"];
  } = {},
) {
  const registrations = new Set<Record<string, CapabilityHandler>>();
  const extensions = new Set<ExtensionHandle>();
  const roots = new Set<Root>();
  const changes = new Set<Parameters<RootSource["onChange"]>[0]>();
  const runtimePool = createRuntimePool();
  let prewarmTimer: ReturnType<typeof setTimeout> | undefined;
  const schedulePrewarm = () => {
    if (closing || prewarmTimer !== undefined) return;
    const resolvedDataDir = resolve(options.dataDir ?? defaultDataDir());
    prewarmTimer = setTimeout(() => {
      prewarmTimer = undefined;
      if (closing) return;
      runtimePool.prewarm({
        nodePath: defaultNodePath(),
        env: {
          ...runtimeEnvironment(process.env, options.inheritEnv),
          NODE_ENV: "production",
          NODE_COMPILE_CACHE: join(resolvedDataDir, "compile-cache"),
        },
      });
    }, 0);
    prewarmTimer.unref?.();
  };
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
          ...(options.inheritEnv === undefined ? {} : { inheritEnv: options.inheritEnv }),
          ...extensionOptions,
        },
        registeredHandlers,
        options.dependencies === "auto",
        runtimePool,
      );
      const close = extension.close;
      extension.close = async () => {
        try {
          await close();
        } finally {
          extensions.delete(extension);
          for (const listener of changes) listener({ type: "close", handle: extension });
        }
      };
      extensions.add(extension);
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
      // Start warming one clean standby runtime worker after the root begins
      // loading so initial manifest I/O stays uncontended while the first
      // command launch still skips Node/React startup.
      schedulePrewarm();
      const root = createRoot(
        {
          extensions: () => [...extensions],
          onChange(listener) {
            changes.add(listener);
            return () => changes.delete(listener);
          },
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
        if (prewarmTimer !== undefined) {
          clearTimeout(prewarmTimer);
          prewarmTimer = undefined;
        }
        registrations.clear();
        runtimePool.close();
        await Promise.all([...roots].map((root) => root.close()));
        await Promise.all([...extensions].map((extension) => extension.close()));
      }));
    },
  };
}
