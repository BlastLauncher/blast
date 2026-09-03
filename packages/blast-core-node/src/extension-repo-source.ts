import { spawn, spawnSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import tar from "tar";

import {
  DEFAULT_EXTERNAL_EXTENSION_MAX_ARCHIVE_ENTRIES,
  DEFAULT_EXTERNAL_EXTENSION_MAX_PACKAGE_BYTES,
} from "./extension-package-store.js";

export type ExtensionRepoSourceErrorCode =
  | "invalid_repo_options"
  | "repo_fetch_failed"
  | "extension_not_found"
  | "repo_archive_too_large";

export class ExtensionRepoSourceError extends Error {
  readonly code: ExtensionRepoSourceErrorCode;
  readonly details?: unknown;

  constructor(code: ExtensionRepoSourceErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "ExtensionRepoSourceError";
    this.code = code;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

export interface FetchExtensionsFromRepoOptions {
  /** Repository URL (https or local path) owning one directory per extension. */
  readonly repoUrl: string;
  /** Pinned revision fetched with `--depth 1`. */
  readonly revision: string;
  /** Extension directory names; each must be a single safe path segment. */
  readonly extensionNames: readonly string[];
  /** Partial-clone cache directory (`blob:none`, trees only until needed). */
  readonly cacheDir: string;
  /** Root receiving one `<name>/` directory per fetched extension. */
  readonly targetRoot: string;
  /**
   * Directory inside the repository that contains one subdirectory per
   * extension (the public `raycast/extensions` layout nests extensions under
   * `extensions/`). Prefixed paths are tried first with one leading component
   * stripped; bare names remain supported for synthetic/test repositories.
   */
  readonly pathPrefix?: string;
  readonly maxArchiveEntries?: number;
  readonly maxPackageBytes?: number;
  readonly signal?: AbortSignal;
}

export interface FetchedExtensions {
  readonly fetched: readonly string[];
  readonly missing: readonly string[];
}

/**
 * Fetches selected extension directories from an extension repository without
 * cloning it: a cached partial clone supplies trees, and `git archive` streams
 * only the requested directories into the target root. This is both the
 * product install seam (staged into `ExternalExtensionStore`) and the probe
 * acquisition path, so installation and coverage testing share one
 * implementation.
 */
export async function fetchExtensionsFromRepo(options: FetchExtensionsFromRepoOptions): Promise<FetchedExtensions> {
  const repoUrl = requireNonEmptyString(options.repoUrl, "repoUrl");
  const revision = requireNonEmptyString(options.revision, "revision");
  const cacheDir = requireAbsolutePath(options.cacheDir, "cacheDir");
  const targetRoot = requireAbsolutePath(options.targetRoot, "targetRoot");
  const names = options.extensionNames.map((name) => requireExtensionName(name));
  if (names.length === 0) {
    throw new ExtensionRepoSourceError("invalid_repo_options", "extensionNames must not be empty");
  }
  const maxArchiveEntries = validateLimit(
    options.maxArchiveEntries ?? DEFAULT_EXTERNAL_EXTENSION_MAX_ARCHIVE_ENTRIES,
    "maxArchiveEntries",
  );
  const maxPackageBytes = validateLimit(
    options.maxPackageBytes ?? DEFAULT_EXTERNAL_EXTENSION_MAX_PACKAGE_BYTES,
    "maxPackageBytes",
  );
  options.signal?.throwIfAborted();
  assertGitAvailable();
  const pathPrefix = normalizePathPrefix(options.pathPrefix ?? DEFAULT_REPO_PATH_PREFIX);

  await mkdir(targetRoot, { recursive: true });
  await ensurePartialClone({ repoUrl, revision, cacheDir, signal: options.signal });

  // One archive call first; fall back per directory so a single missing name
  // does not fail the whole batch.
  const missing = await extractWithFallback({
    cacheDir,
    revision,
    names,
    targetRoot,
    pathPrefix,
    maxArchiveEntries,
    maxPackageBytes,
    signal: options.signal,
  });
  return { fetched: names.filter((name) => !missing.includes(name)), missing };
}

interface CloneOptions {
  readonly repoUrl: string;
  readonly revision: string;
  readonly cacheDir: string;
  readonly signal?: AbortSignal | undefined;
}

async function ensurePartialClone(options: CloneOptions): Promise<void> {
  if (spawnSync("git", ["-C", options.cacheDir, "rev-parse", "--git-dir"], { stdio: "ignore" }).status !== 0) {
    await runGit(
      ["clone", "--filter=blob:none", "--no-checkout", options.repoUrl, options.cacheDir],
      "clone the extension repository",
      options.signal,
    );
  }
  await runGit(
    ["-C", options.cacheDir, "fetch", "--depth", "1", "origin", options.revision],
    "fetch the pinned revision",
    options.signal,
  );
}

interface ExtractOptions {
  readonly cacheDir: string;
  readonly revision: string;
  readonly names: readonly string[];
  readonly targetRoot: string;
  readonly pathPrefix: string | undefined;
  readonly maxArchiveEntries: number;
  readonly maxPackageBytes: number;
  readonly signal?: AbortSignal | undefined;
}

const DEFAULT_REPO_PATH_PREFIX = "extensions";

async function extractWithFallback(options: ExtractOptions): Promise<string[]> {
  const prefixedBatch =
    options.pathPrefix === undefined ? undefined : options.names.map((name) => `${options.pathPrefix}/${name}`);
  if (prefixedBatch !== undefined) {
    try {
      await archiveTo(options.cacheDir, options.revision, prefixedBatch, options, 1);
      return [];
    } catch (error) {
      // Quota breaches are authoritative; only unknown names fall back.
      if (error instanceof ExtensionRepoSourceError && error.code === "repo_archive_too_large") {
        throw error;
      }
      // Fall through to bare batch so synthetic repositories without the
      // prefix keep working; per-name fallback reports truly missing names.
    }
  }
  try {
    await archiveTo(options.cacheDir, options.revision, options.names, options, 0);
    return [];
  } catch (error) {
    if (error instanceof ExtensionRepoSourceError && error.code === "repo_archive_too_large") {
      throw error;
    }
    const missing: string[] = [];
    for (const name of options.names) {
      try {
        await archiveNames(options, [name]);
      } catch (retryError) {
        if (retryError instanceof ExtensionRepoSourceError && retryError.code === "repo_archive_too_large") {
          throw retryError;
        }
        missing.push(name);
      }
    }
    return missing;
  }
}

async function archiveNames(options: ExtractOptions, names: readonly string[]): Promise<void> {
  if (options.pathPrefix !== undefined) {
    try {
      await archiveTo(
        options.cacheDir,
        options.revision,
        names.map((name) => `${options.pathPrefix}/${name}`),
        options,
        1,
      );
      return;
    } catch (error) {
      if (error instanceof ExtensionRepoSourceError && error.code === "repo_archive_too_large") {
        throw error;
      }
      // Fall through to bare names for synthetic repositories.
    }
  }
  await archiveTo(options.cacheDir, options.revision, names, options, 0);
}

function archiveTo(
  cacheDir: string,
  revision: string,
  names: readonly string[],
  options: ExtractOptions,
  stripComponents: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let entryCount = 0;
    let totalBytes = 0;
    let settled = false;
    const fail = (error: Error): void => {
      if (!settled) {
        settled = true;
        git.kill();
        reject(error);
      }
    };
    const git = spawn("git", ["-C", cacheDir, "archive", revision, "--", ...names], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const extractor = tar.x({
      cwd: options.targetRoot,
      ...(stripComponents > 0 ? { strip: stripComponents } : {}),
      onentry: (entry) => {
        entryCount += 1;
        totalBytes += entry.size ?? 0;
        if (entryCount > options.maxArchiveEntries || totalBytes > options.maxPackageBytes) {
          fail(
            new ExtensionRepoSourceError(
              "repo_archive_too_large",
              `Fetched extensions exceed the archive bounds (${entryCount} entries)`,
              { revision, names: [...names] },
            ),
          );
        }
      },
    });
    let stderr = "";
    git.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    git.on("error", (error) => fail(toRepoError(error, options, stderr)));
    extractor.on("error", (error: Error) => fail(toRepoError(error, options, stderr)));
    extractor.on("close", () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    });
    git.on("close", (code) => {
      if (code !== 0) {
        fail(toRepoError(new Error(`git archive exited with code ${code}`), options, stderr));
        return;
      }
      extractor.end();
    });
    if (options.signal !== undefined) {
      const onAbort = (): void => {
        fail(new ExtensionRepoSourceError("repo_fetch_failed", "Extension fetch was aborted", { revision }));
      };
      if (options.signal.aborted) {
        onAbort();
      } else {
        options.signal.addEventListener("abort", onAbort, { once: true });
        extractor.on("close", () => options.signal?.removeEventListener("abort", onAbort));
      }
    }
    git.stdout.pipe(extractor);
  });
}

function toRepoError(error: Error, options: ExtractOptions, stderr: string): ExtensionRepoSourceError {
  if (error instanceof ExtensionRepoSourceError) {
    return error;
  }
  const output = stderr.trim();
  if (/did not match any file|pathspec.*did not match/i.test(output)) {
    return new ExtensionRepoSourceError(
      "extension_not_found",
      "None of the requested extensions exist at the revision",
      {
        revision: options.revision,
        names: [...options.names],
        output: truncate(output, 2048),
      },
    );
  }
  return new ExtensionRepoSourceError("repo_fetch_failed", `Failed to fetch extensions: ${error.message}`, {
    revision: options.revision,
    output: truncate(output, 2048),
  });
}

function runGit(args: readonly string[], label: string, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", [...args], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", () => reject(new ExtensionRepoSourceError("repo_fetch_failed", `Failed to ${label}`, {})));
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new ExtensionRepoSourceError("repo_fetch_failed", `Failed to ${label} (exit ${code})`, {
            output: truncate(stderr.trim(), 2048),
          }),
        );
      }
    });
    signal?.addEventListener(
      "abort",
      () => {
        child.kill();
        reject(new ExtensionRepoSourceError("repo_fetch_failed", `Failed to ${label}: aborted`, {}));
      },
      { once: true },
    );
  });
}

function assertGitAvailable(): void {
  if (spawnSync("git", ["--version"], { stdio: "ignore" }).status !== 0) {
    throw new ExtensionRepoSourceError("repo_fetch_failed", "git is required to fetch extensions", {});
  }
}

function requireNonEmptyString(value: string, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ExtensionRepoSourceError("invalid_repo_options", `${name} must not be empty`, { name });
  }
  return value;
}

function requireAbsolutePath(value: string, name: string): string {
  const resolved = requireNonEmptyString(value, name);
  if (!path.isAbsolute(resolved)) {
    throw new ExtensionRepoSourceError("invalid_repo_options", `${name} must be an absolute path`, { name });
  }
  return resolved;
}

function requireExtensionName(value: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value === "." ||
    value === ".." ||
    value.includes("/") ||
    value.includes("\\") ||
    value.startsWith("-")
  ) {
    throw new ExtensionRepoSourceError("invalid_repo_options", `Extension name must be a single safe path segment`, {
      value,
    });
  }
  return value;
}

function normalizePathPrefix(value: string): string | undefined {
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }
  const trimmed = value.replace(/^\/+|\/+$/g, "");
  if (
    trimmed.length === 0 ||
    trimmed === "." ||
    trimmed === ".." ||
    trimmed.includes("\\") ||
    trimmed.startsWith("-")
  ) {
    throw new ExtensionRepoSourceError("invalid_repo_options", "pathPrefix must be a safe relative directory", {
      value,
    });
  }
  for (const segment of trimmed.split("/")) {
    if (segment.length === 0 || segment === "." || segment === "..") {
      throw new ExtensionRepoSourceError("invalid_repo_options", "pathPrefix must be a safe relative directory", {
        value,
      });
    }
  }
  return trimmed;
}

function validateLimit(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ExtensionRepoSourceError("invalid_repo_options", `${name} must be a positive safe integer`, { name });
  }
  return value;
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : value.slice(0, maxLength);
}
