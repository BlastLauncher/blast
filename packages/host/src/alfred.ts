// Alfred workflows as Blast extensions (decision 0021): the same handle a
// Raycast extension gets, but a command runs `@blastlauncher/alfred/main` on
// the workflow's `info.plist` instead of a bundle, and there is nothing to
// install.

import { existsSync, statSync, watch as watchDirectory } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractWorkflowArchive, loadWorkflow, workflowToManifest } from "@blastlauncher/alfred";
import { preferenceDefaults } from "@blastlauncher/protocol/preference-fields";
import type { CapabilityHandler } from "./broker.ts";
import type { BundledCommand } from "./bundle.ts";
import { createSessionBroker } from "./client.ts";
import { missingRequired, parseManifest, type ExtensionManifest } from "./extension-manifest.ts";
import {
  MissingLaunchValuesError,
  preferenceAccess,
  type DebounceScheduler,
  type ExtensionHandle,
  type ExtensionLaunchOptions,
  type ExtensionWatcher,
  type OpenExtensionOptions,
} from "./extension.ts";
import type { DependencyInstallStatus } from "./install-dependencies.ts";
import { startCommand, type Session } from "./session.ts";
import { defaultDataDir } from "./storage.ts";

const ARCHIVE_SUFFIX = ".alfredworkflow";

const isDirectory = (path: string) => {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
};

/** An `.alfredworkflow` file, as opposed to a directory that happens to carry the suffix. */
const isArchive = (path: string) =>
  path.toLowerCase().endsWith(ARCHIVE_SUFFIX) && !isDirectory(path);

/**
 * Whether `path` names an Alfred workflow: an `.alfredworkflow` archive, or a
 * directory with an `info.plist` and no Raycast `package.json`.
 */
export function isAlfredWorkflowPath(path: string): boolean {
  if (path.toLowerCase().endsWith(ARCHIVE_SUFFIX)) return true;
  const resolved = resolve(path);
  return existsSync(join(resolved, "info.plist")) && !existsSync(join(resolved, "package.json"));
}

/**
 * The directory a workflow runs from: an archive is extracted once per content
 * hash under `<dataDir>/workflows/`; a directory is used in place.
 */
export async function prepareAlfredWorkflow(
  path: string,
  dataDir: string,
): Promise<{ workflowDir: string; isArchive: boolean }> {
  const resolved = resolve(path);
  if (!isArchive(resolved)) return { workflowDir: resolved, isArchive: false };
  const { dir } = await extractWorkflowArchive(resolved, join(dataDir, "workflows"));
  return { workflowDir: dir, isArchive: true };
}

/** A workflow's Blast manifest; icons are listed only when their files exist. */
export async function readAlfredManifest(workflowDir: string): Promise<ExtensionManifest> {
  const [workflow, files] = await Promise.all([loadWorkflow(workflowDir), readdir(workflowDir)]);
  return parseManifest(workflowToManifest(workflow, { existingFiles: new Set(files) }).manifest);
}

export type AlfredCommand = Omit<BundledCommand, "bundleMs"> & { runtimeEntry: string };

/** `startCommand` options for one workflow command, the counterpart of `bundleCommand`. */
export function alfredCommand(
  workflowDir: string,
  manifest: ExtensionManifest,
  name: string,
): AlfredCommand {
  const command = manifest.commands.find((candidate) => candidate.name === name);
  if (!command) throw new Error(`Unknown extension command: ${name}`);
  return {
    runtimeEntry: fileURLToPath(import.meta.resolve("@blastlauncher/alfred/main")),
    entry: join(workflowDir, "info.plist"),
    // Alfred resolves `icon.png` and `<uid>.png` next to `info.plist`.
    assetsPath: workflowDir,
    extensionName: manifest.name,
    commandName: name,
    mode: command.mode,
    arguments: command.arguments,
    preferenceDefaults: preferenceDefaults(manifest.preferences, command.preferences),
  };
}

/** Prepares a workflow (directory or archive) and resolves one of its commands. */
export async function loadAlfredCommand(options: {
  extensionDir: string;
  command: string;
  dataDir: string;
}): Promise<AlfredCommand> {
  const { workflowDir } = await prepareAlfredWorkflow(options.extensionDir, options.dataDir);
  return alfredCommand(workflowDir, await readAlfredManifest(workflowDir), options.command);
}

/** The {@link ExtensionHandle} for an Alfred workflow directory or archive. */
export function createAlfredExtensionHandle(
  options: OpenExtensionOptions,
  engineHandlers: () => Record<string, CapabilityHandler> = () => ({}),
): ExtensionHandle {
  const extensionPath = resolve(options.extensionDir);
  const archive = isArchive(extensionPath);
  const dataDir = options.dataDir ?? defaultDataDir();
  const watcherFactory = options.watcher ?? ((path, listener) => watchDirectory(path, listener));
  const debounce =
    options.debounce ??
    ({
      schedule: (callback, delayMs) => setTimeout(callback, delayMs),
      cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    } satisfies DebounceScheduler);
  let closed = false;
  let closing: Promise<void> | undefined;
  let workflowDir: string | undefined = archive ? undefined : extensionPath;
  let preparing: Promise<string> | undefined;
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
  // Extract once; a failed extraction is retried by the next caller.
  const prepared = () =>
    (preparing ??= prepareAlfredWorkflow(extensionPath, dataDir).then(
      (result) => (workflowDir = result.workflowDir),
      (error: unknown) => {
        preparing = undefined;
        throw error;
      },
    ));
  const readManifestNow = async (): Promise<ExtensionManifest> => {
    try {
      const dir = await prepared();
      const info = await stat(join(dir, "info.plist"), { bigint: true });
      if (
        cachedManifest &&
        cachedManifest.size === info.size &&
        cachedManifest.mtimeNs === info.mtimeNs
      )
        return cachedManifest.value;
      const value = await readAlfredManifest(dir);
      cachedManifest = { size: info.size, mtimeNs: info.mtimeNs, value };
      return value;
    } catch (error) {
      cachedManifest = undefined;
      throw new Error(
        `Invalid Alfred workflow: ${error instanceof Error ? error.message : error}`,
        { cause: error },
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
  const stopSharedWatcher = () => {
    if (sharedWatchTimer !== undefined) {
      debounce.cancel(sharedWatchTimer);
      sharedWatchTimer = undefined;
    }
    sharedWatcher?.close();
    sharedWatcher = undefined;
  };
  // No dependencies to resolve: a workflow brings its own scripts.
  const dependencyStatus = (): DependencyInstallStatus => ({
    directory: workflowDir ?? extensionPath,
    key: "",
    needed: false,
    pinned: true,
    unresolved: [],
    installable: false,
  });
  const launch = async (name: string, launchOptions: ExtensionLaunchOptions = {}) => {
    ensureOpen();
    const { extension, command } = await commandManifest(name);
    const prefs = await stored.read(extension, command, name);
    const args = missingRequired(command.arguments, launchOptions.argumentValues ?? {});
    if (prefs.missing.length || args.length)
      throw new MissingLaunchValuesError(prefs.missing, args);
    const dir = await prepared();
    ensureOpen();
    const session: Session = await startCommand({
      ...alfredCommand(dir, extension, name),
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
      broker: createSessionBroker(
        { extensionName: extension.name, dataDir },
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
    // An archive's directory is known once `manifest()` or `launch()` has
    // extracted it, which is before any client resolves an icon.
    assetsDir: () => workflowDir ?? extensionPath,
    watch(listener: (update: ExtensionManifest | Error) => void) {
      ensureOpen();
      // An archive is a file in place of a directory: nothing to watch.
      if (archive) return () => {};
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
        sharedWatcher = watcherFactory(extensionPath, (_event, file) => {
          if (file && file !== "info.plist") return;
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
      check: async () => {
        ensureOpen();
        return dependencyStatus();
      },
      install: async (_installOptions: { onLog?: (message: string) => void } = {}) => {
        ensureOpen();
        return dependencyStatus();
      },
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
        stopSharedWatcher();
        await Promise.allSettled(launches);
        await Promise.all([...sessions].map((session) => session.close()));
      })());
    },
  };
}
