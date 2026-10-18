import { createHash } from "node:crypto";
import { rmSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import esbuild, { type Plugin } from "esbuild";

import { ExtensionEntrypointError, type ExtensionEntrypointLoader } from "./index.js";

const temporaryCacheDirectories = new Set<string>();
let temporaryCacheCleanupInstalled = false;

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
  /**
   * Controls where third-party packages may come from. The runtime never
   * invokes a package manager: `local` uses the extension's installed graph,
   * while `vendored` adds explicit, launcher-provisioned package roots.
   */
  readonly dependencyPolicy?: ExtensionDependencyPolicy;
  /**
   * Prefix for default temporary cache directories. It must be a single
   * relative path segment so callers can clean up their own run-scoped files.
   */
  readonly temporaryDirectoryPrefix?: string;
}

export interface ExtensionDependencyPolicy {
  readonly strategy?: "local" | "vendored";
  readonly vendorRoots?: readonly string[];
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
  const ownsCacheDirectory = options.cacheDirectory === undefined;
  const temporaryDirectoryPrefix = normalizeTemporaryDirectoryPrefix(options.temporaryDirectoryPrefix);
  const readyCacheDirectory = !ownsCacheDirectory
    ? prepareCacheDirectory(options.cacheDirectory)
    : prepareDefaultCacheDirectory(temporaryDirectoryPrefix);
  const alias: Record<string, string> = { ...options.alias };
  const reactModulePath = options.reactModulePath;
  const reactPlugin = reactModulePath === undefined ? undefined : createReactExternalPlugin(reactModulePath);
  const dependencyPolicy = normalizeDependencyPolicy(options.dependencyPolicy);

  return async (entrypoint, signal) => {
    signal?.throwIfAborted();
    const cacheDirectory = await readyCacheDirectory;
    await mkdir(cacheDirectory, { recursive: true });
    const hash = createHash("sha256")
      .update(
        JSON.stringify({
          alias,
          dependencyPolicy,
          entrypoint,
          reactModulePath,
        }),
      )
      .digest("hex")
      .slice(0, 16);
    const bundlePath = path.join(cacheDirectory, `${hash}.cjs`);

    try {
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
          ...(dependencyPolicy.vendorRoots.length === 0 ? {} : { nodePaths: [...dependencyPolicy.vendorRoots] }),
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
    } finally {
      if (ownsCacheDirectory) {
        try {
          await rm(cacheDirectory, { recursive: true, force: true });
          temporaryCacheDirectories.delete(cacheDirectory);
        } catch {
          // The exit handler retries cleanup if the directory is still present.
        }
      }
    }
  };
}

function normalizeDependencyPolicy(policy: ExtensionDependencyPolicy | undefined): {
  readonly strategy: "local" | "vendored";
  readonly vendorRoots: readonly string[];
} {
  if (policy === undefined) {
    return { strategy: "local", vendorRoots: [] };
  }
  const strategy = policy.strategy ?? "local";
  const vendorRoots = policy.vendorRoots ?? [];
  if (strategy !== "local" && strategy !== "vendored") {
    throw new ExtensionEntrypointError(
      "dependency_policy_invalid",
      `Unknown extension dependency policy strategy: ${String(strategy)}`,
    );
  }
  if (strategy === "local" && vendorRoots.length > 0) {
    throw new ExtensionEntrypointError(
      "dependency_policy_invalid",
      "Local extension dependency policy cannot declare vendor roots",
    );
  }
  for (const root of vendorRoots) {
    if (typeof root !== "string" || !path.isAbsolute(root)) {
      throw new ExtensionEntrypointError(
        "dependency_policy_invalid",
        "Vendored dependency roots must be absolute paths",
        { root },
      );
    }
  }
  return { strategy, vendorRoots: vendorRoots.map((root) => path.resolve(root)) };
}

async function prepareCacheDirectory(directory: string): Promise<string> {
  await mkdir(directory, { recursive: true });
  return directory;
}

async function prepareDefaultCacheDirectory(prefix: string): Promise<string> {
  installTemporaryCacheCleanup();
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix));
  temporaryCacheDirectories.add(directory);
  return directory;
}

function normalizeTemporaryDirectoryPrefix(prefix: string | undefined): string {
  const normalized = prefix ?? "blast-extension-bundles-";
  if (
    normalized.length === 0 ||
    normalized === "." ||
    normalized === ".." ||
    normalized.includes("/") ||
    normalized.includes("\\")
  ) {
    throw new ExtensionEntrypointError(
      "temporary_directory_prefix_invalid",
      "Temporary bundle directory prefix must be a relative path segment",
      { prefix },
    );
  }
  return normalized;
}

function installTemporaryCacheCleanup(): void {
  if (temporaryCacheCleanupInstalled) {
    return;
  }
  temporaryCacheCleanupInstalled = true;
  process.once("exit", cleanupTemporaryCacheDirectories);
  process.once("SIGTERM", () => exitAfterTemporaryCacheCleanup(143));
  process.once("SIGINT", () => exitAfterTemporaryCacheCleanup(130));
}

function cleanupTemporaryCacheDirectories(): void {
  for (const directory of temporaryCacheDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }
  temporaryCacheDirectories.clear();
}

function exitAfterTemporaryCacheCleanup(exitCode: number): never {
  cleanupTemporaryCacheDirectories();
  process.exit(exitCode);
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
