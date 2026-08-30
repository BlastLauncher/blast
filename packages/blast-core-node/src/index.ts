import { readdir, readFile, stat } from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";

import { BlastCoreError, type CommandIdentity, type ExtensionCatalog } from "@blastlauncher/core";
import type { ExtensionDescriptor, ExtensionEntryPointMode } from "@blastlauncher/extension-contract";

export const DEFAULT_MANIFEST_FILE_NAME = "package.json";

const ENTRYPOINT_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js", ".mjs", ".cjs"] as const;

export interface ManifestCommand {
  readonly name: string;
  readonly entrypoint: string | undefined;
  /** Raycast command mode; omitted manifests default to a view command. */
  readonly mode?: ExtensionEntryPointMode;
  /** Preference defaults declared on this command in the Raycast manifest. */
  readonly preferences?: Readonly<Record<string, string | number | boolean>>;
}

export interface ExtensionManifest {
  readonly name: string;
  readonly title?: string;
  readonly author?: string;
  readonly owner?: string;
  readonly commands: readonly ManifestCommand[];
  /** Manifest preference defaults keyed by preference name. */
  readonly preferences: Readonly<Record<string, string | number | boolean>>;
}

export interface FilesystemExtensionCatalogOptions {
  /**
   * Directory that contains one subdirectory per installed extension. Each
   * subdirectory is expected to hold a manifest file.
   */
  readonly root: string;
  readonly manifestFileName?: string;
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
  readonly #root: string;
  readonly #manifestFileName: string;
  #extensionIndex?: Promise<ReadonlyMap<string, { readonly directory: string; readonly manifest: ExtensionManifest }>>;

  constructor(options: FilesystemExtensionCatalogOptions) {
    validateNonEmptyString(options.root, "root");
    if (options.manifestFileName !== undefined) {
      validateNonEmptyString(options.manifestFileName, "manifestFileName");
    }
    this.#root = path.resolve(options.root);
    this.#manifestFileName = options.manifestFileName ?? DEFAULT_MANIFEST_FILE_NAME;
  }

  get root(): string {
    return this.#root;
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
    };
  }

  async #getExtensionIndex(): Promise<
    ReadonlyMap<string, { readonly directory: string; readonly manifest: ExtensionManifest }>
  > {
    this.#extensionIndex ??= this.#buildExtensionIndex();
    return this.#extensionIndex;
  }

  async #buildExtensionIndex(): Promise<
    ReadonlyMap<string, { readonly directory: string; readonly manifest: ExtensionManifest }>
  > {
    const index = new Map<string, { readonly directory: string; readonly manifest: ExtensionManifest }>();
    for (const directory of await this.#listExtensionDirectories()) {
      const manifest = await this.#readManifest(path.join(directory, this.#manifestFileName));
      if (manifest !== undefined && !index.has(manifest.name)) {
        // Directories are sorted, so retaining the first entry preserves the
        // existing deterministic duplicate-name behavior.
        index.set(manifest.name, { directory, manifest });
      }
    }
    return index;
  }

  async #listExtensionDirectories(): Promise<string[]> {
    let entries: Dirent[];
    try {
      entries = await readdir(this.#root, { withFileTypes: true });
    } catch (error) {
      throw new BlastCoreError("catalog_root_unreadable", "Extension catalog root is not readable", {
        root: this.#root,
        reason: String(error),
      });
    }

    const directories: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) {
        continue;
      }
      const directory = path.join(this.#root, entry.name);
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
    const mode = rawCommand["mode"];
    if (mode !== undefined && mode !== "no-view" && mode !== "view" && mode !== "menu-bar") {
      return undefined;
    }
    const preferences = parsePreferenceDefaults(rawCommand["preferences"]);
    if (preferences === undefined) {
      return undefined;
    }
    commands.push({
      name: commandName,
      entrypoint,
      ...(mode === undefined ? {} : { mode }),
      ...(Object.keys(preferences).length === 0 ? {} : { preferences }),
    });
  }

  const preferences = parsePreferenceDefaults(value["preferences"]);
  if (preferences === undefined) {
    return undefined;
  }
  return {
    name,
    ...(title === undefined ? {} : { title }),
    ...(author === undefined ? {} : { author }),
    ...(owner === undefined ? {} : { owner }),
    commands,
    preferences,
  };
}

const INVALID_MANIFEST_STRING = Symbol("invalid-manifest-string");

function parseOptionalManifestString(value: unknown): string | undefined | typeof INVALID_MANIFEST_STRING {
  if (value === undefined) {
    return undefined;
  }
  return typeof value === "string" && value.length > 0 ? value : INVALID_MANIFEST_STRING;
}

function parsePreferenceDefaults(value: unknown): Record<string, string | number | boolean> | undefined {
  const preferences: Record<string, string | number | boolean> = {};
  if (value === undefined) {
    return preferences;
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
    } else if (
      defaultValue !== undefined &&
      (typeof defaultValue === "string" || typeof defaultValue === "number" || typeof defaultValue === "boolean")
    ) {
      preferences[preferenceName] = defaultValue;
    }
  }
  return preferences;
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
