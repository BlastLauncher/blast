/**
 * Browser bundling has deliberately no filesystem fallback. The caller owns
 * both maps, which makes this module usable with esbuild-wasm as well as the
 * native esbuild used by the tests.
 */

export type BrowserBundleFile = string | Uint8Array;

export type BrowserEsbuild = {
  build(options: object): Promise<{
    outputFiles: Array<{ text: string; contents: Uint8Array }> | undefined;
    warnings: Array<{ text: string }> | undefined;
  }>;
};

export type BrowserBundleOptions = {
  esbuild: BrowserEsbuild;
  files: Map<string, BrowserBundleFile>;
  packages: Map<string, BrowserBundleFile>;
  /** In-memory path to the extension command module. */
  command: string;
  /** In-memory path to the runtime browser entry. */
  runtimeEntry: string;
  /** Explicit specifier-to-file aliases for supplied runtime modules. */
  aliases?: Record<string, string>;
};

export type BrowserBundle = {
  code: string;
  warnings: string[];
  bytes: number;
};

export class BrowserMissingFileError extends Error {
  readonly code = "BROWSER_MISSING_FILE";
  readonly path: string;

  constructor(path: string) {
    super(`Browser bundle file is missing: ${path}`);
    this.name = "BrowserMissingFileError";
    this.path = path;
  }
}

export class BrowserMissingDependencyError extends Error {
  readonly code = "BROWSER_MISSING_DEPENDENCY";
  readonly packages: string[];

  constructor(packages: Iterable<string>) {
    const names = [...new Set(packages)].toSorted();
    super(`Browser bundle dependencies are missing: ${names.join(", ")}`);
    this.name = "BrowserMissingDependencyError";
    this.packages = names;
  }
}

export class BrowserNativeModuleError extends Error {
  readonly code = "BROWSER_NATIVE_MODULE";
  readonly modules: string[];

  constructor(modules: Iterable<string>) {
    const names = [...new Set(modules)].toSorted();
    super(`Native modules are not supported in a browser bundle: ${names.join(", ")}`);
    this.name = "BrowserNativeModuleError";
    this.modules = names;
  }
}

const extensions = [".tsx", ".ts", ".jsx", ".js", ".json"];

// Keep this list in sync with Node 24's module.builtinModules. The browser
// resolver cannot import node:module to discover it at runtime.
export const browserBuiltinModules = [
  "_http_agent",
  "_http_client",
  "_http_common",
  "_http_incoming",
  "_http_outgoing",
  "_http_server",
  "_stream_duplex",
  "_stream_passthrough",
  "_stream_readable",
  "_stream_transform",
  "_stream_wrap",
  "_stream_writable",
  "_tls_common",
  "_tls_wrap",
  "assert",
  "assert/strict",
  "async_hooks",
  "buffer",
  "child_process",
  "cluster",
  "console",
  "constants",
  "crypto",
  "dgram",
  "diagnostics_channel",
  "dns",
  "dns/promises",
  "domain",
  "events",
  "fs",
  "fs/promises",
  "http",
  "http2",
  "https",
  "inspector",
  "inspector/promises",
  "module",
  "net",
  "os",
  "path",
  "path/posix",
  "path/win32",
  "perf_hooks",
  "process",
  "punycode",
  "querystring",
  "readline",
  "readline/promises",
  "repl",
  "stream",
  "stream/consumers",
  "stream/promises",
  "stream/web",
  "string_decoder",
  "sys",
  "timers",
  "timers/promises",
  "tls",
  "trace_events",
  "tty",
  "url",
  "util",
  "util/types",
  "v8",
  "vm",
  "wasi",
  "worker_threads",
  "zlib",
  "node:sea",
  "node:sqlite",
  "node:test",
  "node:test/reporters",
] as const;
const builtin = new Set<string>(browserBuiltinModules);
const nativePackages = new Set([
  "better-sqlite3",
  "canvas",
  "fsevents",
  "keytar",
  "node-gyp-build",
  "sharp",
  "sqlite3",
]);

function clean(path: string): string {
  const parts: string[] = [];
  for (const part of path.replaceAll("\\", "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return `/${parts.join("/")}`;
}

function packageName(specifier: string): string {
  return specifier.startsWith("@")
    ? specifier.split("/").slice(0, 2).join("/")
    : specifier.split("/")[0]!;
}

function isBuiltin(specifier: string): boolean {
  return specifier.startsWith("node:") || builtin.has(specifier);
}

function loader(path: string): string {
  const extension = extensions.find((item) => path.endsWith(item));
  if (extension === ".tsx") return "tsx";
  if (extension === ".ts") return "ts";
  if (extension === ".jsx") return "jsx";
  if (extension === ".json") return "json";
  return "js";
}

function asText(value: BrowserBundleFile): string | Uint8Array {
  return value;
}

function text(value: BrowserBundleFile): string {
  return typeof value === "string" ? value : new TextDecoder().decode(value);
}

function findFile(map: Map<string, BrowserBundleFile>, path: string): string | undefined {
  const base = clean(path);
  const candidates = [
    base,
    ...extensions.map((extension) => `${base}${extension}`),
    `${base}/index.ts`,
    `${base}/index.tsx`,
    `${base}/index.js`,
    `${base}/index.json`,
  ];
  for (const candidate of candidates) {
    if (map.has(candidate)) return candidate;
    const withoutLeading = candidate.slice(1);
    if (map.has(withoutLeading)) return withoutLeading;
  }
  return undefined;
}

function packageJson(
  map: Map<string, BrowserBundleFile>,
  root: string,
): Record<string, unknown> | undefined {
  const key = findFile(map, `${root}/package.json`);
  if (!key) return undefined;
  try {
    const parsed: unknown = JSON.parse(text(map.get(key)!));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function packageRoots(
  map: Map<string, BrowserBundleFile>,
  importer: string,
  name: string,
): string[] {
  const roots: string[] = [];
  let dir = clean(importer.slice(0, importer.lastIndexOf("/")) || "/");
  while (true) {
    const root = clean(`${dir}/node_modules/${name}`);
    if (
      map.has(root) ||
      map.has(root.slice(1)) ||
      [...map.keys()].some((key) => clean(key).startsWith(`${root}/`))
    ) {
      roots.push(root);
    }
    if (dir === "/") break;
    dir = clean(`${dir}/..`);
  }
  const direct = `/${name}`;
  if (
    map.has(direct) ||
    map.has(name) ||
    [...map.keys()].some((key) => clean(key).startsWith(`${direct}/`))
  )
    roots.push(direct);
  return [...new Set(roots)];
}

function exportTarget(value: unknown, subpath: string): string | false | undefined {
  if (typeof value === "string") return value;
  if (value === null || value === false) return false;
  if (Array.isArray(value)) {
    for (const item of value) {
      const resolved = exportTarget(item, subpath);
      if (resolved !== undefined && resolved !== false) return resolved;
    }
    return undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const subkeys = Object.keys(record).filter((key) => key.startsWith("."));
  if (subkeys.length) {
    const exact = record[subpath];
    if (exact !== undefined) return exportTarget(exact, subpath);
    const pattern = subkeys
      .filter((key) => key.endsWith("*") && subpath.startsWith(key.slice(0, -1)))
      .toSorted((a, b) => b.length - a.length)[0];
    if (pattern) {
      const resolved = exportTarget(record[pattern], subpath);
      return typeof resolved === "string"
        ? resolved.replaceAll("*", subpath.slice(pattern.length - 1))
        : resolved;
    }
    return undefined;
  }
  for (const condition of ["browser", "import", "module", "require", "default"]) {
    if (record[condition] !== undefined) {
      const resolved = exportTarget(record[condition], subpath);
      if (resolved !== undefined) return resolved;
    }
  }
  return undefined;
}

function packageCandidates(
  map: Map<string, BrowserBundleFile>,
  specifier: string,
  importer: string,
): string[] {
  const name = packageName(specifier);
  const subpath = specifier.slice(name.length).replace(/^\//, "");
  for (const root of packageRoots(map, importer, name)) {
    const metadata = packageJson(map, root);
    const requested = subpath ? `./${subpath}` : ".";
    if (metadata?.exports !== undefined) {
      const target = exportTarget(metadata.exports, requested);
      // Once the nearest package has an exports map, unexported subpaths are
      // blocked; Node does not fall through to a parent node_modules copy.
      if (target === false || target === undefined) return [];
      const candidate = findFile(map, clean(`${root}/${target}`));
      return candidate ? [candidate] : [];
    }
    const base = subpath ? clean(`${root}/${subpath}`) : undefined;
    if (base) {
      const candidate = findFile(map, base);
      if (candidate) return [candidate];
      continue;
    }
    const browser = metadata?.browser;
    if (typeof browser === "string") {
      const candidate = findFile(map, clean(`${root}/${browser}`));
      if (candidate) return [candidate];
    }
    const candidates: string[] = [];
    const main =
      typeof metadata?.module === "string"
        ? metadata.module
        : typeof metadata?.main === "string"
          ? metadata.main
          : "index";
    if (typeof browser === "object" && browser) {
      const mapped =
        (browser as Record<string, unknown>)[`./${main}`] ??
        (browser as Record<string, unknown>)["."];
      if (typeof mapped === "string") candidates.push(clean(`${root}/${mapped}`));
    }
    candidates.push(clean(`${root}/${main}`));
    if (typeof metadata?.main === "string" && typeof metadata?.module === "string")
      candidates.push(clean(`${root}/${metadata.main}`));
    candidates.push(clean(`${root}/index`));
    for (const candidate of candidates) {
      const found = findFile(map, candidate);
      if (found) return [found];
    }
  }
  return [];
}

/** Bundle an in-memory command and browser runtime with an injected esbuild. */
export async function bundleForBrowser(options: BrowserBundleOptions): Promise<BrowserBundle> {
  const files = new Map([...options.files, ...options.packages]);
  const command = findFile(files, options.command);
  const runtimeEntry = findFile(files, options.runtimeEntry);
  if (!command) throw new BrowserMissingFileError(options.command);
  if (!runtimeEntry) throw new BrowserMissingFileError(options.runtimeEntry);

  const missing = new Set<string>();
  const native = new Set<string>();
  const missingFiles = new Set<string>();
  const virtualEntry = "/__blast_browser_bundle_entry__.js";
  const plugin = {
    name: "blast-browser-memory",
    setup(build: {
      onResolve: (
        options: { filter: RegExp },
        callback: (args: { path: string; importer: string; kind: string }) => unknown,
      ) => void;
      onLoad: (options: { filter: RegExp }, callback: (args: { path: string }) => unknown) => void;
    }) {
      build.onResolve({ filter: /.*/ }, (args) => {
        const specifier = args.path;
        if (args.kind === "entry-point") {
          if (specifier === virtualEntry) return { path: virtualEntry };
          const entry = findFile(files, specifier);
          return entry ? { path: entry } : undefined;
        }
        if (isBuiltin(specifier)) return { path: specifier, external: true };
        if (specifier.endsWith(".node")) {
          native.add(specifier);
          return { errors: [{ text: `Native module ${specifier} is not supported` }] };
        }
        if (
          !specifier.startsWith(".") &&
          !specifier.startsWith("/") &&
          nativePackages.has(packageName(specifier))
        ) {
          native.add(packageName(specifier));
          return {
            errors: [{ text: `Native package ${packageName(specifier)} is not supported` }],
          };
        }
        if (specifier === "@blastlauncher/command") return { path: command };
        const relative = specifier.startsWith(".") || specifier.startsWith("/");
        const alias = options.aliases?.[specifier];
        const candidate = relative
          ? findFile(
              files,
              clean(`${args.importer.slice(0, args.importer.lastIndexOf("/"))}/${specifier}`),
            )
          : alias
            ? findFile(files, alias)
            : packageCandidates(files, specifier, args.importer)
                .map((path) => findFile(files, path))
                .find(Boolean);
        if (candidate) return { path: candidate.startsWith("/") ? candidate : `/${candidate}` };
        if (!relative) {
          missing.add(packageName(specifier));
          return { errors: [{ text: `Missing browser dependency ${packageName(specifier)}` }] };
        }
        missingFiles.add(specifier);
        return { errors: [{ text: `Missing browser file ${specifier}` }] };
      });
      build.onLoad({ filter: /.*/ }, (args) => {
        if (args.path === virtualEntry) {
          return {
            contents: `import * as __blastRuntime from ${JSON.stringify(runtimeEntry)};\nimport * as __blastCommand from ${JSON.stringify(command)};\nconst __blastCommandValue = __blastCommand.default ?? __blastCommand;\nif (typeof __blastRuntime.start === "function") __blastRuntime.start({ default: __blastCommandValue });\nexport * from ${JSON.stringify(command)};\nexport default __blastCommandValue;`,
            loader: "js",
            resolveDir: "/",
          };
        }
        const key = findFile(files, args.path);
        if (!key) return { errors: [{ text: `Missing browser file ${args.path}` }] };
        return {
          contents: asText(files.get(key)!),
          loader: loader(key),
          resolveDir: clean(key.slice(0, key.lastIndexOf("/"))),
        };
      });
    },
  };

  const result = await options.esbuild
    .build({
      absWorkingDir: "/",
      entryPoints: [virtualEntry],
      bundle: true,
      write: false,
      format: "cjs",
      platform: "browser",
      target: "es2020",
      // Raycast extensions use the automatic JSX runtime, as bundleCommand does;
      // esbuild's default classic transform needs React in scope.
      jsx: "automatic",
      plugins: [plugin],
      logLevel: "silent",
    })
    .catch((error: unknown) => {
      if (native.size) throw new BrowserNativeModuleError(native);
      if (missing.size) throw new BrowserMissingDependencyError(missing);
      if (missingFiles.size) throw new BrowserMissingFileError([...missingFiles].toSorted()[0]!);
      throw error;
    });
  if (native.size) throw new BrowserNativeModuleError(native);
  if (missing.size) throw new BrowserMissingDependencyError(missing);
  if (missingFiles.size) throw new BrowserMissingFileError([...missingFiles].toSorted()[0]!);
  const output = result.outputFiles?.[0];
  if (!output) throw new Error("esbuild returned no browser bundle");
  return {
    code: output.text,
    warnings: (result.warnings ?? []).map((warning) => warning.text),
    bytes: output.contents.byteLength,
  };
}
