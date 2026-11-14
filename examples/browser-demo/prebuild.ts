import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import * as esbuild from "esbuild";
import { bundleForBrowser } from "../../packages/web/src/browser-bundle.ts";
import { installForBrowser, type BrowserFetch } from "../../packages/web/src/browser-install.ts";
import { aliases, sharedModules } from "../../packages/web/src/bundle-config.ts";
import {
  bundleKey,
  type BundleIndex,
  type CatalogManifest,
} from "../../packages/web/src/bundles.ts";
import { parsePreferences } from "../../packages/web/src/preference-fields.ts";
import { projectRoot, relativeFiles } from "./build.ts";
import { ensureCorpusCheckout } from "../../scripts/corpus/fetch.ts";
import type { Catalog } from "./root.ts";

const textFile = (path: string) =>
  /\.(?:cjs|css|html?|js|jsx|json|md|mjs|ts|tsx|txt|yaml|yml)$/i.test(path);

async function exists(path: string) {
  return stat(path).then(
    () => true,
    () => false,
  );
}

async function sharedSources(): Promise<Map<string, string | Uint8Array>> {
  const files = new Map<string, string | Uint8Array>();
  async function add(directory: string, prefix: string) {
    for (const path of await relativeFiles(directory)) {
      if (!textFile(path)) continue;
      files.set(`/${prefix}/${path}`, await readFile(join(directory, path), "utf8"));
    }
  }
  await add(join(projectRoot, "packages/runtime/src"), "packages/runtime/src");
  await add(join(projectRoot, "packages/protocol/src"), "packages/protocol/src");
  await add(join(projectRoot, "packages/client-core/src"), "packages/client-core/src");
  await add(join(projectRoot, "packages/web/sandbox"), "packages/web/sandbox");
  await add(join(projectRoot, "packages/runtime/node_modules/react"), "node_modules/react");
  await add(
    join(projectRoot, "packages/runtime/node_modules/react-reconciler"),
    "node_modules/react-reconciler",
  );
  await add(
    join(projectRoot, "node_modules/.bun/scheduler@0.27.0/node_modules/scheduler"),
    "node_modules/scheduler",
  );
  return files;
}

export function extensionFilesFromTree(
  entries: Array<{ path?: string; type?: string }>,
  extensionPath: string,
): string[] {
  const prefix = `${extensionPath.replace(/\/$/, "")}/`;
  return entries
    .filter((entry) => entry.type === "blob" && typeof entry.path === "string")
    .map((entry) => entry.path as string)
    .filter((path) => path.startsWith(prefix) && !path.split("/").includes("node_modules"))
    .map((path) => path.slice(prefix.length))
    .toSorted();
}

async function extensionFrom(directory: string): Promise<Map<string, string | Uint8Array>> {
  if (!(await exists(join(directory, "package.json"))))
    throw new Error(`Extension package.json was not found: ${directory}`);
  const files = new Map<string, string | Uint8Array>();
  for (const path of await relativeFiles(directory)) {
    if (path.split("/").includes("node_modules")) continue;
    const bytes = await readFile(join(directory, path));
    files.set(`/${path}`, textFile(path) ? bytes.toString("utf8") : new Uint8Array(bytes));
  }
  return files;
}

async function fetchExtension(
  checkout: string,
  extension: string,
): Promise<Map<string, string | Uint8Array>> {
  return extensionFrom(join(checkout, "extensions", extension));
}

function commandEntry(files: Map<string, string | Uint8Array>, name: string): string {
  for (const extension of ["tsx", "ts", "jsx", "js"])
    if (files.has(`/src/${name}.${extension}`)) return `/src/${name}.${extension}`;
  if (files.has("/src/index.tsx")) return "/src/index.tsx";
  throw new Error(`Command source not found for ${name}`);
}

export type PrebuildOptions = {
  /** Registry requests for dependency installs; tests inject an offline one. */
  fetch?: BrowserFetch;
  /** Extensions built from a repository directory instead of the corpus, by name. */
  local?: Record<string, string>;
};

export async function prebuildCatalog(
  catalog: Catalog,
  buildSha: string,
  output: string,
  fixtures = false,
  options: PrebuildOptions = {},
): Promise<{
  index: BundleIndex;
  built: number;
  failed: number;
  reasons: string[];
  bytes: number;
}> {
  const shared = await sharedSources();
  const local = options.local ?? {};
  const checkout = fixtures
    ? ""
    : ensureCorpusCheckout(
        projectRoot,
        catalog.extensions
          .map((extension) => extension.name)
          .filter((name) => !Object.hasOwn(local, name)),
        catalog.commit,
        { catalogOnly: true },
      );
  const index: BundleIndex = { buildSha, bundles: {} };
  const runtime = await bundleForBrowser({
    esbuild,
    files: shared,
    packages: new Map(),
    command: "/packages/web/sandbox/runtime-entry.ts",
    runtimeEntry: "/packages/web/sandbox/runtime-entry.ts",
    aliases,
    entryCode: `import * as react from "react";
import * as jsxRuntime from "react/jsx-runtime";
import * as jsxDevRuntime from "react/jsx-dev-runtime";
import * as api from "@raycast/api";
import * as reconciler from "react-reconciler";
import * as scheduler from "scheduler";
import * as protocol from "@blastlauncher/protocol";
import { start } from "/packages/web/sandbox/runtime-entry.ts";
globalThis.__blastModules = { react, "react/jsx-runtime": jsxRuntime, "react/jsx-dev-runtime": jsxDevRuntime, "@raycast/api": api, "react-reconciler": reconciler, scheduler, "@blastlauncher/protocol": protocol, start };`,
  });
  const runtimeBytes = Buffer.from(
    `${runtime.code}\nglobalThis.__blastRuntime = globalThis.__blastModules;\n`,
  );
  await mkdir(join(output, "bundles"), { recursive: true });
  await writeFile(join(output, "bundles", "runtime.js"), runtimeBytes);
  index.runtime = {
    path: "bundles/runtime.js",
    bytes: runtimeBytes.byteLength,
    sha256: createHash("sha256").update(runtimeBytes).digest("hex"),
  };
  let built = 0;
  const reasons: string[] = [];
  // Fixture builds stay offline and local: only extensions checked into the
  // repository are built, so the production catalog passed by `--fixtures`
  // still prebuilds just its fixture commands.
  const fixtureNames = fixtures
    ? new Set(await readdir(join(projectRoot, "fixtures/extensions")))
    : undefined;
  const extensions = catalog.extensions.filter(
    (extension) =>
      Object.hasOwn(local, extension.name) ||
      fixtureNames === undefined ||
      fixtureNames.has(extension.name),
  );
  let next = 0;
  async function buildOne(extension: Catalog["extensions"][number]) {
    let files: Map<string, string | Uint8Array>;
    try {
      const directory = local[extension.name];
      files = directory
        ? await extensionFrom(directory)
        : fixtures
          ? await extensionFrom(join(projectRoot, "fixtures/extensions", extension.name))
          : await fetchExtension(checkout, extension.name);
      const manifest = JSON.parse(String(files.get("/package.json"))) as Record<string, unknown>;
      const manifestName = typeof manifest.name === "string" ? manifest.name : extension.name;
      const manifestPreferences = parsePreferences(
        manifest.preferences,
        `${extension.name} preferences`,
      );
      const manifestCommands: Record<string, ReturnType<typeof parsePreferences>> = {};
      const manifestArguments: Record<string, Array<{ name: string; required: boolean }>> = {};
      const manifestModes: Record<
        string,
        import("../../packages/protocol/src/index.ts").CommandMode
      > = {};
      for (const declaration of (manifest.commands as Array<Record<string, unknown>> | undefined) ??
        []) {
        if (typeof declaration.name === "string") {
          manifestCommands[declaration.name] = parsePreferences(
            declaration.preferences,
            `${extension.name}/${declaration.name} preferences`,
          );
          const declaredArguments = Array.isArray(declaration.arguments)
            ? declaration.arguments
            : [];
          const argumentsForCommand = declaredArguments.flatMap((argument) => {
            if (!argument || typeof argument !== "object") return [];
            const entry = argument as Record<string, unknown>;
            return typeof entry.name === "string"
              ? [{ name: entry.name, required: entry.required === true }]
              : [];
          });
          if (argumentsForCommand.length) manifestArguments[declaration.name] = argumentsForCommand;
          const mode = declaration.mode;
          manifestModes[declaration.name] =
            mode === "no-view" || mode === "menu-bar" || mode === "model-provider" ? mode : "view";
        }
      }
      const bundleManifest: CatalogManifest = {
        name: manifestName,
        preferences: manifestPreferences,
        commands: manifestCommands,
        ...(Object.keys(manifestArguments).length ? { arguments: manifestArguments } : {}),
        modes: manifestModes,
      };
      const lockfile = files.get("/package-lock.json");
      const installed = await installForBrowser({
        fetch: options.fetch ?? ((input, init) => fetch(input, init)),
        manifest,
        ...(typeof lockfile === "string" ? { lockfile } : {}),
      });
      for (const command of extension.commands) {
        try {
          const commandPath = commandEntry(files, command.name);
          const all = new Map(shared);
          for (const [path, value] of files) all.set(path, value);
          const bundled = await bundleForBrowser({
            esbuild,
            files: all,
            packages: installed.packages,
            command: commandPath,
            runtimeEntry: "/packages/web/sandbox/runtime-entry.ts",
            aliases,
            sharedRuntime: true,
            sharedModules,
          });
          const bytes = Buffer.from(bundled.code);
          const relativePath = `bundles/${extension.name}/${command.name}.js`;
          await mkdir(join(output, "bundles", extension.name), { recursive: true });
          await writeFile(join(output, relativePath), bytes);
          const assetEntries: Record<string, { path: string; bytes: number; sha256: string }> = {};
          for (const [sourcePath, sourceValue] of files) {
            if (sourcePath.includes("/node_modules/")) continue;
            const assetPath = sourcePath.startsWith("/assets/")
              ? sourcePath.slice("/assets/".length)
              : sourcePath.startsWith("/src/")
                ? /\.(?:cjs|css|html?|js|jsx|mjs|ts|tsx)$/iu.test(sourcePath)
                  ? undefined
                  : sourcePath.slice("/src/".length)
                : sourcePath.replace(/^\//u, "");
            if (!assetPath) continue;
            const relativeAssetPath = `bundles/${extension.name}/files/${assetPath}`;
            const assetBytes = Buffer.from(sourceValue);
            await mkdir(dirname(join(output, relativeAssetPath)), { recursive: true });
            await writeFile(join(output, relativeAssetPath), assetBytes);
            assetEntries[assetPath] = {
              path: relativeAssetPath,
              bytes: assetBytes.byteLength,
              sha256: createHash("sha256").update(assetBytes).digest("hex"),
            };
          }
          index.bundles[bundleKey(extension.name, command.name)] = {
            path: relativePath,
            bytes: bytes.byteLength,
            sha256: createHash("sha256").update(bytes).digest("hex"),
            files: assetEntries,
            manifest: bundleManifest,
          };
          built++;
        } catch (error) {
          reasons.push(`${extension.name}/${command.name}: ${String(error)}`);
        }
      }
    } catch (error) {
      for (const command of extension.commands)
        reasons.push(`${extension.name}/${command.name}: ${String(error)}`);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(8, extensions.length) }, async () => {
      while (next < extensions.length) {
        const extension = extensions[next++];
        if (extension) await buildOne(extension);
      }
    }),
  );
  index.bundles = Object.fromEntries(
    Object.entries(index.bundles).toSorted(([a], [b]) => a.localeCompare(b)),
  );
  reasons.sort();
  await writeFile(join(output, "bundles.json"), `${JSON.stringify(index)}\n`);
  const total = catalog.extensions.reduce(
    (count, extension) => count + extension.commands.length,
    0,
  );
  const bytes = Object.values(index.bundles).reduce((sum, entry) => sum + entry.bytes, 0);
  const sizes = Object.values(index.bundles)
    .map((entry) => entry.bytes)
    .toSorted((a, b) => a - b);
  const percentile = (fraction: number) =>
    sizes[Math.min(sizes.length - 1, Math.floor(sizes.length * fraction))] ?? 0;
  console.log(
    `catalog prebuild: ${built}/${total} built, ${reasons.length} failed, ${bytes} command bytes + ${runtimeBytes.byteLength} runtime bytes (median ${percentile(0.5)}, p95 ${percentile(0.95)}, max ${percentile(1)})`,
  );
  for (const reason of reasons) console.log(`  ${reason}`);
  return { index, built, failed: reasons.length, reasons, bytes };
}
