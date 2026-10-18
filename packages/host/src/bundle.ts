import type { CommandMode } from "@blastlauncher/protocol";
import { build, transform, type Plugin } from "esbuild";
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
import { isBuiltin } from "node:module";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export class MissingDependencyError extends Error {
  readonly code = "MISSING_DEPENDENCY";
  readonly packages: string[];

  constructor(packages: Iterable<string>) {
    const names = [...new Set(packages)].toSorted();
    super(`Missing dependencies: ${names.join(", ")}`);
    this.name = "MissingDependencyError";
    this.packages = names;
  }
}

function dependencyPolicy(missing: Set<string>): Plugin {
  const providedFiles = new Set<string>();
  return {
    name: "blast-dependencies",
    setup(builder) {
      builder.onResolve({ filter: /.*/ }, async (args) => {
        if (args.pluginData === "blast-resolving") return;
        const specifier = args.path;
        if (specifier === "@raycast/api" || /^react(?:\/|$)/.test(specifier))
          return { path: specifier, external: true };
        if (isBuiltin(specifier)) return { path: specifier, external: true };
        const provided = specifier === "@raycast/utils" || specifier.startsWith("@raycast/utils/");
        // Only Blast's supplied dependency graph gets normal package resolution.
        if (provided || providedFiles.has(args.importer)) {
          const result = await builder.resolve(specifier, {
            resolveDir: provided ? dirname(fileURLToPath(import.meta.url)) : args.resolveDir,
            kind: args.kind,
            pluginData: "blast-resolving",
          });
          if (result.path && !result.external) providedFiles.add(result.path);
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
 * `require` is `createRequire` restricted to Node built-ins, matching the
 * dependency policy in docs/decisions/0002 — anything else is a missing
 * dependency, not a silent module resolution from the host filesystem.
 */
const CJS_GLOBALS_BANNER = `
import { createRequire as __blastCreateRequire, isBuiltin as __blastIsBuiltin } from "node:module";
import { dirname as __blastDirname } from "node:path";
import { fileURLToPath as __blastFileURLToPath } from "node:url";
const __filename = __blastFileURLToPath(import.meta.url);
const __dirname = __blastDirname(__blastFileURLToPath(import.meta.url));
const __blastNodeRequire = __blastCreateRequire(import.meta.url);
function require(specifier) {
  if (!__blastIsBuiltin(specifier)) {
    const error = new Error(
      'Cannot require "' + specifier + '": Blast only provides Node built-ins to require() (MISSING_DEPENDENCY)',
    );
    error.code = "MISSING_DEPENDENCY";
    throw error;
  }
  return __blastNodeRequire(specifier);
}
`.trim();

export type BundleOptions = { extensionDir: string; command: string; outDir?: string };
/** One `commands[].arguments` entry from an extension manifest. */
export type CommandArgument = {
  name: string;
  type: string;
  /** A required argument must be supplied before the command starts. */
  required?: boolean;
  placeholder?: string;
};
export type BundledCommand = {
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

/**
 * Reads a manifest `preferences` array down to the declared defaults.
 * Presentation fields (`title`, `required`, `data`, …) are ignored: only the
 * value `getPreferenceValues()` falls back to matters here.
 */
function parsePreferenceDefaults(
  value: unknown,
  at: string,
): Record<string, string | number | boolean> {
  if (value === undefined) return {};
  if (!Array.isArray(value)) throw new Error(`${at} must be an array`);
  const defaults: Record<string, string | number | boolean> = {};
  for (const [index, item] of value.entries()) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new Error(`${at} entry ${index + 1} must be an object`);
    }
    const declared = item as Record<string, unknown>;
    const name = declared["name"];
    if (typeof name !== "string" || name === "")
      throw new Error(`${at} entry ${index + 1} needs a name`);
    const type = declared["type"];
    if (typeof type !== "string" || !PREFERENCE_TYPES.includes(type)) {
      throw new Error(
        `Preference ${JSON.stringify(name)} has an unknown type ${JSON.stringify(type)}`,
      );
    }
    const fallback = declared["default"];
    if (fallback === undefined) continue;
    if (
      typeof fallback !== "string" &&
      typeof fallback !== "boolean" &&
      !(typeof fallback === "number" && Number.isFinite(fallback))
    ) {
      throw new Error(`Preference ${JSON.stringify(name)} needs a scalar "default"`);
    }
    defaults[name] = fallback;
  }
  return defaults;
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
export async function bundleCommand(options: BundleOptions): Promise<BundledCommand> {
  const extensionDir = resolve(options.extensionDir);
  const manifest = JSON.parse(await readFile(join(extensionDir, "package.json"), "utf8"));
  const command = manifest.commands?.find(
    (item: { name: string }) => item.name === options.command,
  );
  if (typeof manifest.name !== "string" || !command) throw new Error("Unknown extension command");
  if (!/^[\w-]+$/.test(options.command)) throw new Error("Invalid command name");
  if (!["view", "no-view", "menu-bar"].includes(command.mode))
    throw new Error("Invalid command mode");
  const commandArguments = parseCommandArguments(command.arguments);
  let source: string | undefined;
  for (const suffix of ["tsx", "ts", "jsx", "js"]) {
    const candidate = join(extensionDir, "src", `${options.command}.${suffix}`);
    try {
      await access(candidate);
      source = candidate;
      break;
    } catch {
      // Try the next supported source extension.
    }
  }
  if (!source) throw new Error(`Missing source for ${options.command}`);
  const base = join(tmpdir(), "blast", "builds");
  if (!options.outDir) await mkdir(base, { recursive: true });
  const outDir = options.outDir ? resolve(options.outDir) : await mkdtemp(join(base, "command-"));
  const entry = join(outDir, `${options.command}.mjs`);
  const missing = new Set<string>();
  try {
    const bundled = await build({
      absWorkingDir: extensionDir,
      entryPoints: [source],
      outfile: entry,
      bundle: true,
      write: false,
      format: "esm",
      platform: "node",
      target: "node24",
      jsx: "automatic",
      banner: { js: CJS_GLOBALS_BANNER },
      plugins: [dependencyPolicy(missing)],
      logLevel: "silent",
    });
    // After tree shaking utils' monolithic entry, remove unused named imports
    // so Node does not try to link shim symbols the command never uses.
    const output = await transform(bundled.outputFiles[0]!.text, {
      format: "esm",
      target: "node24",
      minifySyntax: true,
    });
    await mkdir(outDir, { recursive: true });
    await writeFile(entry, output.code);
  } catch (error) {
    if (!options.outDir) await rm(outDir, { recursive: true, force: true });
    if (missing.size) throw new MissingDependencyError(missing);
    throw error;
  }
  await linkAssets(outDir, extensionDir);
  return {
    entry,
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
  };
}
