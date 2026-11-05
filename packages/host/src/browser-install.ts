import { maxSatisfying, satisfies } from "semver";

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
export class BrowserNativeModuleError extends BrowserInstallError {
  readonly packageName: string;
  constructor(packageName: string) {
    super(
      "BROWSER_NATIVE_MODULE",
      `Native package is not supported in the browser: ${packageName}`,
    );
    this.name = "BrowserNativeModuleError";
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
function supplied(name: string): boolean {
  return (
    name === "@raycast/api" ||
    name.startsWith("@raycast/") ||
    /^react(?:\/|$)/.test(name) ||
    name.startsWith("@types/")
  );
}
function packagePath(name: string): string {
  return `node_modules/${name}`;
}
function lockVersion(lock: BrowserLockfile | undefined, name: string): string | undefined {
  if (!lock) return undefined;
  const direct = lock.packages?.[`node_modules/${name}`]?.version;
  if (direct) return direct;
  const old = lock.dependencies?.[name]?.version;
  return old;
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
      const pax = decode(body);
      for (const record of pax.split("\n")) {
        const equals = record.indexOf("=");
        if (equals > 0) {
          const key = record.slice(record.indexOf(" ") + 1, equals);
          if (key === "path") paxPath = record.slice(equals + 1);
        }
      }
      continue;
    }
    name = paxPath ?? name;
    paxPath = undefined;
    if (type === 53 || name.endsWith("/")) continue;
    if (type === 0 || type === 48 || type === undefined) files.set(name, body.slice());
  }
  return files;
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function integrity(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-512", bytes);
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
  const resolved = new Map<string, Promise<void>>();
  let bytes = 0;
  const addBytes = (count: number) => {
    bytes += count;
    if (bytes > maxBytes) throw new BrowserSizeLimitError(maxBytes, bytes);
  };

  async function install(name: string, range: string): Promise<void> {
    if (supplied(name)) return;
    const pinned = lockVersion(lock, name);
    const key = `${name}@${pinned ?? range}`;
    const prior = resolved.get(key);
    if (prior) return prior;
    const task = (async () => {
      const response = await options.fetch(`${registry}/${name}`);
      if (!response.ok) throw new BrowserResolutionError(name, range);
      const packument = (await response.json()) as {
        versions?: Record<
          string,
          {
            dependencies?: Record<string, string>;
            peerDependencies?: Record<string, string>;
            dist?: { tarball?: string; integrity?: string };
          }
        >;
      };
      const available = Object.keys(packument.versions ?? {});
      const version = pinned ?? maxSatisfying(available, range);
      if (!version || !satisfies(version, range)) throw new BrowserResolutionError(name, range);
      const metadata = packument.versions?.[version];
      const tarball = metadata?.dist?.tarball;
      if (!metadata || !tarball) throw new BrowserResolutionError(name, range);
      if (versions.has(name) && versions.get(name) === version) return;
      if (versions.size >= maxPackages && !versions.has(name))
        throw new BrowserPackageLimitError(maxPackages);
      const archiveResponse = await options.fetch(tarball);
      if (!archiveResponse.ok) throw new BrowserResolutionError(name, version);
      const archive = new Uint8Array(await archiveResponse.arrayBuffer());
      addBytes(archive.byteLength);
      const actual = await integrity(archive);
      const expected = metadata.dist?.integrity;
      if (expected && expected !== actual) throw new BrowserIntegrityError(name, expected, actual);
      const files = unpackTar(await gunzip(archive));
      if (
        [...files.keys()].some(
          (path) =>
            path.endsWith(".node") || path === "binding.gyp" || path.endsWith("/binding.gyp"),
        )
      )
        throw new BrowserNativeModuleError(name);
      const root = packagePath(name);
      for (const [path, content] of files) {
        const clean = path.replace(/^package\/?/, "");
        if (clean) packages.set(`${root}/${clean}`, content);
      }
      if (!packages.has(`${root}/package.json`))
        packages.set(`${root}/package.json`, JSON.stringify({ name, version }));
      versions.set(name, version);
      const optionalPeers = new Set(
        Object.entries(
          (metadata as { peerDependenciesMeta?: Record<string, { optional?: boolean }> })
            .peerDependenciesMeta ?? {},
        )
          .filter(([, value]) => value?.optional === true)
          .map(([dependency]) => dependency),
      );
      const dependencies = Object.fromEntries(
        Object.entries({ ...metadata.dependencies, ...metadata.peerDependencies }).filter(
          ([dependency]) => !optionalPeers.has(dependency),
        ),
      );
      for (const [dependency, dependencyRange] of Object.entries(dependencies))
        await install(dependency, dependencyRange);
    })();
    resolved.set(key, task);
    return task;
  }
  for (const [name, range] of Object.entries(options.manifest.dependencies ?? {}))
    await install(name, range);
  return { packages, versions, bytes };
}
