import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export type ExtensionDepsErrorCode =
  | "dependency_manifest_invalid"
  | "dependency_install_failed"
  | "dependency_platform_unsupported"
  | "dependency_offline_unavailable"
  | "dependency_install_too_large"
  | "invalid_deps_options";

export class ExtensionDepsError extends Error {
  readonly code: ExtensionDepsErrorCode;
  readonly details?: unknown;

  constructor(code: ExtensionDepsErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "ExtensionDepsError";
    this.code = code;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

export interface ExtensionDependencyInstallRunner {
  (
    command: string,
    args: readonly string[],
    options: { readonly cwd: string; readonly signal?: AbortSignal },
  ): Promise<{
    readonly stdout: string;
    readonly stderr: string;
  }>;
}

export interface EnsureExtensionDependenciesOptions {
  /** Absolute path of the extension root containing the manifest. */
  readonly extensionRoot: string;
  /** Stable extension identity used to partition the store. */
  readonly extensionId: string;
  /** Absolute root owning one isolated view per extension identity. */
  readonly storeRoot: string;
  readonly manifestFileName?: string;
  readonly npmExecutable?: string;
  readonly offline?: boolean;
  readonly maxInstallBytes?: number;
  readonly maxCacheBytes?: number;
  readonly installTimeoutMilliseconds?: number;
  readonly signal?: AbortSignal;
  /** Injected in tests; defaults to spawning the package manager. */
  readonly runInstall?: ExtensionDependencyInstallRunner;
}

export interface ExtensionDependencyView {
  readonly extensionId: string;
  /** Isolated `node_modules` directory (may not exist when nothing is installed). */
  readonly nodeModulesRoot: string;
  /** True when an install ran in this call; false on lockfile hit or no dependencies. */
  readonly installed: boolean;
  /** Resolved top-level versions by package name. */
  readonly resolved: Readonly<Record<string, string>>;
}

const LOCKFILE_NAME = "blast-deps-lock.json";
const LOCKFILE_VERSION = 1;
const DEFAULT_NPM_EXECUTABLE = "npm";
const DEFAULT_MAX_INSTALL_BYTES = 512 * 1024 * 1024;
const DEFAULT_MAX_CACHE_BYTES = 2 * 1024 * 1024 * 1024;
const DEFAULT_INSTALL_TIMEOUT_MILLISECONDS = 5 * 60 * 1000;
const MAX_OUTPUT_BYTES = 64 * 1024;
const MAX_DETAILS_BYTES = 4 * 1024;
const LOCK_POLL_INTERVAL_MILLISECONDS = 250;
const LOCK_STALE_MILLISECONDS = 60 * 1000;

interface DepsLockfile {
  readonly version: number;
  readonly extensionId: string;
  readonly manifestHash: string;
  readonly resolved: Readonly<Record<string, string>>;
  readonly bytes: number;
  readonly lastUsed: string;
}

/**
 * Ensures an isolated dependency view for one extension. Reads the manifest
 * runtime dependencies, skips network work on a lockfile hit, and otherwise
 * installs with the package manager in the host process.
 */
export async function ensureExtensionDependencies(
  options: EnsureExtensionDependenciesOptions,
): Promise<ExtensionDependencyView> {
  const extensionRoot = requireAbsolutePath(options.extensionRoot, "extensionRoot");
  const storeRoot = requireAbsolutePath(options.storeRoot, "storeRoot");
  const extensionId = requireNonEmptyString(options.extensionId, "extensionId");
  const manifestFileName = options.manifestFileName ?? "package.json";
  const offline = options.offline ?? false;
  const maxInstallBytes = requirePositiveInteger(
    options.maxInstallBytes ?? DEFAULT_MAX_INSTALL_BYTES,
    "maxInstallBytes",
  );
  const maxCacheBytes = requirePositiveInteger(options.maxCacheBytes ?? DEFAULT_MAX_CACHE_BYTES, "maxCacheBytes");
  const installTimeoutMilliseconds = requirePositiveInteger(
    options.installTimeoutMilliseconds ?? DEFAULT_INSTALL_TIMEOUT_MILLISECONDS,
    "installTimeoutMilliseconds",
  );
  options.signal?.throwIfAborted();

  const viewDirectory = path.join(storeRoot, viewDirectoryName(extensionId));
  const nodeModulesRoot = path.join(viewDirectory, "node_modules");
  const manifest = await readManifest(path.join(extensionRoot, manifestFileName), extensionId);
  // Only runtime dependencies reach the extension process; development
  // tooling is never bundled into a running command.
  const wanted = manifest.dependencies ?? {};
  if (Object.keys(wanted).length === 0) {
    return { extensionId, nodeModulesRoot, installed: false, resolved: {} };
  }
  const manifestHash = hashManifest(wanted);
  // `file:` ranges are relative to the extension manifest; rebase them to
  // absolute paths so the synthetic manifest resolves the same files.
  const installable: Record<string, string> = {};
  for (const [name, range] of Object.entries(wanted)) {
    installable[name] = range.startsWith("file:")
      ? `file:${path.resolve(extensionRoot, range.slice("file:".length))}`
      : range;
  }

  await mkdir(viewDirectory, { recursive: true });
  const lock = await acquireLock(viewDirectory, installTimeoutMilliseconds, options.signal);
  try {
    options.signal?.throwIfAborted();
    const cached = await readLockfile(viewDirectory);
    if (cached !== undefined && cached.manifestHash === manifestHash && (await exists(nodeModulesRoot))) {
      await writeLockfile(viewDirectory, { ...cached, lastUsed: new Date().toISOString() });
      return { extensionId, nodeModulesRoot, installed: false, resolved: cached.resolved };
    }

    await writeSyntheticManifest(viewDirectory, extensionId, installable);
    await runPackageManager({
      npmExecutable: options.npmExecutable ?? DEFAULT_NPM_EXECUTABLE,
      viewDirectory,
      offline,
      installTimeoutMilliseconds,
      signal: options.signal,
      runInstall: options.runInstall,
      extensionId,
    });
    const resolved = await readResolvedVersions(nodeModulesRoot, Object.keys(wanted));
    const bytes = await directoryBytes(viewDirectory);
    if (bytes > maxInstallBytes) {
      await rm(viewDirectory, { recursive: true, force: true });
      throw new ExtensionDepsError(
        "dependency_install_too_large",
        `Dependencies for ${extensionId} exceed the per-extension install quota`,
        { extensionId, bytes, maxInstallBytes },
      );
    }
    const lockfile: DepsLockfile = {
      version: LOCKFILE_VERSION,
      extensionId,
      manifestHash,
      resolved,
      bytes,
      lastUsed: new Date().toISOString(),
    };
    await writeLockfile(viewDirectory, lockfile);
    await enforceCacheQuota(storeRoot, viewDirectory, maxCacheBytes);
    return { extensionId, nodeModulesRoot, installed: true, resolved };
  } finally {
    await lock.release();
  }
}

async function runPackageManager(args: {
  readonly npmExecutable: string;
  readonly viewDirectory: string;
  readonly offline: boolean;
  readonly installTimeoutMilliseconds: number;
  readonly signal?: AbortSignal | undefined;
  readonly runInstall?: ExtensionDependencyInstallRunner | undefined;
  readonly extensionId: string;
}): Promise<void> {
  const npmArgs = [
    "install",
    "--no-audit",
    "--no-fund",
    "--no-update-notifier",
    ...(args.offline ? ["--offline"] : []),
  ];
  let stdout = "";
  let stderr = "";
  try {
    const runner = args.runInstall ?? defaultInstallRunner;
    const result = await runner(args.npmExecutable, npmArgs, {
      cwd: args.viewDirectory,
      ...(args.signal === undefined ? {} : { signal: args.signal }),
    });
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (error) {
    throw classifyInstallFailure(error, args.extensionId, args.offline, args.viewDirectory);
  }
  void stdout;
  void stderr;
}

function defaultInstallRunner(
  command: string,
  npmArgs: readonly string[],
  options: { readonly cwd: string; readonly signal?: AbortSignal },
): Promise<{ readonly stdout: string; readonly stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      [...npmArgs],
      {
        cwd: options.cwd,
        timeout: DEFAULT_INSTALL_TIMEOUT_MILLISECONDS,
        maxBuffer: MAX_OUTPUT_BYTES,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            Object.assign(
              new Error(`package manager failed: ${truncate(String(stderr || error.message), MAX_DETAILS_BYTES)}`),
              {
                cause: error,
                stderr: truncate(String(stderr), MAX_DETAILS_BYTES),
              },
            ),
          );
          return;
        }
        resolve({
          stdout: truncate(String(stdout), MAX_OUTPUT_BYTES),
          stderr: truncate(String(stderr), MAX_OUTPUT_BYTES),
        });
      },
    );
  });
}

function classifyInstallFailure(
  error: unknown,
  extensionId: string,
  offline: boolean,
  viewDirectory: string,
): ExtensionDepsError {
  const record = (typeof error === "object" && error !== null ? error : {}) as {
    readonly message?: unknown;
    readonly stderr?: unknown;
  };
  const output = `${typeof record.stderr === "string" ? record.stderr : ""}\n${typeof record.message === "string" ? record.message : String(error)}`;
  if (offline) {
    return new ExtensionDepsError(
      "dependency_offline_unavailable",
      `Dependencies for ${extensionId} are not cached and offline mode forbids downloads`,
      { extensionId, viewDirectory, output: truncate(output, MAX_DETAILS_BYTES) },
    );
  }
  if (
    /EBADPLATFORM|EBADARCH|EBADENGINE|not compatible with your (operating system|platform|architecture)|unsupported platform|darwin|macos|win32.*x64/i.test(
      output,
    ) &&
    /EBADPLATFORM|EBADARCH|not compatible|unsupported platform|optional dep/i.test(output)
  ) {
    return new ExtensionDepsError(
      "dependency_platform_unsupported",
      `Dependencies for ${extensionId} cannot build or load on this platform`,
      { extensionId, viewDirectory, output: truncate(output, MAX_DETAILS_BYTES) },
    );
  }
  return new ExtensionDepsError("dependency_install_failed", `Dependencies for ${extensionId} failed to install`, {
    extensionId,
    viewDirectory,
    output: truncate(output, MAX_DETAILS_BYTES),
  });
}

async function enforceCacheQuota(storeRoot: string, currentView: string, maxCacheBytes: number): Promise<void> {
  const entries = await readdir(storeRoot, { withFileTypes: true }).catch(() => []);
  const views: { readonly directory: string; readonly lockfile: DepsLockfile }[] = [];
  let total = 0;
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.endsWith(".lock")) {
      continue;
    }
    const directory = path.join(storeRoot, entry.name);
    const lockfile = await readLockfile(directory);
    if (lockfile === undefined) {
      continue;
    }
    views.push({ directory, lockfile });
    total += lockfile.bytes;
  }
  if (total <= maxCacheBytes) {
    return;
  }
  const evictable = views
    .filter((view) => view.directory !== currentView)
    .toSorted((left, right) => left.lockfile.lastUsed.localeCompare(right.lockfile.lastUsed));
  for (const view of evictable) {
    if (total <= maxCacheBytes) {
      break;
    }
    await rm(view.directory, { recursive: true, force: true }).catch(() => {});
    total -= view.lockfile.bytes;
  }
}

async function readManifest(
  manifestPath: string,
  extensionId: string,
): Promise<{ dependencies?: Record<string, string> }> {
  let raw: string;
  try {
    raw = await readFile(manifestPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw new ExtensionDepsError("dependency_manifest_invalid", `Cannot read the manifest for ${extensionId}`, {
      extensionId,
      manifestPath,
    });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new ExtensionDepsError("dependency_manifest_invalid", `The manifest for ${extensionId} is not valid JSON`, {
      extensionId,
      manifestPath,
    });
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ExtensionDepsError("dependency_manifest_invalid", `The manifest for ${extensionId} is not an object`, {
      extensionId,
      manifestPath,
    });
  }
  const record = parsed as Record<string, unknown>;
  if (record.dependencies !== undefined && !isStringMap(record.dependencies)) {
    throw new ExtensionDepsError(
      "dependency_manifest_invalid",
      `The manifest dependencies for ${extensionId} must be a string map`,
      { extensionId, manifestPath },
    );
  }
  return {
    ...(record.dependencies === undefined ? {} : { dependencies: record.dependencies as Record<string, string> }),
  };
}

function hashManifest(wanted: Record<string, string>): string {
  const sorted = Object.fromEntries(
    Object.keys(wanted)
      .toSorted()
      .map((name) => [name, wanted[name]]),
  );
  return createHash("sha256").update(JSON.stringify(sorted)).digest("hex");
}

function viewDirectoryName(extensionId: string): string {
  const sanitized = extensionId.replaceAll(/[^a-zA-Z0-9._-]/g, "_").slice(0, 64) || "extension";
  const digest = createHash("sha256").update(extensionId).digest("hex").slice(0, 8);
  return `${sanitized}-${digest}`;
}

async function writeSyntheticManifest(
  viewDirectory: string,
  extensionId: string,
  wanted: Record<string, string>,
): Promise<void> {
  await writeFile(
    path.join(viewDirectory, "package.json"),
    `${JSON.stringify({ name: `blast-extension-${extensionId}`, version: "0.0.0", private: true, dependencies: wanted }, null, 2)}\n`,
    "utf8",
  );
}

async function readResolvedVersions(
  nodeModulesRoot: string,
  wanted: readonly string[],
): Promise<Record<string, string>> {
  const resolved: Record<string, string> = {};
  for (const name of wanted) {
    // Scoped packages nest one level deeper; only top-level entries are recorded.
    const manifestPath = path.join(nodeModulesRoot, ...name.split("/"), "package.json");
    try {
      const raw = await readFile(manifestPath, "utf8");
      const parsed = JSON.parse(raw) as { readonly version?: unknown };
      if (typeof parsed.version === "string") {
        resolved[name] = parsed.version;
      }
    } catch {
      // A package the manager reports as installed but unreadable is left out
      // of the lockfile rather than failing the whole view.
    }
  }
  return resolved;
}

async function directoryBytes(directory: string): Promise<number> {
  let total = 0;
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      total += await directoryBytes(full);
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      total += (await stat(full).catch(() => undefined))?.size ?? 0;
    }
  }
  return total;
}

async function readLockfile(viewDirectory: string): Promise<DepsLockfile | undefined> {
  try {
    const raw = await readFile(path.join(viewDirectory, LOCKFILE_NAME), "utf8");
    const parsed = JSON.parse(raw) as Partial<DepsLockfile>;
    if (
      parsed.version !== LOCKFILE_VERSION ||
      typeof parsed.extensionId !== "string" ||
      typeof parsed.manifestHash !== "string" ||
      !isStringMap(parsed.resolved) ||
      typeof parsed.bytes !== "number" ||
      typeof parsed.lastUsed !== "string"
    ) {
      return undefined;
    }
    return parsed as DepsLockfile;
  } catch {
    return undefined;
  }
}

async function writeLockfile(viewDirectory: string, lockfile: DepsLockfile): Promise<void> {
  await writeFile(path.join(viewDirectory, LOCKFILE_NAME), `${JSON.stringify(lockfile, null, 2)}\n`, "utf8");
}

async function acquireLock(
  viewDirectory: string,
  timeoutMilliseconds: number,
  signal?: AbortSignal,
): Promise<{ release(): Promise<void> }> {
  const lockDirectory = `${viewDirectory}.lock`;
  const deadline = Date.now() + Math.min(timeoutMilliseconds, 120 * 1000);
  while (true) {
    signal?.throwIfAborted();
    try {
      await mkdir(lockDirectory);
      return {
        release: async () => {
          await rm(lockDirectory, { recursive: true, force: true }).catch(() => {});
        },
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
    }
    const age = await lockAge(lockDirectory);
    if (age !== undefined && age > LOCK_STALE_MILLISECONDS) {
      await rm(lockDirectory, { recursive: true, force: true }).catch(() => {});
      continue;
    }
    if (Date.now() >= deadline) {
      throw new ExtensionDepsError(
        "dependency_install_failed",
        "Timed out waiting for another dependency install for the same extension",
        { viewDirectory },
      );
    }
    await new Promise((resolve) => setTimeout(resolve, LOCK_POLL_INTERVAL_MILLISECONDS));
  }
}

async function lockAge(lockDirectory: string): Promise<number | undefined> {
  const stats = await stat(lockDirectory).catch(() => undefined);
  return stats === undefined ? undefined : Date.now() - stats.mtimeMs;
}

async function exists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

function requireAbsolutePath(value: string, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ExtensionDepsError("invalid_deps_options", `${name} must not be empty`);
  }
  if (!path.isAbsolute(value)) {
    throw new ExtensionDepsError("invalid_deps_options", `${name} must be an absolute path`, { name, value });
  }
  return value;
}

function requireNonEmptyString(value: string, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ExtensionDepsError("invalid_deps_options", `${name} must not be empty`);
  }
  return value;
}

function requirePositiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ExtensionDepsError("invalid_deps_options", `${name} must be a positive safe integer`, { name });
  }
  return value;
}

function isStringMap(value: unknown): value is Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every((entry) => typeof entry === "string");
}

function truncate(value: string, maxBytes: number): string {
  return value.length <= maxBytes ? value : value.slice(0, maxBytes);
}
