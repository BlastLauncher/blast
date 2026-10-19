import { watch as watchDirectory } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { bundleCommand, type Preference } from "./bundle.ts";
import { createSessionBroker } from "./client.ts";
import { parseManifest, missingRequired, type ExtensionManifest } from "./extension-manifest.ts";
import {
  checkExtensionDependencies,
  installExtensionDependencies,
  type DependencyInstaller,
} from "./install-dependencies.ts";
import { createPreferenceStore } from "./preferences.ts";
import { startCommand, type StartOptions } from "./session.ts";
import { defaultDataDir, type StorageItems } from "./storage.ts";
import type { CapabilityHandler } from "./broker.ts";

export type ExtensionLaunchOptions = Pick<StartOptions, "argumentValues" | "launchContext"> & {
  handlers?: Record<string, CapabilityHandler>;
};

export class MissingLaunchValuesError extends Error {
  readonly code = "MISSING_LAUNCH_VALUES";
  readonly preferences: Preference[];
  readonly arguments: string[];
  constructor(preferences: Preference[], args: string[]) {
    super(`Missing required values: ${[...preferences.map((p) => p.name), ...args].join(", ")}`);
    this.name = "MissingLaunchValuesError";
    this.preferences = preferences;
    this.arguments = args;
  }
}

/** Opens an extension without starting a command or installing dependencies. */
export function openExtension(options: {
  extensionDir: string;
  dataDir?: string;
  installer?: DependencyInstaller;
}) {
  const extensionDir = resolve(options.extensionDir);
  const dataDir = options.dataDir ?? defaultDataDir();
  const dependencyOptions = { extensionDir, dataDir };
  let closed = false;
  let closing: Promise<void> | undefined;
  let queue: Promise<unknown> = Promise.resolve();
  const subscriptions = new Set<() => void>();
  const sessions = new Set<{ close(): Promise<void> }>();
  const launches = new Set<Promise<unknown>>();
  const ensureOpen = () => {
    if (closed) throw new Error("Extension handle is closed");
  };
  const manifest = async (): Promise<ExtensionManifest> => {
    ensureOpen();
    try {
      return parseManifest(JSON.parse(await readFile(join(extensionDir, "package.json"), "utf8")));
    } catch (error) {
      throw new Error(
        `Invalid extension manifest: ${error instanceof Error ? error.message : error}`,
        {
          cause: error,
        },
      );
    }
  };
  const commandManifest = async (name: string) => {
    const extension = await manifest();
    const command = extension.commands.find((c) => c.name === name);
    if (!command) throw new Error(`Unknown extension command: ${name}`);
    return { extension, command };
  };
  const preferences = async (name: string, scope?: "extension" | "command") => {
    const { extension, command } = await commandManifest(name);
    const store = createPreferenceStore({ extensionName: extension.name, dataDir });
    const stored = await store.read();
    const values =
      scope === "extension" ? stored.extension : { ...stored.extension, ...stored.commands[name] };
    const fields = [
      ...new Map(
        [...extension.preferences, ...command.preferences].map((p) => [p.name, p]),
      ).values(),
    ];
    return {
      extension: extension.preferences,
      command: command.preferences,
      values,
      missing: fields.filter(
        (p) =>
          p.required &&
          p.default === undefined &&
          (values[p.name] === undefined || values[p.name] === ""),
      ),
    };
  };
  // A failed install remains observable to its caller but does not poison the
  // queue: commands may still bundle against the shared dependency fallback.
  const serialize = <T>(operation: () => Promise<T>): Promise<T> => {
    ensureOpen();
    const next = queue.then(() => {
      ensureOpen();
      return operation();
    });
    queue = next.catch(() => {});
    return next;
  };
  const launch = async (name: string, launchOptions: ExtensionLaunchOptions = {}) => {
    ensureOpen();
    await queue;
    const { command } = await commandManifest(name);
    const prefs = await preferences(name);
    const args = missingRequired(command.arguments, launchOptions.argumentValues ?? {});
    if (prefs.missing.length || args.length)
      throw new MissingLaunchValuesError(prefs.missing, args);
    ensureOpen();
    const bundled = await bundleCommand({ extensionDir, command: name, dataDir });
    const cleanup = () => rm(dirname(bundled.entry), { recursive: true, force: true });
    try {
      ensureOpen();
      const session = await startCommand({
        ...bundled,
        preferences: prefs.values,
        dataDir,
        ...(launchOptions.argumentValues === undefined
          ? {}
          : { argumentValues: launchOptions.argumentValues }),
        ...(launchOptions.launchContext === undefined
          ? {}
          : { launchContext: launchOptions.launchContext }),
        broker: createSessionBroker(
          { extensionName: bundled.extensionName, dataDir },
          launchOptions,
        ),
      });
      let stopping: Promise<void> | undefined;
      const opened = {
        session,
        close: () =>
          (stopping ??= (async () => {
            try {
              await session.shutdown({ timeoutMs: 5000 });
            } finally {
              await cleanup();
              sessions.delete(opened);
            }
          })()),
      };
      sessions.add(opened);
      if (closed) {
        await opened.close();
        ensureOpen();
      }
      return opened;
    } catch (error) {
      await cleanup();
      throw error;
    }
  };
  return {
    manifest,
    watch(listener: (update: ExtensionManifest | Error) => void) {
      ensureOpen();
      let active = true;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const reload = async () => {
        let update: ExtensionManifest | Error;
        try {
          update = await manifest();
        } catch (error) {
          update = error instanceof Error ? error : new Error(String(error));
        }
        if (active) listener(update);
      };
      // Directory watching also observes manifests replaced via atomic rename.
      const watcher = watchDirectory(extensionDir, (_event, file) => {
        if (file && file !== "package.json" && file !== "package-lock.json") return;
        clearTimeout(timer);
        timer = setTimeout(() => {
          void reload();
        }, 100);
      });
      watcher.on("error", (error) => {
        if (active) listener(error);
      });
      const unsubscribe = () => {
        active = false;
        clearTimeout(timer);
        watcher.close();
        subscriptions.delete(unsubscribe);
      };
      subscriptions.add(unsubscribe);
      return unsubscribe;
    },
    dependencies: {
      check: () => serialize(() => checkExtensionDependencies(dependencyOptions)),
      install: (installOptions: { onLog?: (message: string) => void } = {}) =>
        serialize(() =>
          installExtensionDependencies({
            ...dependencyOptions,
            ...installOptions,
            ...(options.installer ? { installer: options.installer } : {}),
          }),
        ),
    },
    preferences,
    async savePreferences(name: string, values: StorageItems, scope?: "extension" | "command") {
      const { extension, command } = await commandManifest(name);
      const isExtension = (key: string) =>
        scope === "extension" ||
        (extension.preferences.some((p) => p.name === key) &&
          !command.preferences.some((p) => p.name === key));
      await createPreferenceStore({ extensionName: extension.name, dataDir }).save(
        Object.fromEntries(Object.entries(values).filter(([key]) => isExtension(key))),
        name,
        Object.fromEntries(Object.entries(values).filter(([key]) => !isExtension(key))),
      );
    },
    launch(name: string, launchOptions?: ExtensionLaunchOptions) {
      const pending = launch(name, launchOptions);
      launches.add(pending);
      void pending.finally(() => launches.delete(pending)).catch(() => {});
      return pending;
    },
    close() {
      return (closing ??= (async () => {
        closed = true;
        for (const unsubscribe of subscriptions) unsubscribe();
        await Promise.allSettled([queue, ...launches]);
        await Promise.all([...sessions].map((session) => session.close()));
      })());
    },
  };
}

export type ExtensionHandle = ReturnType<typeof openExtension>;
