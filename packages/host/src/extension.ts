import { watch as watchDirectory } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { bundleCommand, MissingDependencyError, type Preference } from "./bundle.ts";
import {
  missingPreferences,
  preferenceFields,
  preferenceValues,
} from "@blastlauncher/protocol/preference-fields";
import { createSessionBroker } from "./client.ts";
import { createAlfredExtensionHandle, isAlfredWorkflowPath } from "./alfred.ts";
import {
  parseManifest,
  missingRequired,
  type ExtensionCommand,
  type ExtensionManifest,
} from "./extension-manifest.ts";
import {
  checkExtensionDependencies,
  installExtensionDependencies,
  type DependencyInstallStatus,
  type DependencyInstaller,
} from "./install-dependencies.ts";
import { createPreferenceStore } from "./preferences.ts";
import type { RuntimePool } from "./runtime-pool.ts";
import { startCommand, type InheritEnv, type StartOptions } from "./session.ts";
import { defaultDataDir, type StorageItems } from "./storage.ts";
import type { CapabilityHandler } from "./broker.ts";

export type ExtensionLaunchOptions = Pick<
  StartOptions,
  "argumentValues" | "launchContext" | "fallbackText"
> & {
  /** Install unresolved manifest dependencies before bundling this launch. */
  installDependencies?: boolean;
  /** Receives installer output when this launch performs an install. */
  onDependencyLog?: (message: string) => void;
  timeoutMs?: number;
  signal?: AbortSignal;
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

export class DependenciesRequiredError extends Error {
  readonly code = "DEPENDENCIES_REQUIRED";
  readonly unresolved: string[];
  readonly installable: boolean;
  readonly pinned: boolean;

  constructor(status: Pick<DependencyInstallStatus, "unresolved" | "installable" | "pinned">) {
    const names = [...new Set(status.unresolved)].toSorted();
    super(
      `Missing dependencies: ${names.join(", ")}. Run blast deps <extensionDir> to install them before launching.`,
    );
    this.name = "DependenciesRequiredError";
    this.unresolved = names;
    this.installable = status.installable;
    this.pinned = status.pinned;
  }
}

export type OpenExtensionOptions = {
  timeoutMs?: number;
  extensionDir: string;
  dataDir?: string;
  installer?: DependencyInstaller;
  handlers?: Record<string, CapabilityHandler>;
  watcher?: ExtensionWatcherFactory;
  debounce?: DebounceScheduler;
  /**
   * Extra environment for this extension's commands. The default allowlist
   * withholds the host environment (decision 0001); only an embedder that
   * trusts its extensions with, e.g., its tmux socket should opt in.
   */
  inheritEnv?: InheritEnv;
};

export type ExtensionWatcher = {
  on(event: "error", listener: (error: Error) => void): ExtensionWatcher;
  close(): void;
};
export type ExtensionWatcherFactory = (
  path: string,
  listener: (event: string, filename: string | Buffer | null) => void,
) => ExtensionWatcher;
export type DebounceScheduler = {
  schedule(callback: () => void, delayMs: number): unknown;
  cancel(handle: unknown): void;
};

/** Opens an extension without starting a command or installing dependencies. */
export function openExtension(options: OpenExtensionOptions): ExtensionHandle {
  return createExtensionHandle(options);
}

/**
 * Internal constructor shared with the engine's live handler registry. An
 * Alfred workflow (directory or `.alfredworkflow` archive) gets the same
 * handle shape over the Alfred runtime (decision 0021).
 */
export function createExtensionHandle(
  options: OpenExtensionOptions,
  engineHandlers: () => Record<string, CapabilityHandler> = () => ({}),
  defaultInstallDependencies = false,
  runtimePool?: RuntimePool,
): ExtensionHandle {
  if (isAlfredWorkflowPath(options.extensionDir))
    return createAlfredExtensionHandle(options, engineHandlers);
  return createRaycastExtensionHandle(
    options,
    engineHandlers,
    defaultInstallDependencies,
    runtimePool,
  );
}

type CommandManifest = (
  name: string,
) => Promise<{ extension: ExtensionManifest; command: ExtensionCommand }>;

/** Stored preference reads and writes, the same for every kind of extension. */
export function preferenceAccess(commandManifest: CommandManifest, dataDir: string) {
  const read = async (
    extension: ExtensionManifest,
    command: ExtensionCommand,
    name: string,
    scope?: "extension" | "command",
  ) => {
    const store = createPreferenceStore({ extensionName: extension.name, dataDir });
    const stored = await store.read();
    const values =
      scope === "extension"
        ? stored.extension
        : preferenceValues(stored.extension, stored.commands, name);
    const fields = preferenceFields(extension.preferences, command.preferences);
    return {
      extension: extension.preferences,
      command: command.preferences,
      values,
      missing: missingPreferences(fields, values),
    };
  };
  return {
    read,
    async preferences(name: string, scope?: "extension" | "command") {
      const { extension, command } = await commandManifest(name);
      return read(extension, command, name, scope);
    },
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
  };
}

function createRaycastExtensionHandle(
  options: OpenExtensionOptions,
  engineHandlers: () => Record<string, CapabilityHandler>,
  defaultInstallDependencies: boolean,
  runtimePool: RuntimePool | undefined,
) {
  const extensionDir = resolve(options.extensionDir);
  const manifestPath = join(extensionDir, "package.json");
  const dataDir = options.dataDir ?? defaultDataDir();
  const dependencyOptions = { extensionDir, dataDir };
  const watcherFactory = options.watcher ?? ((path, listener) => watchDirectory(path, listener));
  const debounce =
    options.debounce ??
    ({
      schedule: (callback, delayMs) => setTimeout(callback, delayMs),
      cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    } satisfies DebounceScheduler);
  let closed = false;
  let closing: Promise<void> | undefined;
  let queue: Promise<unknown> = Promise.resolve();
  let cachedManifest: { size: bigint; mtimeNs: bigint; value: ExtensionManifest } | undefined;
  let inFlightManifest: Promise<ExtensionManifest> | undefined;
  const watchListeners = new Set<(update: ExtensionManifest | Error) => void>();
  let sharedWatcher: ExtensionWatcher | undefined;
  let sharedWatchTimer: unknown;
  const subscriptions = new Set<() => void>();
  const sessions = new Set<{ close(): Promise<void> }>();
  const launches = new Set<Promise<unknown>>();
  const ensureOpen = () => {
    if (closed) throw new Error("Extension handle is closed");
  };
  const stopSharedWatcher = () => {
    if (sharedWatchTimer !== undefined) {
      debounce.cancel(sharedWatchTimer);
      sharedWatchTimer = undefined;
    }
    if (sharedWatcher) {
      sharedWatcher.close();
      sharedWatcher = undefined;
    }
  };
  const readManifestNow = async (): Promise<ExtensionManifest> => {
    try {
      const info = await stat(manifestPath, { bigint: true });
      if (
        cachedManifest &&
        cachedManifest.size === info.size &&
        cachedManifest.mtimeNs === info.mtimeNs
      ) {
        return cachedManifest.value;
      }
      const parsed = parseManifest(JSON.parse(await readFile(manifestPath, "utf8")));
      cachedManifest = { size: info.size, mtimeNs: info.mtimeNs, value: parsed };
      return parsed;
    } catch (error) {
      cachedManifest = undefined;
      throw new Error(
        `Invalid extension manifest: ${error instanceof Error ? error.message : error}`,
        {
          cause: error,
        },
      );
    }
  };
  const manifest = async (): Promise<ExtensionManifest> => {
    ensureOpen();
    if (inFlightManifest) return inFlightManifest;
    const pending = readManifestNow().finally(() => {
      if (inFlightManifest === pending) inFlightManifest = undefined;
    });
    inFlightManifest = pending;
    return pending;
  };
  const commandManifest = async (name: string) => {
    const extension = await manifest();
    const command = extension.commands.find((c) => c.name === name);
    if (!command) throw new Error(`Unknown extension command: ${name}`);
    return { extension, command };
  };
  const stored = preferenceAccess(commandManifest, dataDir);
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
    const { extension, command } = await commandManifest(name);
    const [prefs, initialDependencyStatus] = await Promise.all([
      stored.read(extension, command, name),
      checkExtensionDependencies({ ...dependencyOptions }),
    ]);
    const args = missingRequired(command.arguments, launchOptions.argumentValues ?? {});
    if (prefs.missing.length || args.length)
      throw new MissingLaunchValuesError(prefs.missing, args);
    let dependencyStatus = initialDependencyStatus;
    const installDependencies = launchOptions.installDependencies ?? defaultInstallDependencies;
    if (dependencyStatus.unresolved.length && installDependencies) {
      await installExtensionDependencies({
        ...dependencyOptions,
        ...(options.installer ? { installer: options.installer } : {}),
        ...(launchOptions.onDependencyLog ? { onLog: launchOptions.onDependencyLog } : {}),
      });
      dependencyStatus = await checkExtensionDependencies({
        ...dependencyOptions,
      });
    }
    // A successful installer publishes its key before the bundle runs. Some
    // installers provision packages lazily, so an installable manifest is no
    // longer launch-blocking once that key is current; undeclared imports are
    // never installable and remain an immediate typed failure.
    if (
      dependencyStatus.unresolved.length &&
      (dependencyStatus.needed || !dependencyStatus.installable)
    )
      throw new DependenciesRequiredError(dependencyStatus);
    ensureOpen();
    const timeoutMs = launchOptions.timeoutMs ?? options.timeoutMs;
    const bundle = () =>
      bundleCommand({
        extensionDir,
        command: name,
        dataDir,
        // Reused by the next launch, in this process or another (decision 0016).
        cacheDir: join(dataDir, "bundles"),
        ...(timeoutMs === undefined ? {} : { timeoutMs }),
        ...(launchOptions.signal === undefined ? {} : { signal: launchOptions.signal }),
      });
    let bundled;
    try {
      bundled = await bundle();
    } catch (error) {
      if (!(error instanceof MissingDependencyError)) throw error;
      const declared = new Set(
        Object.keys(
          (
            JSON.parse(await readFile(join(extensionDir, "package.json"), "utf8")) as {
              dependencies?: Record<string, unknown>;
            }
          ).dependencies ?? {},
        ),
      );
      const status = {
        unresolved: error.packages,
        installable: error.packages.every((packageName) => declared.has(packageName)),
        pinned: (await checkExtensionDependencies(dependencyOptions)).pinned,
      };
      if (!installDependencies || !status.installable) throw new DependenciesRequiredError(status);
      await installExtensionDependencies({
        ...dependencyOptions,
        ...(options.installer ? { installer: options.installer } : {}),
        ...(launchOptions.onDependencyLog ? { onLog: launchOptions.onDependencyLog } : {}),
      });
      try {
        bundled = await bundle();
      } catch (retryError) {
        if (retryError instanceof MissingDependencyError) {
          throw new DependenciesRequiredError({
            unresolved: retryError.packages,
            installable: retryError.packages.every((packageName) => declared.has(packageName)),
            pinned: status.pinned,
          });
        }
        throw retryError;
      }
    }
    // The bundle cache owns the build (`<dataDir>/bundles/`); nothing to remove.
    ensureOpen();
    const session = await startCommand({
      ...bundled,
      preferences: prefs.values,
      dataDir,
      ...(launchOptions.argumentValues === undefined
        ? {}
        : { argumentValues: launchOptions.argumentValues }),
      ...(launchOptions.fallbackText === undefined
        ? {}
        : { fallbackText: launchOptions.fallbackText }),
      ...(launchOptions.launchContext === undefined
        ? {}
        : { launchContext: launchOptions.launchContext }),
      ...(options.inheritEnv === undefined ? {} : { inheritEnv: options.inheritEnv }),
      ...(runtimePool === undefined ? {} : { runtimePool }),
      broker: createSessionBroker(
        { extensionName: bundled.extensionName, dataDir },
        { handlers: { ...engineHandlers(), ...options.handlers, ...launchOptions.handlers } },
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
  };
  return {
    manifest,
    /** Where the manifest's icons and the command's assets resolve. */
    assetsDir: () => join(extensionDir, "assets"),
    watch(listener: (update: ExtensionManifest | Error) => void) {
      ensureOpen();
      if (!sharedWatcher) {
        const reload = async () => {
          let update: ExtensionManifest | Error;
          try {
            update = await manifest();
          } catch (error) {
            update = error instanceof Error ? error : new Error(String(error));
          }
          for (const subscriber of Array.from(watchListeners)) subscriber(update);
        };
        // Share one OS directory watcher per extension handle across all
        // subscribers (e.g. engine root + launcher error banner).
        sharedWatcher = watcherFactory(extensionDir, (_event, file) => {
          if (file && file !== "package.json" && file !== "package-lock.json") return;
          if (sharedWatchTimer !== undefined) debounce.cancel(sharedWatchTimer);
          sharedWatchTimer = debounce.schedule(() => {
            sharedWatchTimer = undefined;
            void reload();
          }, 100);
        });
        sharedWatcher.on("error", (error) => {
          for (const subscriber of Array.from(watchListeners)) subscriber(error);
        });
      }
      watchListeners.add(listener);
      const unsubscribe = () => {
        if (!watchListeners.delete(listener)) return;
        subscriptions.delete(unsubscribe);
        if (watchListeners.size === 0) stopSharedWatcher();
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
    preferences: stored.preferences,
    savePreferences: stored.savePreferences,
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

export type ExtensionHandle = ReturnType<typeof createRaycastExtensionHandle>;
