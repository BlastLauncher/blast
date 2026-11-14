import { maxSatisfying, satisfies } from "semver";
import { supplied } from "@blastlauncher/protocol/dependency-policy";

export type BrowserFetch = (input: string, init?: RequestInit) => Promise<Response>;
export type BrowserManifest = {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
};
export type BrowserLockfile = {
  packages?: Record<string, { version?: string; dependencies?: Record<string, string> }>;
  dependencies?: Record<string, { version?: string; dependencies?: Record<string, unknown> }>;
  [key: string]: unknown;
};
export type BrowserInstallOptions = {
  fetch: BrowserFetch;
  manifest: BrowserManifest;
  lockfile?: BrowserLockfile | string;
  maxBytes?: number;
  maxPackages?: number;
  registry?: string;
};
export type BrowserPackageFile = string | Uint8Array;
export type BrowserInstallResult = {
  packages: Map<string, BrowserPackageFile>;
  versions: Map<string, string>;
  bytes: number;
};

export class BrowserInstallError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "BrowserInstallError";
    this.code = code;
  }
}
export class BrowserIntegrityError extends BrowserInstallError {
  readonly packageName: string;
  readonly expected: string;
  readonly actual: string;
  constructor(packageName: string, expected: string, actual: string) {
    super("BROWSER_INTEGRITY", `Integrity check failed for ${packageName}`);
    this.name = "BrowserIntegrityError";
    this.packageName = packageName;
    this.expected = expected;
    this.actual = actual;
  }
}
export class BrowserSizeLimitError extends BrowserInstallError {
  readonly limit: number;
  readonly actual: number;
  constructor(limit: number, actual: number) {
    super(
      "BROWSER_SIZE_LIMIT",
      `Browser dependency size limit exceeded (${actual} > ${limit} bytes)`,
    );
    this.name = "BrowserSizeLimitError";
    this.limit = limit;
    this.actual = actual;
  }
}
export class BrowserPackageLimitError extends BrowserInstallError {
  readonly limit: number;
  constructor(limit: number) {
    super("BROWSER_PACKAGE_LIMIT", `Browser dependency package limit exceeded (${limit})`);
    this.name = "BrowserPackageLimitError";
    this.limit = limit;
  }
}
export class BrowserNativePackageError extends BrowserInstallError {
  readonly packageName: string;
  constructor(packageName: string) {
    super(
      "BROWSER_NATIVE_MODULE",
      `Native package is not supported in the browser: ${packageName}`,
    );
    this.name = "BrowserNativePackageError";
    this.packageName = packageName;
  }
}
export class BrowserResolutionError extends BrowserInstallError {
  readonly packageName: string;
  constructor(packageName: string, range: string) {
    super("BROWSER_RESOLUTION", `Unable to resolve ${packageName}@${range} from the npm registry`);
    this.name = "BrowserResolutionError";
    this.packageName = packageName;
  }
}

const DEFAULT_MAX_BYTES = 32 * 1024 * 1024;
const DEFAULT_MAX_PACKAGES = 128;
function packagePath(name: string): string {
  return `node_modules/${name}`;
}
function ancestorCandidates(parentPath: string | undefined, name: string): string[] {
  if (!parentPath) return [packagePath(name)];
  // Nearest first, exactly the order Node and bundleForBrowser resolve in: the
  // parent's own node_modules, then each enclosing node_modules up to the root.
  const result: string[] = [`${parentPath}/node_modules/${name}`];
  let packageDirectory = parentPath;
  while (packageDirectory && packageDirectory !== ".") {
    const nodeModulesDirectory = packageDirectory.slice(0, packageDirectory.lastIndexOf("/"));
    if (!nodeModulesDirectory) break;
    result.push(`${nodeModulesDirectory}/${name}`);
    const separator = nodeModulesDirectory.lastIndexOf("/");
    if (separator < 0) break;
    packageDirectory = nodeModulesDirectory.slice(0, separator);
  }
  result.push(packagePath(name));
  return [...new Set(result)];
}
function lockedVersion(lock: BrowserLockfile | undefined, path: string): string | undefined {
  return lock?.packages?.[path]?.version;
}
/** npm v1 lockfiles only nest dependency records, so only the root has a path here. */
function legacyLockVersion(lock: BrowserLockfile | undefined, name: string): string | undefined {
  return lock?.dependencies?.[name]?.version;
}
function parseLockfile(
  lockfile: BrowserLockfile | string | undefined,
): BrowserLockfile | undefined {
  if (lockfile === undefined) return undefined;
  if (typeof lockfile === "string") return JSON.parse(lockfile) as BrowserLockfile;
  return lockfile;
}
function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}
function readString(bytes: Uint8Array): string {
  return decode(bytes).replace(/\0.*$/, "").trim();
}
function octal(bytes: Uint8Array): number {
  const value = readString(bytes).replace(/[^0-7].*$/, "");
  return value ? Number.parseInt(value, 8) : 0;
}

export class BrowserTarPathError extends BrowserInstallError {
  readonly path: string;
  constructor(path: string) {
    super("BROWSER_TAR_PATH", `Unsafe path in npm archive: ${path}`);
    this.name = "BrowserTarPathError";
    this.path = path;
  }
}
function normalTarPath(path: string): string {
  if (path.includes("\\") || path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path))
    throw new BrowserTarPathError(path);
  const parts = path.split("/");
  if (parts.some((part) => part === "..")) throw new BrowserTarPathError(path);
  return parts.filter((part) => part !== "" && part !== ".").join("/");
}

/** Parses the small subset of POSIX tar needed for npm archives, including pax and ustar names. */
export function unpackTar(archive: Uint8Array): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  let offset = 0;
  let paxPath: string | undefined;
  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512);
    offset += 512;
    if (header.every((byte) => byte === 0)) break;
    const size = octal(header.subarray(124, 136));
    const type = header[156];
    let name = readString(header.subarray(0, 100));
    const prefix = readString(header.subarray(345, 500));
    if (prefix) name = `${prefix}/${name}`;
    const body = archive.subarray(offset, offset + size);
    offset += Math.ceil(size / 512) * 512;
    if (type === 120) {
      for (const record of decode(body).split("\n")) {
        const equals = record.indexOf("=");
        if (equals > 0) {
          const key = record.slice(record.indexOf(" ") + 1, equals);
          if (key === "path") paxPath = record.slice(equals + 1);
        }
      }
      continue;
    }
    name = normalTarPath(paxPath ?? name);
    paxPath = undefined;
    if (!name || type === 53 || type === 1 || type === 2 || name.endsWith("/")) continue;
    if (type === 0 || type === 48 || type === undefined) files.set(name, body.slice());
  }
  return files;
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const stream = new Blob([copy.buffer]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function integrity(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-512", copy.buffer);
  let binary = "";
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return `sha512-${btoa(binary)}`;
}

export async function installForBrowser(
  options: BrowserInstallOptions,
): Promise<BrowserInstallResult> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxPackages = options.maxPackages ?? DEFAULT_MAX_PACKAGES;
  const lock = parseLockfile(options.lockfile);
  const registry = (options.registry ?? "https://registry.npmjs.org").replace(/\/$/, "");
  const packages = new Map<string, BrowserPackageFile>();
  const versions = new Map<string, string>();
  const records = new Map<
    string,
    { name: string; version: string; promise: Promise<void>; active: boolean }
  >();
  let bytes = 0;
  const addBytes = (count: number) => {
    bytes += count;
    if (bytes > maxBytes) throw new BrowserSizeLimitError(maxBytes, bytes);
  };

  // One registry request per package name, however many dependents ask for it.
  const packuments = new Map<string, Promise<unknown>>();
  const packumentFor = (name: string, range: string) => {
    let pending = packuments.get(name);
    if (!pending) {
      pending = options
        .fetch(`${registry}/${name}`, {
          headers: { Accept: "application/vnd.npm.install-v1+json" },
        })
        .then((response) => {
          if (!response.ok) throw new BrowserResolutionError(name, range);
          return response.json();
        });
      packuments.set(name, pending);
    }
    return pending;
  };
  async function install(name: string, range: string, parentPath?: string): Promise<void> {
    if (supplied(name)) return;
    const packument = (await packumentFor(name, range)) as {
      versions?: Record<
        string,
        {
          dependencies?: Record<string, string>;
          peerDependencies?: Record<string, string>;
          peerDependenciesMeta?: Record<string, { optional?: boolean }>;
          dist?: { tarball?: string; integrity?: string };
        }
      >;
    };

    // The nearest existing copy is the one the importer will load, so it alone
    // decides: reuse it when it satisfies, otherwise nest a copy under the parent.
    // A farther matching copy must not count; it would be shadowed at runtime.
    const candidates = ancestorCandidates(parentPath, name);
    const shadow = candidates.find((candidate) => records.has(candidate));
    if (shadow) {
      const record = records.get(shadow)!;
      if (satisfies(record.version, range)) {
        if (!record.active) await record.promise;
        return;
      }
    }

    // Nothing is loaded yet, so follow the layout npm resolved for this
    // extension. The nearest locked copy that satisfies the range is where Node
    // would find it, including a nested copy when the root holds another major.
    let path = shadow
      ? undefined
      : candidates.find((candidate) => {
          const version = lockedVersion(lock, candidate);
          return version !== undefined && satisfies(version, range) && !records.has(candidate);
        });
    if (!path) {
      if (shadow) {
        // A shadowing copy forces nesting below the importer; a top-level
        // duplicate range conflict nests below the root copy itself.
        path = `${parentPath ?? packagePath(name)}/node_modules/${name}`;
      } else if (parentPath === undefined) {
        path = packagePath(name);
      } else {
        const root = packagePath(name);
        const rootVersion = lockedVersion(lock, root);
        // The lockfile's root version is the copy npm hoisted for this importer;
        // when it does not satisfy the range, nest instead of overwriting it.
        path =
          rootVersion !== undefined && !satisfies(rootVersion, range)
            ? `${parentPath}/node_modules/${name}`
            : root;
      }
    }
    while (records.has(path)) {
      const record = records.get(path)!;
      if (satisfies(record.version, range)) {
        if (!record.active) await record.promise;
        return;
      }
      path = `${path}/node_modules/${name}`;
    }

    const locked =
      lockedVersion(lock, path) ??
      (path === packagePath(name) ? legacyLockVersion(lock, name) : undefined);
    const version =
      locked !== undefined && satisfies(locked, range)
        ? locked
        : maxSatisfying(Object.keys(packument.versions ?? {}), range);
    if (!version || !satisfies(version, range)) throw new BrowserResolutionError(name, range);
    const metadata = packument.versions?.[version];
    const tarball = metadata?.dist?.tarball;
    if (!metadata || !tarball) throw new BrowserResolutionError(name, range);
    if (records.size >= maxPackages) throw new BrowserPackageLimitError(maxPackages);

    let finish!: () => void;
    let fail!: (error: unknown) => void;
    const promise = new Promise<void>((resolve, reject) => {
      finish = resolve;
      fail = reject;
    });
    const record = { name, version, promise, active: true };
    records.set(path, record);
    const task = (async () => {
      try {
        const archiveResponse = await options.fetch(tarball);
        if (!archiveResponse.ok) throw new BrowserResolutionError(name, version);
        const archive = new Uint8Array(await archiveResponse.arrayBuffer());
        addBytes(archive.byteLength);
        const actual = await integrity(archive);
        const expected = metadata.dist?.integrity;
        const expectedSha512 = expected?.split(/\s+/).find((entry) => entry.startsWith("sha512-"));
        if (expectedSha512 && expectedSha512 !== actual)
          throw new BrowserIntegrityError(name, expectedSha512, actual);
        const files = unpackTar(await gunzip(archive));
        if (
          [...files.keys()].some(
            (file) =>
              file.endsWith(".node") || file === "binding.gyp" || file.endsWith("/binding.gyp"),
          )
        )
          throw new BrowserNativePackageError(name);
        for (const [file, content] of files) {
          const clean = file.replace(/^package\/?/, "");
          if (clean) packages.set(`${path}/${clean}`, content);
        }
        if (!packages.has(`${path}/package.json`))
          packages.set(`${path}/package.json`, JSON.stringify({ name, version }));
        if (!versions.has(name) || path === packagePath(name)) versions.set(name, version);
        const optionalPeers = new Set(
          Object.entries(metadata.peerDependenciesMeta ?? {})
            .filter(([, value]) => value?.optional === true)
            .map(([dependency]) => dependency),
        );
        const dependencies = Object.fromEntries(
          Object.entries({ ...metadata.dependencies, ...metadata.peerDependencies }).filter(
            ([dependency]) => !optionalPeers.has(dependency),
          ),
        );
        await Promise.all(
          Object.entries(dependencies).map(([dependency, dependencyRange]) =>
            install(dependency, dependencyRange, path),
          ),
        );
        record.active = false;
        finish();
      } catch (error) {
        record.active = false;
        fail(error);
      }
    })();
    // Keep the promise exposed by the record independent of the async executor's return value.
    void task;
    return promise;
  }
  await Promise.all(
    Object.entries(options.manifest.dependencies ?? {}).map(([name, range]) =>
      install(name, range),
    ),
  );
  return { packages, versions, bytes };
}
