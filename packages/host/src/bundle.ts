import type { CommandMode } from "@blastlauncher/protocol";
import { context, transform, type Plugin } from "esbuild";
import { execFileSync } from "node:child_process";
import {
  access,
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { builtinModules } from "node:module";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

import { checkExtensionDependencies } from "./install-dependencies.ts";
import {
  loadSharedDependencies,
  type SharedDependencies,
  type SharedDependencyLoader,
} from "./dependencies.ts";
import { loadTsconfigAliases } from "./tsconfig-paths.ts";

// Bundles run in Node even when Bun runs the host. Bun's built-in list also
// includes npm packages such as undici and ws, which must be bundled for Node.
const nodeBuiltins = new Set<string>(
  process.versions.bun
    ? JSON.parse(
        execFileSync("node", ["-p", "JSON.stringify(require('node:module').builtinModules)"], {
          encoding: "utf8",
        }),
      )
    : builtinModules,
);

function isNodeBuiltin(specifier: string): boolean {
  return (
    nodeBuiltins.has(specifier) ||
    (specifier.startsWith("node:") && nodeBuiltins.has(specifier.slice(5)))
  );
}

export class MissingDependencyError extends Error {
  readonly code = "MISSING_DEPENDENCY";
  readonly packages: string[];

  constructor(packages: Iterable<string>) {
    const names = [...new Set(packages)].toSorted();
    super(
      `Missing dependencies: ${names.join(", ")}. Run blast deps <extensionDir> to install declared dependencies, or install @blastlauncher/shared-deps for the shared fallback.`,
    );
    this.name = "MissingDependencyError";
    this.packages = names;
  }
}

export class BundleTimeoutError extends Error {
  readonly code = "BUNDLE_TIMEOUT";

  readonly extension: string;
  readonly command: string;
  readonly timeoutMs: number;

  constructor(extension: string, command: string, timeoutMs: number) {
    super(`Bundling ${extension}/${command} timed out after ${timeoutMs} ms`);
    this.name = "BundleTimeoutError";
    this.extension = extension;
    this.command = command;
    this.timeoutMs = timeoutMs;
  }
}

/** Stop awaiting host work when cancelled, without leaving an abort listener behind. */
async function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.race([work, Promise.reject(signal.reason)]);
  let abort: (() => void) | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        abort = () => reject(signal.reason);
        signal.addEventListener("abort", abort, { once: true });
      }),
    ]);
  } finally {
    if (abort) signal.removeEventListener("abort", abort);
  }
}

function dependencyPolicy(
  missing: Set<string>,
  shared: SharedDependencies | undefined,
  installed?: string,
  installedPackages = new Set<string>(),
  aliases?: Awaited<ReturnType<typeof loadTsconfigAliases>>,
): Plugin {
  const dependencyFiles = new Set<string>();
  return {
    name: "blast-dependencies",
    setup(builder) {
      builder.onResolve({ filter: /.*/ }, async (args) => {
        if (args.pluginData === "blast-resolving") return;
        const specifier = args.path;
        if (specifier === "@raycast/api" || /^react(?:\/|$)/.test(specifier))
          return { path: specifier, external: true };
        if (isNodeBuiltin(specifier)) return { path: specifier, external: true };
        const bare = !specifier.startsWith(".") && !isAbsolute(specifier);
        const inDependencyGraph = dependencyFiles.has(args.importer);
        // The extension's tsconfig `paths`/`baseUrl` win over packages, as
        // tsc resolves them: a specifier that maps into the extension is the
        // extension's own module, never a missing dependency. Imports from
        // dependency graphs keep package resolution.
        if (aliases && bare && !inDependencyGraph && args.kind !== "entry-point") {
          const alias = await aliases.resolve(specifier);
          if (alias) return { path: alias };
        }
        if (installed && bare && !inDependencyGraph && args.kind !== "entry-point") {
          const name = specifier.startsWith("@")
            ? specifier.split("/").slice(0, 2).join("/")
            : specifier.split("/")[0]!;
          // Do not let esbuild walk up into unrelated ancestor node_modules.
          const present = await access(join(installed, "node_modules", name)).then(
            () => true,
            () => false,
          );
          if (present) {
            const result = await builder.resolve(specifier, {
              resolveDir: installed,
              kind: args.kind,
              pluginData: "blast-resolving",
            });
            if (!result.errors.length && result.path) {
              if (!result.external) dependencyFiles.add(result.path);
              installedPackages.add(name);
              return result;
            }
          }
        }
        const provided =
          !inDependencyGraph && bare
            ? shared?.resolveShared(
                specifier,
                args.kind === "require-call" || args.kind === "require-resolve"
                  ? "require"
                  : "import",
              )
            : undefined;
        // Installed and shared dependency graphs get normal transitive resolution.
        if (provided || inDependencyGraph) {
          const result = await builder.resolve(provided ?? specifier, {
            resolveDir: args.resolveDir,
            kind: args.kind,
            pluginData: "blast-resolving",
          });
          // Let esbuild handle unresolved optional requires inside try/catch.
          // Returning plugin errors here would make those optional imports fatal.
          if (result.errors.length && inDependencyGraph) return;
          if (result.path && !result.external) dependencyFiles.add(result.path);
          return result;
        }
        if (args.kind === "entry-point" || specifier.startsWith(".") || isAbsolute(specifier))
          return;
        const name = specifier.startsWith("@")
          ? specifier.split("/").slice(0, 2).join("/")
          : specifier.split("/")[0]!;
        missing.add(name);
        return { errors: [{ text: `Blast does not provide dependency ${name}` }] };
      });
    },
  };
}

/**
 * Raycast bundles extensions as CommonJS, so extensions freely use
 * `__filename`, `__dirname` and `require`. Blast emits ESM, so the bundle
 * banner defines the globals instead: paths derive from `import.meta.url` and
 * `require` is `createRequire` restricted to Node built-ins and the
 * runtime-supplied externals (`@raycast/api`, `react`, `react/*`), which the
 * runtime's resolve hook maps for require() too: CommonJS packages such as
 * `@raycast/utils` 1.x require React. Anything else is a missing dependency
 * (docs/decisions/0002), not a silent resolution from the host filesystem.
 */
const CJS_GLOBALS_BANNER = `
import { createRequire as __blastCreateRequire, isBuiltin as __blastIsBuiltin } from "node:module";
import { dirname as __blastDirname } from "node:path";
import { fileURLToPath as __blastFileURLToPath } from "node:url";
const __filename = __blastFileURLToPath(import.meta.url);
const __dirname = __blastDirname(__blastFileURLToPath(import.meta.url));
const __blastNodeRequire = __blastCreateRequire(import.meta.url);
function require(specifier) {
  if (!__blastIsBuiltin(specifier) && specifier !== "@raycast/api" && !/^react(?:\\/|$)/.test(specifier)) {
    const error = new Error(
      'Cannot require "' + specifier + '": Blast only provides Node built-ins to require() (MISSING_DEPENDENCY)',
    );
    error.code = "MISSING_DEPENDENCY";
    throw error;
  }
  return __blastNodeRequire(specifier);
}
`.trim();

export type BundleOptions = {
  extensionDir: string;
  command: string;
  /** Bundling deadline in milliseconds; defaults to 60_000, 0 disables it. */
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Override optional-package loading, e.g. for an isolated embedder. */
  sharedDependencies?: SharedDependencyLoader;
  outDir?: string;
  dataDir?: string;
  /** `false` keeps resolution allowlist-only, as corpus reports need (decision 0008). */
  installedDependencies?: boolean;
};
/** One `commands[].arguments` entry from an extension manifest. */
export type CommandArgument = {
  name: string;
  type: string;
  /** A required argument must be supplied before the command starts. */
  required?: boolean;
  placeholder?: string;
};
export type BundledCommand = {
  /** Elapsed bundling time, including dependency resolution and assets. */
  bundleMs: number;
  modelProviderDir?: string;
  entry: string;
  extensionName: string;
  commandName: string;
  /** The manifest's `owner`, else `author`; defaults to `""` for bare entries. */
  ownerOrAuthorName?: string;
  mode: CommandMode;
  /** The manifest's argument declarations, in declaration order. */
  arguments: CommandArgument[];
  /**
   * The declared default of every manifest preference (extension-wide, then
   * the command's own overriding it). A caller's explicit values win over
   * these when the session starts.
   */
  preferenceDefaults?: Record<string, string | number | boolean>;
  /** `<outDir>/assets`, resolving to the extension's real assets when it has any. */
  assetsPath?: string;
  /** Shared packages whose supplied major disagrees with the manifest. */
  dependencyWarnings?: string[];
};

/** The preference types Raycast's manifest schema defines. */
const PREFERENCE_TYPES = [
  "appPicker",
  "checkbox",
  "dropdown",
  "password",
  "textfield",
  "file",
  "directory",
];

export type Preference = {
  name: string;
  type: string;
  title: string;
  description?: string;
  required: boolean;
  data: { title: string; value: string }[];
  default?: string | number | boolean;
};

/** Shared manifest parsing for bundling defaults and client preference forms. */
export function parsePreferences(value: unknown, at = "Preferences"): Preference[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${at} must be an array`);
  return value.map((item, index) => {
    if (typeof item !== "object" || item === null || Array.isArray(item))
      throw new Error(`${at} entry ${index + 1} must be an object`);
    const { name, type, default: fallback, description } = item;
    if (typeof name !== "string" || !name) throw new Error(`${at} entry ${index + 1} needs a name`);
    if (typeof type !== "string" || !PREFERENCE_TYPES.includes(type))
      throw new Error(
        `Preference ${JSON.stringify(name)} has an unknown type ${JSON.stringify(type)}`,
      );
    if (
      fallback !== undefined &&
      typeof fallback !== "string" &&
      typeof fallback !== "boolean" &&
      !(typeof fallback === "number" && Number.isFinite(fallback))
    )
      throw new Error(`Preference ${JSON.stringify(name)} needs a scalar "default"`);
    if (description !== undefined && typeof description !== "string")
      throw new Error(`Preference ${JSON.stringify(name)} needs a string "description"`);
    return {
      name,
      type,
      title: (type === "checkbox" ? item.label : item.title) || name,
      required: item.required === true,
      data: Array.isArray(item.data)
        ? item.data.filter(
            (option: { value?: unknown; title?: unknown }) =>
              typeof option.value === "string" && typeof option.title === "string",
          )
        : [],
      ...(typeof description === "string" ? { description } : {}),
      ...(fallback === undefined ? {} : { default: fallback }),
    };
  });
}

function parsePreferenceDefaults(
  value: unknown,
  at: string,
): Record<string, string | number | boolean> {
  return Object.fromEntries(
    parsePreferences(value, at)
      .filter((p) => p.default !== undefined)
      .map((p) => [p.name, p.default!]),
  );
}

/** The argument types Raycast's manifest schema defines. */
const ARGUMENT_TYPES = ["text", "password", "dropdown"];

/**
 * Reads `commands[].arguments`. Unknown per-argument fields (`data` on a
 * dropdown) are ignored: Raycast's manifest is the extension author's, and new
 * optional fields must not make an existing extension unloadable.
 */
function parseCommandArguments(value: unknown): CommandArgument[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("Command arguments must be an array");
  const names = new Set<string>();
  return value.map((item, index) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new Error(`Argument ${index + 1} must be an object`);
    }
    const declared = item as Record<string, unknown>;
    const name = declared["name"];
    if (typeof name !== "string" || name === "")
      throw new Error(`Argument ${index + 1} needs a name`);
    if (names.has(name)) throw new Error(`Duplicate argument name ${JSON.stringify(name)}`);
    names.add(name);
    const type = declared["type"];
    if (typeof type !== "string" || !ARGUMENT_TYPES.includes(type)) {
      throw new Error(
        `Argument ${JSON.stringify(name)} has an unknown type ${JSON.stringify(type)}`,
      );
    }
    const argument: CommandArgument = { name, type };
    const required = declared["required"];
    if (required !== undefined) {
      if (typeof required !== "boolean")
        throw new Error(`Argument ${JSON.stringify(name)} needs a boolean "required"`);
      argument.required = required;
    }
    const placeholder = declared["placeholder"];
    if (placeholder !== undefined) {
      if (typeof placeholder !== "string")
        throw new Error(`Argument ${JSON.stringify(name)} needs a string "placeholder"`);
      argument.placeholder = placeholder;
    }
    return argument;
  });
}

/** Cap for the copy fallback, so a large assets directory cannot fill the disk. */
const MAX_COPIED_ASSETS_BYTES = 64 * 1024 * 1024;

async function totalAssetsSize(dir: string): Promise<number> {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    // A link inside assets could point anywhere; the copy fallback reads files only.
    if (entry.isSymbolicLink()) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) total += await totalAssetsSize(path);
    else if (entry.isFile()) total += (await stat(path)).size;
  }
  return total;
}

async function copyAssets(source: string, target: string): Promise<void> {
  const size = await totalAssetsSize(source);
  if (size > MAX_COPIED_ASSETS_BYTES) {
    throw new Error(
      `Assets are ${size} bytes; the copy fallback caps at ${MAX_COPIED_ASSETS_BYTES}`,
    );
  }
  await mkdir(target, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const from = join(source, entry.name);
    const to = join(target, entry.name);
    if (entry.isDirectory()) await copyAssets(from, to);
    else if (entry.isFile()) {
      await copyFile(from, to);
      // Read-only: the copy stands in for assets the extension owns, not
      // something the bundled command may rewrite.
      await chmod(to, 0o444);
    }
  }
}

/**
 * The build directory mirrors Raycast's layout: `assets/` sits next to the
 * bundle, so `environment.assetsPath` and `path.join(__dirname, "assets", …)`
 * both resolve to the extension's real assets. The link is a symlink; where
 * the platform refuses symlinks, a read-only copy with a size cap is used.
 * Nothing is ever written to the extension directory.
 */
export async function linkAssets(
  outDir: string,
  extensionDir: string,
  link: typeof symlink = symlink,
): Promise<void> {
  const assets = join(extensionDir, "assets");
  const source = await stat(assets).catch(() => undefined);
  if (!source?.isDirectory()) return;
  const target = join(outDir, "assets");
  // `rm` removes a symlink itself, never its target, so re-bundling into a
  // used output directory cannot touch the extension.
  await rm(target, { recursive: true, force: true });
  try {
    await link(assets, target, "dir");
  } catch {
    await copyAssets(assets, target);
  }
}

/** The caller owns the output directory and may remove it once the session exits. */
async function bundleEntry(
  options: BundleOptions & { modelProvider?: boolean },
): Promise<BundledCommand> {
  const started = performance.now();
  const timeoutMs = options.timeoutMs ?? 60_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 2_147_483_647)
    throw new RangeError("timeoutMs must be an integer between 0 and 2147483647");
  const controller = new AbortController();
  const abort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) abort();
  let extension = options.extensionDir;
  const timer =
    timeoutMs === 0
      ? undefined
      : setTimeout(() => {
          controller.abort(new BundleTimeoutError(extension, options.command, timeoutMs));
        }, timeoutMs);
  try {
    const bundled = await bundleEntryWithSignal(options, controller.signal, (name) => {
      extension = name;
    });
    return { ...bundled, bundleMs: performance.now() - started };
  } catch (error) {
    if (error instanceof BundleTimeoutError)
      throw new BundleTimeoutError(extension, options.command, timeoutMs);
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
}

async function bundleEntryWithSignal(
  options: BundleOptions & { modelProvider?: boolean },
  signal: AbortSignal,
  setExtension: (name: string) => void,
): Promise<Omit<BundledCommand, "bundleMs">> {
  signal.throwIfAborted();
  const extensionDir = resolve(options.extensionDir);
  const manifest = JSON.parse(await readFile(join(extensionDir, "package.json"), "utf8"));
  const command = options.modelProvider
    ? { name: manifest.ai?.modelProvider, mode: "model-provider" }
    : manifest.commands?.find((item: { name: string }) => item.name === options.command);
  if (typeof manifest.name !== "string" || !command) throw new Error("Unknown extension command");
  setExtension(manifest.name);
  signal.throwIfAborted();
  const entryName = options.modelProvider ? command.name : options.command;
  if (typeof entryName !== "string" || !/^[\w-]+$/.test(entryName))
    throw new Error("Invalid command name");
  if (!options.modelProvider && !["view", "no-view", "menu-bar"].includes(command.mode))
    throw new Error("Invalid command mode");
  const commandArguments = parseCommandArguments(command.arguments);
  let source: string | undefined;
  for (const suffix of ["tsx", "ts", "jsx", "js"]) {
    const candidate = join(extensionDir, "src", `${entryName}.${suffix}`);
    try {
      await access(candidate);
      source = candidate;
      break;
    } catch {
      // Try the next supported source extension.
    }
  }
  if (!source)
    throw new Error(
      `Missing source for ${entryName}: no src/${entryName}.{tsx,ts,jsx,js} in ${extensionDir}` +
        " (a sparse checkout that only has package.json? fetch the whole extension directory)",
    );
  const shared = await abortable(loadSharedDependencies(options.sharedDependencies), signal);
  const aliases = await loadTsconfigAliases(extensionDir);
  for (const warning of aliases?.warnings ?? []) console.warn(warning);
  const install =
    options.installedDependencies === false ? undefined : await checkExtensionDependencies(options);
  const base = join(tmpdir(), "blast", "builds");
  if (!options.outDir) await mkdir(base, { recursive: true });
  const outDir = options.outDir ? resolve(options.outDir) : await mkdtemp(join(base, "command-"));
  const entry = join(outDir, `${entryName}.mjs`);
  const missing = new Set<string>();
  const installedPackages = new Set<string>();
  try {
    signal.throwIfAborted();
    const builder = await context({
      absWorkingDir: extensionDir,
      entryPoints: [source],
      outfile: entry,
      bundle: true,
      metafile: true,
      write: false,
      format: "esm",
      platform: "node",
      target: "node24",
      jsx: "automatic",
      banner: { js: CJS_GLOBALS_BANNER },
      plugins: [
        dependencyPolicy(
          missing,
          shared,
          install && !install.needed ? install.directory : undefined,
          installedPackages,
          aliases,
        ),
      ],
      logLevel: "silent",
    });
    let bundled;
    try {
      signal.throwIfAborted();
      bundled = await abortable(builder.rebuild(), signal);
    } finally {
      // cancel stops esbuild's graph walk; dispose releases the service context.
      if (signal.aborted) await builder.cancel();
      await builder.dispose();
    }
    signal.throwIfAborted();
    // Optional imports in provided graphs can escape esbuild's resolver.
    // Optional require calls use the banner's MISSING_DEPENDENCY guard instead.
    for (const output of Object.values(bundled.metafile.outputs)) {
      for (const imported of output.imports) {
        if (
          imported.external &&
          imported.kind !== "require-call" &&
          imported.path !== "@raycast/api" &&
          !/^react(?:\/|$)/.test(imported.path) &&
          !isNodeBuiltin(imported.path)
        ) {
          missing.add(
            imported.path.startsWith("@")
              ? imported.path.split("/").slice(0, 2).join("/")
              : imported.path.split("/")[0]!,
          );
        }
      }
    }
    if (missing.size) throw new MissingDependencyError(missing);
    // After tree shaking utils' monolithic entry, remove unused named imports
    // so Node does not try to link shim symbols the command never uses.
    const output = await transform(bundled.outputFiles[0]!.text, {
      format: "esm",
      target: "node24",
      minifySyntax: true,
    });
    signal.throwIfAborted();
    await mkdir(outDir, { recursive: true });
    await writeFile(entry, output.code);
    await linkAssets(outDir, extensionDir);
    signal.throwIfAborted();
  } catch (error) {
    if (!options.outDir) await rm(outDir, { recursive: true, force: true });
    signal.throwIfAborted();
    if (missing.size) throw new MissingDependencyError(missing);
    throw error;
  }
  return {
    entry,
    dependencyWarnings:
      shared?.dependencyWarnings(
        Object.fromEntries(
          Object.entries(manifest.dependencies ?? {}).filter(
            ([name]) => !installedPackages.has(name),
          ),
        ),
      ) ?? [],
    extensionName: manifest.name,
    commandName: command.name,
    // Raycast reports the owner when a manifest has one, else the author.
    ownerOrAuthorName:
      typeof manifest.owner === "string"
        ? manifest.owner
        : typeof manifest.author === "string"
          ? manifest.author
          : "",
    mode: command.mode,
    arguments: commandArguments,
    // Command preferences shadow extension preferences with the same name.
    preferenceDefaults: {
      ...parsePreferenceDefaults(manifest.preferences, "Extension preferences"),
      ...parsePreferenceDefaults(command.preferences, `Command ${command.name} preferences`),
    },
    assetsPath: join(outDir, "assets"),
    ...(manifest.ai?.modelProvider && !options.modelProvider
      ? { modelProviderDir: extensionDir }
      : {}),
  };
}

export function bundleModelProvider(
  options: Omit<BundleOptions, "command">,
): Promise<BundledCommand> {
  return bundleEntry({ ...options, command: "model-provider", modelProvider: true });
}

export function bundleCommand(options: BundleOptions): Promise<BundledCommand> {
  return bundleEntry(options);
}
