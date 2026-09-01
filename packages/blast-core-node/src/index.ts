import { watch as watchFileSystem, type Dirent, type FSWatcher } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import {
  BlastCoreError,
  EXTENSION_SOURCE_KINDS,
  type CommandIdentity,
  type CoreCommandDescriptor,
  type ExtensionCatalog,
  type ExtensionSourceKind,
} from "@blastlauncher/core";
import type {
  ExtensionDescriptor,
  ExtensionEntryPointMode,
  ExtensionPreferenceDataItem,
  ExtensionPreferenceMetadata,
  ExtensionPreferenceMetadataValue,
  ExtensionPreferenceScalar,
  ExtensionPreferenceType,
} from "@blastlauncher/extension-contract";

export { LocalCoreServer, LocalCoreServerError, createLocalCoreServer } from "./local-server.js";
export type { LocalCoreServerOptions, LocalCoreServerState } from "./local-server.js";
export {
  DEFAULT_CORE_CONNECT_TIMEOUT_MILLISECONDS,
  LocalCoreClientError,
  connectLocalCoreClient,
} from "./local-client.js";
export type { LocalCoreClientOptions } from "./local-client.js";
export { NodeCoreDaemon, NodeCoreDaemonError, createNodeCoreDaemon } from "./daemon.js";
export type { NodeCoreDaemonOptions, NodeCoreDaemonState } from "./daemon.js";

export const DEFAULT_MANIFEST_FILE_NAME = "package.json";

const ENTRYPOINT_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js", ".mjs", ".cjs"] as const;

export interface ManifestCommand {
  readonly name: string;
  readonly title?: string;
  readonly entrypoint: string | undefined;
  /** Raycast command mode; omitted manifests default to a view command. */
  readonly mode?: ExtensionEntryPointMode;
  /** Preference defaults declared on this command in the Raycast manifest. */
  readonly preferences?: Readonly<Record<string, ExtensionPreferenceScalar>>;
  /** Full measured preference declarations keyed by preference name. */
  readonly preferenceMetadata?: Readonly<Record<string, ExtensionPreferenceMetadata>>;
}

export interface ExtensionManifest {
  readonly name: string;
  readonly title?: string;
  readonly author?: string;
  readonly owner?: string;
  readonly commands: readonly ManifestCommand[];
  /** Manifest preference defaults keyed by preference name. */
  readonly preferences: Readonly<Record<string, ExtensionPreferenceScalar>>;
  /** Full measured preference declarations keyed by preference name. */
  readonly preferenceMetadata: Readonly<Record<string, ExtensionPreferenceMetadata>>;
}

export interface FilesystemExtensionCatalogOptions {
  /**
   * Directory that contains one subdirectory per installed extension. Each
   * subdirectory is expected to hold a manifest file.
   */
  readonly root: string;
  /**
   * Optional lower-priority roots using the same layout. The first valid
   * manifest for a duplicate extension name wins.
   */
  readonly additionalRoots?: readonly string[];
  /** Host-owned classification for the primary root's discovered commands. */
  readonly rootSourceKind?: ExtensionSourceKind;
  /** Classifications matching `additionalRoots` by index. */
  readonly additionalRootSourceKinds?: readonly ExtensionSourceKind[];
  readonly manifestFileName?: string;
}

export interface FilesystemExtensionCatalogWatch {
  /** Stops all filesystem watchers and cancels a pending change notification. */
  close(): void;
}

/**
 * Trusted catalog implementation that discovers extension manifests on the
 * local filesystem. Manifests follow the Raycast `package.json` shape, with an
 * optional per-command `entrypoint` override for extensions whose entrypoints
 * do not follow the `src/<command-name>` convention.
 *
 * The catalog is the only component allowed to turn identities into paths.
 * It never resolves an entrypoint outside the extension root and skips
 * manifests it cannot read or validate. Extension-level preference defaults are
 * merged with the selected command's defaults when a descriptor is resolved.
 */
export class FilesystemExtensionCatalog implements ExtensionCatalog {
  readonly #roots: readonly string[];
  readonly #rootSourceKinds: readonly (ExtensionSourceKind | undefined)[];
  readonly #manifestFileName: string;
  #extensionIndex:
    | Promise<
        ReadonlyMap<
          string,
          {
            readonly directory: string;
            readonly manifest: ExtensionManifest;
            readonly sourceKind?: ExtensionSourceKind;
          }
        >
      >
    | undefined;
  #watchActive = false;

  constructor(options: FilesystemExtensionCatalogOptions) {
    validateNonEmptyString(options.root, "root");
    for (const [index, root] of (options.additionalRoots ?? []).entries()) {
      validateNonEmptyString(root, `additionalRoots[${index}]`);
    }
    validateOptionalSourceKind(options.rootSourceKind, "rootSourceKind");
    for (const [index, sourceKind] of (options.additionalRootSourceKinds ?? []).entries()) {
      validateOptionalSourceKind(sourceKind, `additionalRootSourceKinds[${index}]`);
    }
    if ((options.additionalRootSourceKinds?.length ?? 0) > (options.additionalRoots?.length ?? 0)) {
      throw new BlastCoreError(
        "invalid_catalog_source_configuration",
        "additionalRootSourceKinds cannot contain more entries than additionalRoots",
      );
    }
    if (options.manifestFileName !== undefined) {
      validateNonEmptyString(options.manifestFileName, "manifestFileName");
    }
    this.#roots = [options.root, ...(options.additionalRoots ?? [])].map((root) => path.resolve(root));
    this.#rootSourceKinds = this.#roots.map((_, index) =>
      index === 0 ? options.rootSourceKind : options.additionalRootSourceKinds?.[index - 1],
    );
    this.#manifestFileName = options.manifestFileName ?? DEFAULT_MANIFEST_FILE_NAME;
  }

  get root(): string {
    return this.#roots[0]!;
  }

  get roots(): readonly string[] {
    return this.#roots;
  }

  /** Invalidates the cached manifest index without changing catalog roots. */
  async refresh(signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    this.#extensionIndex = undefined;
  }

  /**
   * Watches configured roots and installed extension directories for changes.
   * The returned handle is owned by the caller and must be closed when the
   * catalog is no longer serving requests.
   */
  async watch(onChange: () => void | Promise<void>): Promise<FilesystemExtensionCatalogWatch> {
    if (this.#watchActive) {
      throw new BlastCoreError("catalog_watch_active", "The extension catalog is already being watched");
    }
    if (typeof onChange !== "function") {
      throw new BlastCoreError("invalid_catalog_watch", "The catalog watch callback must be a function");
    }

    this.#watchActive = true;
    const rootWatchers = new Map<string, FSWatcher>();
    const extensionWatchers = new Map<string, { readonly root: string; readonly watcher: FSWatcher }>();
    let debounceTimer: NodeJS.Timeout | undefined;
    let closed = false;

    const notify = (): void => {
      if (closed) {
        return;
      }
      this.#extensionIndex = undefined;
      if (debounceTimer !== undefined) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        debounceTimer = undefined;
        if (closed) {
          return;
        }
        void Promise.resolve(onChange()).catch(() => {
          // A presentation callback must not become an uncaught watcher error.
        });
      }, CATALOG_WATCH_DEBOUNCE_MILLISECONDS);
      debounceTimer.unref();
    };

    const removeExtensionWatchers = (root: string): void => {
      for (const [directory, entry] of extensionWatchers) {
        if (entry.root !== root) {
          continue;
        }
        extensionWatchers.delete(directory);
        closeFileSystemWatcher(entry.watcher);
      }
    };

    const installExtensionWatchers = (root: string, directories: readonly string[]): void => {
      const currentDirectories = new Set(directories);
      for (const [directory, entry] of extensionWatchers) {
        if (entry.root === root && !currentDirectories.has(directory)) {
          extensionWatchers.delete(directory);
          closeFileSystemWatcher(entry.watcher);
        }
      }
      for (const directory of directories) {
        if (extensionWatchers.has(directory)) {
          continue;
        }
        extensionWatchers.set(directory, {
          root,
          watcher: createFileSystemWatcher(directory, notify),
        });
      }
    };

    const resyncRoot = (root: string, required: boolean): void => {
      void (async () => {
        try {
          const directories = await this.#listExtensionDirectories(root, required);
          if (!closed && rootWatchers.has(root)) {
            installExtensionWatchers(root, directories);
          }
        } catch {
          // The root may be in the middle of an atomic replacement. The next
          // explicit discovery refresh remains authoritative if the watcher
          // cannot be re-established.
          removeExtensionWatchers(root);
        }
      })();
    };

    const close = (): void => {
      if (closed) {
        return;
      }
      closed = true;
      this.#watchActive = false;
      if (debounceTimer !== undefined) {
        clearTimeout(debounceTimer);
        debounceTimer = undefined;
      }
      for (const watcher of rootWatchers.values()) {
        closeFileSystemWatcher(watcher);
      }
      rootWatchers.clear();
      for (const { watcher } of extensionWatchers.values()) {
        closeFileSystemWatcher(watcher);
      }
      extensionWatchers.clear();
    };

    try {
      for (const [rootIndex, root] of this.#roots.entries()) {
        const required = rootIndex === 0;
        const directories = await this.#listExtensionDirectories(root, required);
        if (!required && !(await isDirectory(root))) {
          // Missing optional roots remain optional, including when they are
          // created after this watcher starts; explicit refresh still sees it.
          continue;
        }
        if (rootWatchers.has(root)) {
          continue;
        }
        const watcher = createFileSystemWatcher(root, () => {
          notify();
          resyncRoot(root, required);
        });
        rootWatchers.set(root, watcher);
        installExtensionWatchers(root, directories);
      }
      return { close };
    } catch (error) {
      close();
      throw error;
    }
  }

  async listCommands(signal?: AbortSignal): Promise<readonly CoreCommandDescriptor[]> {
    signal?.throwIfAborted();
    const indexed = await this.#getExtensionIndex();
    const commands: CoreCommandDescriptor[] = [];
    for (const { manifest, sourceKind } of indexed.values()) {
      signal?.throwIfAborted();
      const ownerOrAuthorName = manifest.owner ?? manifest.author;
      for (const command of manifest.commands) {
        commands.push({
          extensionId: manifest.name,
          commandName: command.name,
          ...(command.title === undefined ? {} : { title: command.title }),
          ...(manifest.title === undefined ? {} : { extensionName: manifest.title }),
          ...(ownerOrAuthorName === undefined ? {} : { ownerOrAuthorName }),
          entryPointMode: command.mode ?? "view",
          ...(sourceKind === undefined ? {} : { sourceKind }),
        });
      }
    }
    return commands;
  }

  async resolve(identity: CommandIdentity, signal?: AbortSignal): Promise<ExtensionDescriptor | undefined> {
    validateIdentity(identity);
    signal?.throwIfAborted();

    const indexed = await this.#getExtensionIndex();
    signal?.throwIfAborted();
    const entry = indexed.get(identity.extensionId);
    if (entry === undefined) {
      return undefined;
    }
    const command = entry.manifest.commands.find((candidate) => candidate.name === identity.commandName);
    if (command === undefined) {
      return undefined;
    }
    const preferences = {
      ...entry.manifest.preferences,
      ...command.preferences,
    };
    const preferenceMetadata = {
      ...entry.manifest.preferenceMetadata,
      ...command.preferenceMetadata,
    };
    const ownerOrAuthorName = entry.manifest.owner ?? entry.manifest.author;
    return {
      extensionId: entry.manifest.name,
      commandName: command.name,
      entrypoint: await this.#resolveEntrypoint(entry.directory, command),
      rootDirectory: entry.directory,
      ...(entry.manifest.title === undefined ? {} : { extensionName: entry.manifest.title }),
      ...(ownerOrAuthorName === undefined ? {} : { ownerOrAuthorName }),
      entryPointMode: command.mode ?? "view",
      ...(Object.keys(preferences).length === 0 ? {} : { preferences }),
      ...(Object.keys(preferenceMetadata).length === 0 ? {} : { preferenceMetadata }),
    };
  }

  async #getExtensionIndex(): Promise<
    ReadonlyMap<
      string,
      {
        readonly directory: string;
        readonly manifest: ExtensionManifest;
        readonly sourceKind?: ExtensionSourceKind;
      }
    >
  > {
    this.#extensionIndex ??= this.#buildExtensionIndex();
    return this.#extensionIndex;
  }

  async #buildExtensionIndex(): Promise<
    ReadonlyMap<
      string,
      {
        readonly directory: string;
        readonly manifest: ExtensionManifest;
        readonly sourceKind?: ExtensionSourceKind;
      }
    >
  > {
    const index = new Map<
      string,
      { readonly directory: string; readonly manifest: ExtensionManifest; readonly sourceKind?: ExtensionSourceKind }
    >();
    for (const [rootIndex, root] of this.#roots.entries()) {
      for (const directory of await this.#listExtensionDirectories(root, rootIndex === 0)) {
        const manifest = await this.#readManifest(path.join(directory, this.#manifestFileName));
        if (manifest !== undefined && !index.has(manifest.name)) {
          // Roots are ordered and directories are sorted, so retaining the
          // first entry preserves deterministic duplicate-name behavior.
          const sourceKind = this.#rootSourceKinds[rootIndex];
          index.set(manifest.name, {
            directory,
            manifest,
            ...(sourceKind === undefined ? {} : { sourceKind }),
          });
        }
      }
    }
    return index;
  }

  async #listExtensionDirectories(root: string, required: boolean): Promise<string[]> {
    let entries: Dirent[];
    try {
      entries = await readdir(root, { withFileTypes: true });
    } catch (error) {
      if (!required && isMissingPath(error)) {
        return [];
      }
      throw new BlastCoreError("catalog_root_unreadable", "Extension catalog root is not readable", {
        root,
        reason: String(error),
      });
    }

    const directories: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) {
        continue;
      }
      const directory = path.join(root, entry.name);
      if (await isDirectory(directory)) {
        directories.push(directory);
      }
    }
    return directories.toSorted();
  }

  async #readManifest(manifestPath: string): Promise<ExtensionManifest | undefined> {
    let raw: string;
    try {
      raw = await readFile(manifestPath, "utf8");
    } catch {
      return undefined;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return undefined;
    }
    return parseManifest(parsed);
  }

  async #resolveEntrypoint(rootDirectory: string, command: ManifestCommand): Promise<string> {
    if (command.entrypoint !== undefined) {
      const entrypoint = path.resolve(rootDirectory, command.entrypoint);
      if (!isInsideRoot(rootDirectory, entrypoint)) {
        throw new BlastCoreError("catalog_entrypoint_outside_root", "Manifest entrypoint escapes the extension root", {
          rootDirectory,
          entrypoint: command.entrypoint,
        });
      }
      if (!(await isFile(entrypoint))) {
        throw new BlastCoreError("catalog_entrypoint_missing", "Manifest entrypoint does not exist", {
          rootDirectory,
          entrypoint,
        });
      }
      return entrypoint;
    }

    for (const extension of ENTRYPOINT_EXTENSIONS) {
      const candidate = path.join(rootDirectory, "src", `${command.name}${extension}`);
      if (await isFile(candidate)) {
        return candidate;
      }
    }
    throw new BlastCoreError("catalog_entrypoint_missing", "No entrypoint follows the src/<command-name> convention", {
      rootDirectory,
      commandName: command.name,
    });
  }
}

const CATALOG_WATCH_DEBOUNCE_MILLISECONDS = 75;

function createFileSystemWatcher(directory: string, callback: () => void): FSWatcher {
  const watcher = watchFileSystem(directory, { persistent: false }, callback);
  watcher.on("error", callback);
  return watcher;
}

function closeFileSystemWatcher(watcher: FSWatcher): void {
  try {
    watcher.close();
  } catch {
    // A watcher may already have closed after a rename/error event.
  }
}

export function parseManifest(value: unknown): ExtensionManifest | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const name = value["name"];
  if (typeof name !== "string" || name.length === 0) {
    return undefined;
  }
  const title = parseOptionalManifestString(value["title"]);
  const author = parseOptionalManifestString(value["author"]);
  const owner = parseOptionalManifestString(value["owner"]);
  if (title === INVALID_MANIFEST_STRING || author === INVALID_MANIFEST_STRING || owner === INVALID_MANIFEST_STRING) {
    return undefined;
  }
  const rawCommands = value["commands"];
  if (!Array.isArray(rawCommands)) {
    return undefined;
  }

  const commands: ManifestCommand[] = [];
  for (const rawCommand of rawCommands) {
    if (!isRecord(rawCommand)) {
      return undefined;
    }
    const commandName = rawCommand["name"];
    if (typeof commandName !== "string" || commandName.length === 0) {
      return undefined;
    }
    const entrypoint = rawCommand["entrypoint"];
    if (entrypoint !== undefined && (typeof entrypoint !== "string" || entrypoint.length === 0)) {
      return undefined;
    }
    const commandTitle = parseOptionalManifestString(rawCommand["title"]);
    if (commandTitle === INVALID_MANIFEST_STRING) {
      return undefined;
    }
    const mode = rawCommand["mode"];
    if (mode !== undefined && mode !== "no-view" && mode !== "view" && mode !== "menu-bar") {
      return undefined;
    }
    const parsedPreferences = parsePreferenceDeclarations(rawCommand["preferences"]);
    if (parsedPreferences === undefined) {
      return undefined;
    }
    commands.push({
      name: commandName,
      ...(commandTitle === undefined ? {} : { title: commandTitle }),
      entrypoint,
      ...(mode === undefined ? {} : { mode }),
      ...(Object.keys(parsedPreferences.preferences).length === 0
        ? {}
        : { preferences: parsedPreferences.preferences }),
      ...(Object.keys(parsedPreferences.metadata).length === 0
        ? {}
        : { preferenceMetadata: parsedPreferences.metadata }),
    });
  }

  const parsedPreferences = parsePreferenceDeclarations(value["preferences"]);
  if (parsedPreferences === undefined) {
    return undefined;
  }
  return {
    name,
    ...(title === undefined ? {} : { title }),
    ...(author === undefined ? {} : { author }),
    ...(owner === undefined ? {} : { owner }),
    commands,
    preferences: parsedPreferences.preferences,
    preferenceMetadata: parsedPreferences.metadata,
  };
}

const INVALID_MANIFEST_STRING = Symbol("invalid-manifest-string");

function parseOptionalManifestString(value: unknown): string | undefined | typeof INVALID_MANIFEST_STRING {
  if (value === undefined) {
    return undefined;
  }
  return typeof value === "string" && value.length > 0 ? value : INVALID_MANIFEST_STRING;
}

interface ParsedPreferenceDeclarations {
  readonly preferences: Record<string, ExtensionPreferenceScalar>;
  readonly metadata: Record<string, ExtensionPreferenceMetadata>;
}

function parsePreferenceDeclarations(value: unknown): ParsedPreferenceDeclarations | undefined {
  const preferences: Record<string, ExtensionPreferenceScalar> = {};
  const metadata: Record<string, ExtensionPreferenceMetadata> = {};
  if (value === undefined) {
    return { preferences, metadata };
  }
  if (!Array.isArray(value)) {
    return undefined;
  }
  for (const rawPreference of value) {
    if (!isRecord(rawPreference)) {
      return undefined;
    }
    const preferenceName = rawPreference["name"];
    if (typeof preferenceName !== "string" || preferenceName.length === 0) {
      return undefined;
    }
    const type = rawPreference["type"];
    const defaultValue = rawPreference["default"];
    if (type === "checkbox") {
      if (defaultValue === undefined) {
        preferences[preferenceName] = false;
      } else if (typeof defaultValue === "boolean") {
        preferences[preferenceName] = defaultValue;
      } else {
        return undefined;
      }
    } else if (defaultValue !== undefined && isPreferenceScalar(defaultValue)) {
      preferences[preferenceName] = defaultValue;
    }

    const preferenceType = parsePreferenceType(type);
    if (preferenceType !== undefined) {
      metadata[preferenceName] = parsePreferenceMetadata(rawPreference, preferenceName, preferenceType);
    }
  }
  return { preferences, metadata };
}

function parsePreferenceMetadata(
  value: Record<string, unknown>,
  name: string,
  type: ExtensionPreferenceType,
): ExtensionPreferenceMetadata {
  const preferenceValue = parsePreferenceMetadataValue(value["value"]);
  const defaultValue = parsePreferenceMetadataValue(value["default"]);
  const data = parsePreferenceData(value["data"]);
  return {
    name,
    type,
    required: value["required"] === true,
    title: typeof value["title"] === "string" ? value["title"] : "",
    description: typeof value["description"] === "string" ? value["description"] : "",
    ...(preferenceValue === undefined ? {} : { value: preferenceValue }),
    ...(defaultValue === undefined ? {} : { default: defaultValue }),
    ...(typeof value["placeholder"] === "string" ? { placeholder: value["placeholder"] } : {}),
    ...(typeof value["label"] === "string" ? { label: value["label"] } : {}),
    ...(data === undefined ? {} : { data }),
  };
}

function parsePreferenceType(value: unknown): ExtensionPreferenceType | undefined {
  if (
    value === "appPicker" ||
    value === "checkbox" ||
    value === "dropdown" ||
    value === "password" ||
    value === "textfield" ||
    value === "file" ||
    value === "directory"
  ) {
    return value;
  }
  return undefined;
}

function parsePreferenceMetadataValue(value: unknown): ExtensionPreferenceMetadataValue | undefined {
  if (isPreferenceScalar(value)) {
    return value;
  }
  if (!isRecord(value)) {
    return undefined;
  }
  const platformValue: Record<string, ExtensionPreferenceScalar> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!isPreferenceScalar(entry)) {
      return undefined;
    }
    platformValue[key] = entry;
  }
  return platformValue;
}

function parsePreferenceData(value: unknown): readonly ExtensionPreferenceDataItem[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const data: ExtensionPreferenceDataItem[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item["title"] !== "string" || typeof item["value"] !== "string") {
      return undefined;
    }
    data.push({ title: item["title"], value: item["value"] });
  }
  return data;
}

function isPreferenceScalar(value: unknown): value is ExtensionPreferenceScalar {
  return (
    typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))
  );
}

function validateIdentity(identity: CommandIdentity): void {
  if (
    typeof identity.extensionId !== "string" ||
    identity.extensionId.length === 0 ||
    typeof identity.commandName !== "string" ||
    identity.commandName.length === 0
  ) {
    throw new BlastCoreError("invalid_command_identity", "Extension and command identifiers must not be empty");
  }
}

function validateNonEmptyString(value: string, field: string): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new BlastCoreError("invalid_catalog_options", `Catalog ${field} must be a non-empty string`);
  }
}

function validateOptionalSourceKind(value: unknown, field: string): void {
  if (value !== undefined && !EXTENSION_SOURCE_KINDS.includes(value as ExtensionSourceKind)) {
    throw new BlastCoreError("invalid_catalog_source_configuration", `${field} must be a valid extension source kind`);
  }
}

function isMissingPath(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function isInsideRoot(rootDirectory: string, candidate: string): boolean {
  const relative = path.relative(rootDirectory, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function isFile(candidate: string): Promise<boolean> {
  try {
    return (await stat(candidate)).isFile();
  } catch {
    return false;
  }
}

async function isDirectory(candidate: string): Promise<boolean> {
  try {
    return (await stat(candidate)).isDirectory();
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
