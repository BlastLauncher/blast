import { createHash } from "node:crypto";
import { mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import esbuild from "esbuild";

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
  const alias = options.alias ?? {};

  return async (entrypoint, signal) => {
    signal?.throwIfAborted();
    const cacheDirectory = await readyCacheDirectory;
    const hash = createHash("sha256").update(entrypoint).digest("hex").slice(0, 16);
    const bundlePath = path.join(cacheDirectory, `${hash}.mjs`);

    try {
      await esbuild.build({
        entryPoints: [entrypoint],
        bundle: true,
        platform: "node",
        format: "esm",
        target: "node20",
        jsx: "automatic",
        outfile: bundlePath,
        alias: { ...alias },
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

    return (await import(pathToFileURL(bundlePath).href)) as Record<string, unknown>;
  };
}

async function prepareCacheDirectory(directory: string): Promise<string> {
  await mkdir(directory, { recursive: true });
  return directory;
}

async function prepareDefaultCacheDirectory(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "blast-extension-bundles-"));
}
