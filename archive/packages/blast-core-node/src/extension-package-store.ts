import { cp, lstat, mkdir, mkdtemp, readdir, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";

import tar from "tar";

import { FilesystemExtensionCatalog, parseManifest } from "./index.js";

export const DEFAULT_EXTERNAL_EXTENSION_MAX_ARCHIVE_ENTRIES = 10_000;
export const DEFAULT_EXTERNAL_EXTENSION_MAX_PACKAGE_BYTES = 512 * 1024 * 1024;

export type ExternalExtensionStoreErrorCode =
  | "archive_invalid"
  | "archive_too_large"
  | "extension_backup_exists"
  | "extension_not_installed"
  | "extension_store_invalid_options"
  | "extension_target_unsafe"
  | "extension_already_installed"
  | "invalid_extension_package"
  | "invalid_package_source"
  | "package_source_unsafe"
  | "package_stage_unsafe"
  | "package_operation_failed"
  | "rollback_unavailable";

export class ExternalExtensionStoreError extends Error {
  readonly code: ExternalExtensionStoreErrorCode;
  readonly details?: unknown;

  constructor(code: ExternalExtensionStoreErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "ExternalExtensionStoreError";
    this.code = code;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

export interface ExternalExtensionStoreOptions {
  /** Direct-package root used by the packaged external catalog. */
  readonly root: string;
  /** Recoverable backup root; defaults to a sibling of `root`. */
  readonly backupRoot?: string;
  readonly manifestFileName?: string;
  /** Called once after each successful filesystem mutation. */
  readonly refreshCatalog?: () => void | Promise<void>;
  readonly maxArchiveEntries?: number;
  readonly maxPackageBytes?: number;
}

export interface ExternalExtensionPackage {
  readonly extensionId: string;
  readonly version?: string;
  readonly directory: string;
  readonly sourceKind: "external";
}

interface PreparedPackage {
  readonly directory: string;
  readonly extensionId: string;
  readonly version?: string;
}

interface ArchiveEntrySummary {
  readonly path: string;
  readonly type: string;
  readonly size: number;
}

interface MovedAsideDirectory {
  readonly container: string;
  readonly directory: string;
}

/**
 * Explicit host-side lifecycle for user-managed external extension packages.
 * It never resolves npm names, runs a package manager, or installs dependencies.
 */
export class ExternalExtensionStore {
  readonly #root: string;
  readonly #backupRoot: string;
  readonly #manifestFileName: string;
  readonly #refreshCatalog: (() => void | Promise<void>) | undefined;
  readonly #maxArchiveEntries: number;
  readonly #maxPackageBytes: number;

  constructor(options: ExternalExtensionStoreOptions) {
    const root = requirePath(options.root, "root");
    const backupRoot = path.resolve(
      options.backupRoot ?? path.join(path.dirname(root), `${path.basename(root)}.backups`),
    );
    if (isPathNested(root, backupRoot)) {
      throw new ExternalExtensionStoreError(
        "extension_store_invalid_options",
        "backupRoot must be a separate sibling tree from root",
        { root, backupRoot },
      );
    }
    if (options.manifestFileName !== undefined && !isSafeManifestFileName(options.manifestFileName)) {
      throw new ExternalExtensionStoreError(
        "extension_store_invalid_options",
        "manifestFileName must be a safe non-empty file name",
      );
    }
    if (options.refreshCatalog !== undefined && typeof options.refreshCatalog !== "function") {
      throw new ExternalExtensionStoreError(
        "extension_store_invalid_options",
        "refreshCatalog must be a function when provided",
      );
    }

    this.#root = root;
    this.#backupRoot = backupRoot;
    this.#manifestFileName = options.manifestFileName ?? "package.json";
    this.#refreshCatalog = options.refreshCatalog;
    this.#maxArchiveEntries = validateLimit(
      options.maxArchiveEntries ?? DEFAULT_EXTERNAL_EXTENSION_MAX_ARCHIVE_ENTRIES,
      "maxArchiveEntries",
    );
    this.#maxPackageBytes = validateLimit(
      options.maxPackageBytes ?? DEFAULT_EXTERNAL_EXTENSION_MAX_PACKAGE_BYTES,
      "maxPackageBytes",
    );
  }

  get root(): string {
    return this.#root;
  }

  get backupRoot(): string {
    return this.#backupRoot;
  }

  /** Imports a new directory or local tar archive into the external root. */
  async install(sourcePath: string): Promise<ExternalExtensionPackage> {
    return this.#withPreparedPackage(sourcePath, async (prepared) => {
      const target = this.#targetPath(prepared.extensionId);
      await this.#assertTargetAvailable(target);
      const backup = this.#backupPath(prepared.extensionId);
      if ((await pathKind(backup)) !== "missing") {
        throw new ExternalExtensionStoreError(
          "extension_backup_exists",
          "An extension backup already exists; rollback or remove it before installing a replacement",
          { extensionId: prepared.extensionId },
        );
      }

      await this.#activatePrepared(prepared.directory, target);
      await this.#refresh();
      return this.#toPackage(prepared, target);
    });
  }

  /** Replaces an installed package while retaining the previous package for rollback. */
  async update(sourcePath: string): Promise<ExternalExtensionPackage> {
    return this.#withPreparedPackage(sourcePath, async (prepared) => {
      const target = this.#targetPath(prepared.extensionId);
      await this.#requireDirectory(target);
      await this.#replaceWithBackup(prepared.directory, target, this.#backupPath(prepared.extensionId));
      await this.#refresh();
      return this.#toPackage(prepared, target);
    });
  }

  /** Moves an installed package into its recoverable one-slot backup. */
  async remove(extensionId: string): Promise<ExternalExtensionPackage> {
    const target = this.#targetPath(extensionId);
    await this.#requireDirectory(target);
    const current = await this.#readManagedPackage(target);
    const backup = this.#backupPath(extensionId);
    await mkdir(this.#backupRoot, { recursive: true });
    const displacedBackup = await this.#moveAsideIfPresent(backup, this.#backupRoot, "remove-backup-");
    let moved = false;
    try {
      await rename(target, backup);
      moved = true;
      await this.#discardMovedAside(displacedBackup);
    } catch (error) {
      if (moved) {
        await rename(backup, target).catch(() => {});
      }
      await this.#restoreMovedAside(displacedBackup, backup);
      throw operationError("remove", extensionId, error);
    }

    await this.#refresh();
    return this.#toPackage(current, target);
  }

  /** Restores the previous package, swapping the current package into the backup slot. */
  async rollback(extensionId: string): Promise<ExternalExtensionPackage> {
    const target = this.#targetPath(extensionId);
    const backup = this.#backupPath(extensionId);
    await this.#requireDirectory(backup, "rollback_unavailable");
    const restored = await this.#readManagedPackage(backup);
    const targetKind = await pathKind(target);
    if (targetKind === "other") {
      throw new ExternalExtensionStoreError("extension_target_unsafe", "The extension target is not a directory", {
        extensionId,
        target,
      });
    }

    const displacedActive =
      targetKind === "directory" ? await this.#moveAside(target, this.#root, "rollback-active-") : undefined;
    let restoredIntoTarget = false;
    let activeMovedToBackup = false;
    try {
      await rename(backup, target);
      restoredIntoTarget = true;
      if (displacedActive !== undefined) {
        await rename(displacedActive.directory, backup);
        activeMovedToBackup = true;
      }
      await this.#discardMovedAside(displacedActive);
    } catch (error) {
      if (activeMovedToBackup && displacedActive !== undefined) {
        await rename(backup, displacedActive.directory).catch(() => {});
      }
      if (restoredIntoTarget) {
        await rename(target, backup).catch(() => {});
      }
      if (displacedActive !== undefined) {
        await rename(displacedActive.directory, target).catch(() => {});
      }
      throw operationError("rollback", extensionId, error);
    }

    await this.#refresh();
    return this.#toPackage(restored, target);
  }

  /** Returns the currently active external package, if one is installed. */
  async getInstalled(extensionId: string): Promise<ExternalExtensionPackage | undefined> {
    const target = this.#targetPath(extensionId);
    const kind = await pathKind(target);
    if (kind === "missing") {
      return undefined;
    }
    if (kind === "other") {
      throw new ExternalExtensionStoreError("extension_target_unsafe", "The extension target is not a directory", {
        extensionId,
        target,
      });
    }
    const packageMetadata = await this.#readManagedPackage(target);
    return this.#toPackage(packageMetadata, target);
  }

  async #withPreparedPackage<T>(sourcePath: string, operation: (prepared: PreparedPackage) => Promise<T>): Promise<T> {
    await mkdir(this.#root, { recursive: true });
    const stagingRoot = await mkdtemp(path.join(path.dirname(this.#root), ".blast-extension-stage-"));
    const packageDirectory = path.join(stagingRoot, "package");
    try {
      await this.#stageSource(sourcePath, packageDirectory);
      const prepared = await this.#validatePackage(packageDirectory, stagingRoot);
      return await operation(prepared);
    } finally {
      await rm(stagingRoot, { recursive: true, force: true });
    }
  }

  async #stageSource(sourcePath: string, destination: string): Promise<void> {
    if (typeof sourcePath !== "string" || sourcePath.length === 0) {
      throw new ExternalExtensionStoreError("invalid_package_source", "Package source path must be a non-empty string");
    }
    const source = path.resolve(sourcePath);
    let sourceStats;
    try {
      sourceStats = await lstat(source);
    } catch (error) {
      throw new ExternalExtensionStoreError("invalid_package_source", "Package source cannot be read", {
        source,
        cause: String(error),
      });
    }

    if (sourceStats.isDirectory()) {
      await this.#validateDirectoryTree(source, "package_source_unsafe");
      await cp(source, destination, { recursive: true, errorOnExist: true, force: false });
      await this.#validateDirectoryTree(destination, "package_stage_unsafe");
      return;
    }
    if (!sourceStats.isFile() || !isTarArchive(source)) {
      throw new ExternalExtensionStoreError(
        "invalid_package_source",
        "Package source must be a directory or a .tgz/.tar.gz/.tar archive",
        { source },
      );
    }

    await this.#extractArchive(source, destination);
    await this.#validateDirectoryTree(destination, "package_stage_unsafe");
  }

  async #extractArchive(source: string, destination: string): Promise<void> {
    const entries: ArchiveEntrySummary[] = [];
    let entryCount = 0;
    try {
      await tar.t({
        file: source,
        strict: true,
        onentry: (entry) => {
          entryCount += 1;
          if (entries.length <= this.#maxArchiveEntries) {
            const normalizedPath = normalizeArchivePath(entry.path);
            if (normalizedPath !== undefined && !entry.meta) {
              entries.push({ path: normalizedPath, type: entry.type ?? "", size: entry.size ?? 0 });
            }
          }
        },
      });
    } catch (error) {
      if (error instanceof ExternalExtensionStoreError) {
        throw error;
      }
      throw new ExternalExtensionStoreError("archive_invalid", "Extension archive could not be inspected", {
        source,
        cause: String(error),
      });
    }
    if (entryCount > this.#maxArchiveEntries || entries.length > this.#maxArchiveEntries) {
      throw new ExternalExtensionStoreError("archive_too_large", "Extension archive contains too many entries", {
        source,
        maxArchiveEntries: this.#maxArchiveEntries,
      });
    }

    let totalBytes = 0;
    for (const entry of entries) {
      if (entry.type !== "File" && entry.type !== "OldFile" && entry.type !== "Directory" && entry.type !== "") {
        throw new ExternalExtensionStoreError("archive_invalid", "Extension archive contains an unsafe entry", {
          source,
          entry: entry.path,
          type: entry.type,
        });
      }
      if (!Number.isSafeInteger(entry.size) || entry.size < 0) {
        throw new ExternalExtensionStoreError("archive_invalid", "Extension archive contains an invalid entry size", {
          source,
          entry: entry.path,
        });
      }
      totalBytes += entry.size;
      if (totalBytes > this.#maxPackageBytes) {
        throw new ExternalExtensionStoreError(
          "archive_too_large",
          "Extension archive expands beyond the package limit",
          {
            source,
            maxPackageBytes: this.#maxPackageBytes,
          },
        );
      }
    }

    const prefix = findArchivePrefix(entries);
    const strip = prefix === undefined ? 0 : 1;
    const hasManifest = entries.some(
      (entry) => stripArchivePrefix(entry.path, prefix, strip) === this.#manifestFileName,
    );
    if (!hasManifest) {
      throw new ExternalExtensionStoreError("invalid_extension_package", "Extension archive has no package manifest", {
        source,
        manifestFileName: this.#manifestFileName,
      });
    }

    await mkdir(destination, { recursive: true });
    try {
      await tar.x({
        file: source,
        cwd: destination,
        strict: true,
        strip,
        preservePaths: false,
        preserveOwner: false,
        unlink: true,
      });
    } catch (error) {
      throw new ExternalExtensionStoreError("archive_invalid", "Extension archive could not be extracted", {
        source,
        cause: String(error),
      });
    }
  }

  async #validateDirectoryTree(
    directory: string,
    code: "package_source_unsafe" | "package_stage_unsafe",
  ): Promise<number> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      throw new ExternalExtensionStoreError(code, "Extension package directory cannot be read", {
        directory,
        cause: String(error),
      });
    }

    let totalBytes = 0;
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      let entryStats;
      try {
        entryStats = await lstat(entryPath);
      } catch (error) {
        throw new ExternalExtensionStoreError(code, "Extension package entry cannot be read", {
          entry: entryPath,
          cause: String(error),
        });
      }
      if (entryStats.isSymbolicLink() || entry.isSymbolicLink()) {
        throw new ExternalExtensionStoreError(code, "Extension packages cannot contain symbolic links", {
          entry: entryPath,
        });
      }
      if (entryStats.isDirectory()) {
        totalBytes += await this.#validateDirectoryTree(entryPath, code);
        if (totalBytes > this.#maxPackageBytes) {
          throw new ExternalExtensionStoreError("archive_too_large", "Extension package exceeds the package limit", {
            directory,
            maxPackageBytes: this.#maxPackageBytes,
          });
        }
        continue;
      }
      if (!entryStats.isFile()) {
        throw new ExternalExtensionStoreError(code, "Extension packages cannot contain special filesystem entries", {
          entry: entryPath,
        });
      }
      totalBytes += entryStats.size;
      if (totalBytes > this.#maxPackageBytes) {
        throw new ExternalExtensionStoreError("archive_too_large", "Extension package exceeds the package limit", {
          directory,
          maxPackageBytes: this.#maxPackageBytes,
        });
      }
    }
    return totalBytes;
  }

  async #validatePackage(packageDirectory: string, stagingRoot: string): Promise<PreparedPackage> {
    const manifestPath = path.join(packageDirectory, this.#manifestFileName);
    let rawManifest: string;
    try {
      rawManifest = await readFile(manifestPath, "utf8");
    } catch (error) {
      throw new ExternalExtensionStoreError("invalid_extension_package", "Extension package has no readable manifest", {
        manifestPath,
        cause: String(error),
      });
    }

    let parsedManifest: unknown;
    try {
      parsedManifest = JSON.parse(rawManifest);
    } catch (error) {
      throw new ExternalExtensionStoreError("invalid_extension_package", "Extension package manifest is not JSON", {
        manifestPath,
        cause: String(error),
      });
    }
    const manifest = parseManifest(parsedManifest);
    if (manifest === undefined || manifest.commands.length === 0) {
      throw new ExternalExtensionStoreError(
        "invalid_extension_package",
        "Extension package manifest is invalid or declares no commands",
        { manifestPath },
      );
    }
    const storageName = encodeExtensionDirectoryName(manifest.name);
    if (storageName === "." || storageName === "..") {
      throw new ExternalExtensionStoreError("invalid_extension_package", "Extension manifest name cannot be a path", {
        extensionId: manifest.name,
      });
    }

    const catalog = new FilesystemExtensionCatalog({
      root: stagingRoot,
      manifestFileName: this.#manifestFileName,
    });
    for (const command of manifest.commands) {
      try {
        const descriptor = await catalog.resolve({ extensionId: manifest.name, commandName: command.name });
        if (descriptor === undefined) {
          throw new Error(`Command ${command.name} was not found after staging`);
        }
      } catch (error) {
        throw new ExternalExtensionStoreError(
          "invalid_extension_package",
          "Extension package contains a command without a valid entrypoint",
          { extensionId: manifest.name, commandName: command.name, cause: String(error) },
        );
      }
    }

    const version =
      isRecord(parsedManifest) && typeof parsedManifest.version === "string" && parsedManifest.version.length > 0
        ? parsedManifest.version
        : undefined;
    return {
      directory: packageDirectory,
      extensionId: manifest.name,
      ...(version === undefined ? {} : { version }),
    };
  }

  async #readManagedPackage(directory: string): Promise<PreparedPackage> {
    const stagingRoot = path.dirname(directory);
    await this.#validateDirectoryTree(directory, "package_stage_unsafe");
    return this.#validatePackage(directory, stagingRoot);
  }

  async #activatePrepared(source: string, target: string): Promise<void> {
    try {
      await rename(source, target);
    } catch (error) {
      throw operationError("install", path.basename(target), error);
    }
  }

  async #replaceWithBackup(source: string, target: string, backup: string): Promise<void> {
    await mkdir(this.#backupRoot, { recursive: true });
    const displacedBackup = await this.#moveAsideIfPresent(backup, this.#backupRoot, "update-backup-");
    let activeMoved = false;
    let replacementMoved = false;
    try {
      await rename(target, backup);
      activeMoved = true;
      await rename(source, target);
      replacementMoved = true;
      await this.#discardMovedAside(displacedBackup);
    } catch (error) {
      if (replacementMoved) {
        await rename(target, source).catch(() => {});
      }
      if (activeMoved) {
        await rename(backup, target).catch(() => {});
      }
      await this.#restoreMovedAside(displacedBackup, backup);
      throw operationError("update", path.basename(target), error);
    }
  }

  async #moveAsideIfPresent(target: string, parent: string, prefix: string): Promise<MovedAsideDirectory | undefined> {
    const kind = await pathKind(target);
    if (kind === "missing") {
      return undefined;
    }
    if (kind === "other") {
      throw new ExternalExtensionStoreError("extension_target_unsafe", "Managed package path is not a directory", {
        target,
      });
    }
    return this.#moveAside(target, parent, prefix);
  }

  async #moveAside(target: string, parent: string, prefix: string): Promise<MovedAsideDirectory> {
    const container = await mkdtemp(path.join(parent, `.${prefix}`));
    const directory = path.join(container, "package");
    try {
      await rename(target, directory);
      return { container, directory };
    } catch (error) {
      await rm(container, { recursive: true, force: true });
      throw error;
    }
  }

  async #discardMovedAside(moved: MovedAsideDirectory | undefined): Promise<void> {
    if (moved !== undefined) {
      await rm(moved.container, { recursive: true, force: true });
    }
  }

  async #restoreMovedAside(moved: MovedAsideDirectory | undefined, target: string): Promise<void> {
    if (moved === undefined) {
      return;
    }
    await rename(moved.directory, target).catch(() => {});
    await rm(moved.container, { recursive: true, force: true });
  }

  async #assertTargetAvailable(target: string): Promise<void> {
    const kind = await pathKind(target);
    if (kind === "missing") {
      return;
    }
    throw new ExternalExtensionStoreError(
      kind === "other" ? "extension_target_unsafe" : "extension_already_installed",
      "An extension with this manifest name is already installed",
      { target },
    );
  }

  async #requireDirectory(
    target: string,
    missingCode: "extension_not_installed" | "rollback_unavailable" = "extension_not_installed",
  ): Promise<void> {
    const kind = await pathKind(target);
    if (kind === "directory") {
      return;
    }
    if (kind === "missing") {
      throw new ExternalExtensionStoreError(missingCode, "The requested extension package is not available", {
        target,
      });
    }
    throw new ExternalExtensionStoreError("extension_target_unsafe", "Managed package path is not a directory", {
      target,
    });
  }

  #targetPath(extensionId: string): string {
    return path.join(this.#root, encodeExtensionDirectoryName(requireExtensionId(extensionId)));
  }

  #backupPath(extensionId: string): string {
    return path.join(this.#backupRoot, encodeExtensionDirectoryName(requireExtensionId(extensionId)));
  }

  #toPackage(prepared: PreparedPackage, directory: string): ExternalExtensionPackage {
    return {
      extensionId: prepared.extensionId,
      ...(prepared.version === undefined ? {} : { version: prepared.version }),
      directory,
      sourceKind: "external",
    };
  }

  async #refresh(): Promise<void> {
    await this.#refreshCatalog?.();
  }
}

function requirePath(value: string, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ExternalExtensionStoreError("extension_store_invalid_options", `${field} must be a non-empty path`);
  }
  return path.resolve(value);
}

function requireExtensionId(value: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ExternalExtensionStoreError("invalid_extension_package", "Extension ID must be a non-empty string");
  }
  return value;
}

function validateLimit(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ExternalExtensionStoreError(
      "extension_store_invalid_options",
      `${field} must be a positive safe integer`,
    );
  }
  return value;
}

function isTarArchive(source: string): boolean {
  const lowerSource = source.toLowerCase();
  return lowerSource.endsWith(".tgz") || lowerSource.endsWith(".tar.gz") || lowerSource.endsWith(".tar");
}

function isSafeManifestFileName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value !== "." &&
    value !== ".." &&
    path.basename(value) === value &&
    !value.includes("\\")
  );
}

function encodeExtensionDirectoryName(extensionId: string): string {
  const encoded = encodeURIComponent(extensionId);
  if (encoded === "." || encoded === "..") {
    throw new ExternalExtensionStoreError(
      "invalid_extension_package",
      "Extension ID cannot resolve to a path segment",
      {
        extensionId,
      },
    );
  }
  return encoded;
}

function isPathNested(first: string, second: string): boolean {
  return isPathWithin(first, second) || isPathWithin(second, first);
}

function isPathWithin(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function pathKind(target: string): Promise<"missing" | "directory" | "other"> {
  try {
    const stats = await lstat(target);
    if (stats.isSymbolicLink()) {
      throw new ExternalExtensionStoreError(
        "extension_target_unsafe",
        "Managed package paths cannot be symbolic links",
        {
          target,
        },
      );
    }
    return stats.isDirectory() ? "directory" : "other";
  } catch (error) {
    if (isMissingPath(error)) {
      return "missing";
    }
    throw error;
  }
}

function normalizeArchivePath(value: string): string | undefined {
  const normalized = value.replace(/^(?:\.\/)+/, "").replace(/\/+$/, "");
  if (normalized.length === 0) {
    return undefined;
  }
  if (
    value.includes("\\") ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(normalized) ||
    normalized.split("/").some((segment) => segment.length === 0 || segment === "." || segment === "..")
  ) {
    throw new ExternalExtensionStoreError("archive_invalid", "Extension archive contains an unsafe path", {
      path: value,
    });
  }
  return normalized;
}

function findArchivePrefix(entries: readonly ArchiveEntrySummary[]): string | undefined {
  const topLevels = new Set(entries.map((entry) => entry.path.split("/")[0]!));
  if (topLevels.size !== 1) {
    return undefined;
  }
  const prefix = [...topLevels][0]!;
  return entries.some((entry) => entry.path.startsWith(`${prefix}/`)) ? prefix : undefined;
}

function stripArchivePrefix(value: string, prefix: string | undefined, strip: number): string {
  if (strip === 0 || prefix === undefined) {
    return value;
  }
  return value.slice(prefix.length + 1);
}

function operationError(operation: string, extensionId: string, cause: unknown): ExternalExtensionStoreError {
  if (cause instanceof ExternalExtensionStoreError) {
    return cause;
  }
  return new ExternalExtensionStoreError("package_operation_failed", `Failed to ${operation} extension package`, {
    extensionId,
    cause: String(cause),
  });
}

function isMissingPath(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
