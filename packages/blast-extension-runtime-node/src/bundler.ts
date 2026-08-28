import { createHash } from "node:crypto";
import { mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import esbuild, { type Plugin } from "esbuild";

import { ExtensionEntrypointError, type ExtensionEntrypointLoader } from "./index.js";

export interface BundlingEntrypointLoaderOptions {
  /**
   * Directory for bundled entrypoints. Defaults to a fresh temporary
   * directory per loader instance.
   */
  readonly cacheDirectory?: string;
  /**
   * Import specifier to path mapping applied while bundling, e.g.
   * `@raycast/api` to the compatibility adapter. Bare importers that the
   * extension environment resolves (such as `react`) need no mapping.
   */
  readonly alias?: Readonly<Record<string, string>>;
  /**
   * Path to the launcher's React package directory. Raycast extensions do not
   * declare `react`, so when this is set the bundler aliases `react` and its
   * JSX runtime entries to the launcher's copy.
   */
  readonly reactModulePath?: string;
}

/**
 * Entrypoint loader that bundles the extension entrypoint with esbuild before
 * importing it. This is how literal `@raycast/api` imports and TypeScript/JSX
 * sources work: the bundler resolves them against the launcher's mapping, and
 * only Node.js builtins stay external.
 */
export function createBundlingEntrypointLoader(
  options: BundlingEntrypointLoaderOptions = {},
): ExtensionEntrypointLoader {
  const readyCacheDirectory =
    options.cacheDirectory !== undefined
      ? prepareCacheDirectory(options.cacheDirectory)
      : prepareDefaultCacheDirectory();
  const alias: Record<string, string> = { ...options.alias };
  const reactModulePath = options.reactModulePath;
  const reactPlugin = reactModulePath === undefined ? undefined : createReactExternalPlugin(reactModulePath);

  return async (entrypoint, signal) => {
    signal?.throwIfAborted();
    const cacheDirectory = await readyCacheDirectory;
    const hash = createHash("sha256").update(entrypoint).digest("hex").slice(0, 16);
    const bundlePath = path.join(cacheDirectory, `${hash}.cjs`);

    try {
      await esbuild.build({
        entryPoints: [entrypoint],
        bundle: true,
        platform: "node",
        format: "cjs",
        target: "node20",
        jsx: "automatic",
        outfile: bundlePath,
        alias: { ...alias },
        plugins: reactPlugin === undefined ? [] : [reactPlugin],
        logLevel: "silent",
        sourcemap: false,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new ExtensionEntrypointError(
        "entrypoint_load_failed",
        `Extension entrypoint could not be bundled: ${reason}`,
        {
          entrypoint,
          reason,
        },
      );
    }
    signal?.throwIfAborted();

    const namespace = (await import(pathToFileURL(bundlePath).href)) as Record<string, unknown>;
    // CommonJS bundles expose their exports as the default export; flatten so
    // `command` and `default` remain reachable at the top level.
    const bundledExports = namespace.default;
    if (
      typeof bundledExports === "object" &&
      bundledExports !== null &&
      ("command" in bundledExports || "default" in bundledExports)
    ) {
      const record = bundledExports as Record<string, unknown>;
      return {
        ...record,
        ...namespace,
        default: record.default ?? namespace.default,
      } as Record<string, unknown>;
    }
    return namespace;
  };
}

async function prepareCacheDirectory(directory: string): Promise<string> {
  await mkdir(directory, { recursive: true });
  return directory;
}

async function prepareDefaultCacheDirectory(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "blast-extension-bundles-"));
}

/**
 * Externalizes React imports to absolute file URLs of the launcher's React
 * copy. React must stay a single instance per runtime: the renderer outside
 * the bundle and the components inside it have to share one dispatcher, so
 * React cannot be inlined into extension bundles.
 */
function createReactExternalPlugin(reactModulePath: string): Plugin {
  const externalPaths: Readonly<Record<string, string>> = {
    react: path.join(reactModulePath, "index.js"),
    "react/jsx-runtime": path.join(reactModulePath, "jsx-runtime.js"),
    "react/jsx-dev-runtime": path.join(reactModulePath, "jsx-dev-runtime.js"),
  };
  return {
    name: "blast-react-external",
    setup(build) {
      build.onResolve({ filter: /^react(\/jsx(-dev)?-runtime)?$/ }, (args) => {
        const externalPath = externalPaths[args.path];
        return externalPath === undefined ? undefined : { path: externalPath, external: true };
      });
    },
  };
}
