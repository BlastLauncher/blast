import type { CommandMode } from "@blastlauncher/protocol";
import { build, transform, type Plugin } from "esbuild";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
export type BundledCommand = {
  entry: string;
  extensionName: string;
  commandName: string;
  mode: CommandMode;
};

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
  return { entry, extensionName: manifest.name, commandName: command.name, mode: command.mode };
}
