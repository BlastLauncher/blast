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
const builtin = new Set([
  "assert",
  "buffer",
  "child_process",
  "crypto",
  "events",
  "http",
  "https",
  "module",
  "os",
  "path",
  "process",
  "stream",
  "string_decoder",
  "timers",
  "url",
  "util",
  "worker_threads",
  "zlib",
]);
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

function packageCandidates(map: Map<string, BrowserBundleFile>, specifier: string): string[] {
  const name = packageName(specifier);
  const subpath = specifier.slice(name.length).replace(/^\//, "");
  const roots = [...map.keys()]
    .map(clean)
    .filter(
      (path) =>
        path.includes(`/node_modules/${name}/`) ||
        path.endsWith(`/node_modules/${name}`) ||
        path === `/${name}` ||
        path.startsWith(`/${name}/`),
    );
  const root = roots
    .map((path) => {
      const marker = path.indexOf(`/node_modules/${name}`);
      return marker >= 0 ? path.slice(0, marker + `/node_modules/${name}`.length) : `/${name}`;
    })
    .toSorted((a, b) => a.length - b.length)[0];
  if (!root) return [];
  return [
    clean(`${root}/${subpath}`),
    clean(`${root}/${subpath}/index`),
    clean(`${root}/index`),
    ...extensions.map((extension) => clean(`${root}/${subpath}${extension}`)),
  ];
}

function suppliedRuntimeModule(map: Map<string, BrowserBundleFile>, specifier: string): string[] {
  const suffixes =
    specifier === "@raycast/api"
      ? ["/runtime/src/api/index.ts", "/runtime/api/index.ts"]
      : specifier === "react"
        ? ["/node_modules/react/index.js", "/react/index.js", "/react/index.ts"]
        : specifier === "react/jsx-runtime"
          ? ["/node_modules/react/jsx-runtime.js", "/react/jsx-runtime.js"]
          : [];
  return [...map.keys()].filter((path) => suffixes.some((suffix) => clean(path).endsWith(suffix)));
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
        const candidate = relative
          ? findFile(files, clean(`${args.importer}/../${specifier}`))
          : [...suppliedRuntimeModule(files, specifier), ...packageCandidates(files, specifier)]
              .map((path) => findFile(files, path))
              .find(Boolean);
        if (candidate) return { path: candidate };
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
            contents: `import * as __blastRuntime from ${JSON.stringify(runtimeEntry)};\nimport * as __blastCommand from ${JSON.stringify(command)};\nvoid __blastRuntime;\nexport * from ${JSON.stringify(command)};\nexport default __blastCommand.default ?? __blastCommand;`,
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
