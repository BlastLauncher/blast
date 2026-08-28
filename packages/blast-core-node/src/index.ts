import { readdir, readFile, stat } from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";

import { BlastCoreError, type CommandIdentity, type ExtensionCatalog } from "@blastlauncher/core";
import type { ExtensionDescriptor } from "@blastlauncher/extension-contract";

export const DEFAULT_MANIFEST_FILE_NAME = "package.json";

const ENTRYPOINT_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js", ".mjs", ".cjs"] as const;

export interface ManifestCommand {
  readonly name: string;
  readonly entrypoint: string | undefined;
}

export interface ExtensionManifest {
  readonly name: string;
  readonly commands: readonly ManifestCommand[];
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
 * manifests it cannot read or validate.
 */
export class FilesystemExtensionCatalog implements ExtensionCatalog {
  readonly #root: string;
  readonly #manifestFileName: string;

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

    for (const directory of await this.#listExtensionDirectories()) {
      const manifest = await this.#readManifest(path.join(directory, this.#manifestFileName));
      if (manifest === undefined || manifest.name !== identity.extensionId) {
        continue;
      }
      const command = manifest.commands.find((candidate) => candidate.name === identity.commandName);
      if (command === undefined) {
        return undefined;
      }
      return {
        extensionId: manifest.name,
        commandName: command.name,
        entrypoint: await this.#resolveEntrypoint(directory, command),
        rootDirectory: directory,
      };
    }
    return undefined;
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
    commands.push({ name: commandName, entrypoint });
  }
  return { name, commands };
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
