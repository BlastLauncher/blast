import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as esbuild from "esbuild";
import { bundleForBrowser } from "../../packages/host/src/browser-bundle.ts";
import { installForBrowser } from "../../packages/host/src/browser-install.ts";
import { bundleKey, type BundleIndex } from "./bundles.ts";
import { projectRoot, relativeFiles } from "./build.ts";
import { ensureCorpusCheckout } from "../../scripts/corpus/fetch.ts";
import type { Catalog } from "./root.ts";

const aliases = {
  "@raycast/api": "/packages/runtime/src/api/index.ts",
  "@blastlauncher/protocol": "/packages/protocol/src/index.ts",
  react: "/node_modules/react/index.js",
  "react/jsx-runtime": "/node_modules/react/jsx-runtime.js",
  "react/jsx-dev-runtime": "/node_modules/react/jsx-dev-runtime.js",
  "react-reconciler": "/node_modules/react-reconciler/index.js",
  "react-reconciler/constants.js": "/node_modules/react-reconciler/constants.js",
  scheduler: "/node_modules/scheduler/index.js",
};
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
  await add(join(projectRoot, "examples/browser-demo"), "examples/browser-demo");
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

async function fetchExtension(
  checkout: string,
  extension: string,
): Promise<Map<string, string | Uint8Array>> {
  const directory = join(checkout, "extensions", extension);
  if (!(await exists(join(directory, "package.json"))))
    throw new Error(`Extension package.json was not found: ${extension}`);
  const files = new Map<string, string | Uint8Array>();
  for (const path of await relativeFiles(directory)) {
    if (path.split("/").includes("node_modules")) continue;
    const bytes = await readFile(join(directory, path));
    files.set(`/${path}`, textFile(path) ? bytes.toString("utf8") : new Uint8Array(bytes));
  }
  return files;
}

function commandEntry(files: Map<string, string | Uint8Array>, name: string): string {
  for (const extension of ["tsx", "ts", "jsx", "js"])
    if (files.has(`/src/${name}.${extension}`)) return `/src/${name}.${extension}`;
  if (files.has("/src/index.tsx")) return "/src/index.tsx";
  throw new Error(`Command source not found for ${name}`);
}

export async function prebuildCatalog(
  catalog: Catalog,
  buildSha: string,
  output: string,
  fixtures = false,
): Promise<{
  index: BundleIndex;
  built: number;
  failed: number;
  reasons: string[];
  bytes: number;
}> {
  const shared = await sharedSources();
  const checkout = fixtures
    ? ""
    : ensureCorpusCheckout(
        projectRoot,
        catalog.extensions.map((extension) => extension.name),
        catalog.commit,
        { catalogOnly: true },
      );
  const index: BundleIndex = { buildSha, bundles: {} };
  const runtime = await bundleForBrowser({
    esbuild,
    files: shared,
    packages: new Map(),
    command: "/examples/browser-demo/runtime-entry.ts",
    runtimeEntry: "/examples/browser-demo/runtime-entry.ts",
    aliases,
    entryCode: `import * as react from "react";
import * as jsxRuntime from "react/jsx-runtime";
import * as jsxDevRuntime from "react/jsx-dev-runtime";
import * as api from "@raycast/api";
import * as reconciler from "react-reconciler";
import * as scheduler from "scheduler";
import * as protocol from "@blastlauncher/protocol";
import { start } from "/examples/browser-demo/runtime-entry.ts";
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
  const extensions = catalog.extensions.filter(
    (extension) => !fixtures || extension.name === "hello-list",
  );
  let next = 0;
  async function buildOne(extension: Catalog["extensions"][number]) {
    let files: Map<string, string | Uint8Array>;
    try {
      if (fixtures && extension.name === "hello-list") {
        files = new Map();
        for (const path of await relativeFiles(join(projectRoot, "fixtures/extensions/hello-list")))
          files.set(
            `/${path}`,
            textFile(path)
              ? await readFile(join(projectRoot, "fixtures/extensions/hello-list", path), "utf8")
              : new Uint8Array(
                  await readFile(join(projectRoot, "fixtures/extensions/hello-list", path)),
                ),
          );
      } else files = await fetchExtension(checkout, extension.name);
      const manifest = JSON.parse(String(files.get("/package.json"))) as Record<string, unknown>;
      const lockfile = files.get("/package-lock.json");
      const installed = await installForBrowser({
        fetch: (input, init) => fetch(input, init),
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
            runtimeEntry: "/examples/browser-demo/runtime-entry.ts",
            aliases,
            sharedRuntime: true,
            sharedModules: [
              "react",
              "react/jsx-runtime",
              "react/jsx-dev-runtime",
              "@raycast/api",
              "react-reconciler",
              "scheduler",
              "@blastlauncher/protocol",
            ],
          });
          const bytes = Buffer.from(bundled.code);
          const relativePath = `bundles/${extension.name}/${command.name}.js`;
          await mkdir(join(output, "bundles", extension.name), { recursive: true });
          await writeFile(join(output, relativePath), bytes);
          index.bundles[bundleKey(extension.name, command.name)] = {
            path: relativePath,
            bytes: bytes.byteLength,
            sha256: createHash("sha256").update(bytes).digest("hex"),
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
