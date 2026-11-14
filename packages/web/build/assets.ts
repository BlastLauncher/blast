// Builds the static files an embedder hosts for @blastlauncher/web (decision
// 0015). Bun repo automation, not shipped code: the browser demo, the site,
// the web-embed example and `release:build` all take their assets from here.
import { cp, mkdir, readFile, readdir, stat, symlink, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { sandboxPage } from "../sandbox/page.ts";

export const projectRoot = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
const cache = join(projectRoot, ".cache", "browser-demo");
const deps = join(cache, "deps");
/** Where `depsReady` installs almostnode, esbuild-wasm and playwright. */
export const depsModules = join(deps, "node_modules");
const almostVersion = "0.2.14";
const esbuildVersion = "0.28.2";
const playwrightVersion = "1.58.0";

/**
 * The published layout: `assets/` is served from the page origin (`assetsUrl`),
 * `sandbox/` from the separate sandbox origin (`sandboxUrl`).
 */
export const webAssetFiles = {
  assets: ["blast-web.js", "almostnode.mjs", "esbuild.mjs", "esbuild.wasm", "blast-sources.json"],
  sandbox: ["index.html", "almostnode-full.mjs"],
} as const;

const bunBuild = (options: Parameters<typeof Bun.build>[0] & Record<string, unknown>) =>
  Bun.build(options as unknown as Parameters<typeof Bun.build>[0]);
const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );

async function run(args: string[]) {
  const child = Bun.spawn(["bun", ...args], {
    cwd: projectRoot,
    stdout: "inherit",
    stderr: "inherit",
  });
  if (await child.exited) throw new Error(`bun ${args.join(" ")} failed`);
}
export async function depsReady() {
  await mkdir(deps, { recursive: true });
  const packageFile = join(deps, "package.json");
  if (!(await exists(packageFile)))
    await writeFile(packageFile, '{"name":"blast-browser-demo","private":true,"type":"module"}\n');
  const marker = join(deps, `installed-${almostVersion}-${esbuildVersion}-${playwrightVersion}`);
  if (!(await exists(marker))) {
    await run([
      "add",
      "--cwd",
      deps,
      "--no-save",
      `almostnode@${almostVersion}`,
      `esbuild-wasm@${esbuildVersion}`,
      `playwright@${playwrightVersion}`,
    ]);
    await writeFile(marker, "ok\n");
  }
}
async function filesUnder(directory: string, prefix: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  async function visit(path: string) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const current = join(path, entry.name);
      if (entry.isDirectory()) await visit(current);
      else if (/\.(?:ts|tsx|js|json)$/.test(entry.name))
        result[`/${prefix}/${relative(directory, current).replaceAll("\\", "/")}`] = await readFile(
          current,
          "utf8",
        );
    }
  }
  await visit(directory);
  return result;
}
export async function relativeFiles(directory: string): Promise<string[]> {
  const result: string[] = [];
  async function visit(path: string, prefix: string) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const current = join(path, entry.name);
      const child = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await visit(current, child);
      else result.push(child);
    }
  }
  await visit(directory, "");
  return result;
}
async function buildAlmost() {
  const packageRoot = join(depsModules, "almostnode");
  const source = await readFile(join(packageRoot, "src", "runtime.ts"), "utf8");
  const copied = join(cache, "almost-src");
  await cp(join(packageRoot, "src"), copied, { recursive: true, force: true });
  await writeFile(
    join(copied, "runtime.ts"),
    source.replaceAll("./shims/child_process", "./shims/child_process-browser"),
  );
  const utilShim = join(copied, "shims", "util.ts");
  const utilSource = await readFile(utilShim, "utf8");
  await writeFile(
    utilShim,
    utilSource
      .replace(
        "export const types = {",
        `export function isAnyArrayBuffer(value: unknown): boolean {
  return value instanceof ArrayBuffer ||
    (typeof SharedArrayBuffer !== "undefined" && value instanceof SharedArrayBuffer);
}
export function isBoxedPrimitive(value: unknown): boolean {
  const tag = Object.prototype.toString.call(value);
  return ["[object Boolean]", "[object Number]", "[object String]", "[object BigInt]", "[object Symbol]"].includes(tag);
}

export const types = {`,
      )
      .replace("  isBuffer,\n};", "  isBuffer,\n  isAnyArrayBuffer,\n  isBoxedPrimitive,\n};"),
  );
  if (!(await exists(join(cache, "node_modules"))))
    await symlink(depsModules, join(cache, "node_modules"), "dir");
  const hostEntry = join(cache, "host.ts");
  const sandboxEntry = join(cache, "sandbox.ts");
  await writeFile(
    hostEntry,
    `import { SandboxRuntime } from ${JSON.stringify(join(packageRoot, "src/sandbox-runtime.ts"))}; import { VirtualFS } from ${JSON.stringify(join(packageRoot, "src/virtual-fs.ts"))}; export { VirtualFS }; export async function createRuntime(vfs: VirtualFS, options: {sandbox: string}) { return new SandboxRuntime(options.sandbox, vfs); }`,
  );
  await writeFile(
    sandboxEntry,
    `export { Runtime } from ${JSON.stringify(join(copied, "runtime.ts"))}; export { VirtualFS } from ${JSON.stringify(join(copied, "virtual-fs.ts"))};`,
  );
  const [host, sandbox] = await Promise.all(
    [hostEntry, sandboxEntry].map((entry) =>
      bunBuild({ entrypoints: [entry], target: "browser", format: "esm" }),
    ),
  );
  if (!host?.success || !sandbox?.success) throw new Error("almostnode build failed");
  return { almost: await host.outputs[0]!.text(), sandbox: await sandbox.outputs[0]!.text() };
}

/** `mount` and friends as one self-contained module, for pages without a bundler. */
async function buildWeb() {
  const web = await bunBuild({
    entrypoints: [join(projectRoot, "packages/web/src/index.ts")],
    target: "browser",
    format: "esm",
    minify: true,
    // It is served from assets/ itself, so the default assetsUrl is its own directory.
    define: { BLAST_PACKAGED_ASSETS: JSON.stringify("./") },
  });
  if (!web.success) throw new Error(web.logs.map((log) => log.message).join("\n"));
  return web.outputs[0]!.text();
}

export type WebAssets = {
  /** `blast-web.js`: the package's browser entry, bundled. */
  web: string;
  /** `almostnode.mjs`: the page-side almostnode host that opens the sandbox frame. */
  almost: string;
  /** `almostnode-full.mjs`: the runtime the sandbox page loads. */
  sandbox: string;
  /** `esbuild.mjs` and `esbuild.wasm`: esbuild-wasm for in-browser bundling. */
  esbuild: string;
  wasm: Uint8Array;
  /** `blast-sources.json`: the Blast runtime sources bundled into each command. */
  sources: Record<string, string>;
};
export async function buildWebAssets(): Promise<WebAssets> {
  await depsReady();
  const { almost, sandbox } = await buildAlmost();
  const sources = {
    ...(await filesUnder(join(projectRoot, "packages/runtime/src"), "packages/runtime/src")),
    ...(await filesUnder(join(projectRoot, "packages/protocol/src"), "packages/protocol/src")),
    ...(await filesUnder(
      join(projectRoot, "packages/client-core/src"),
      "packages/client-core/src",
    )),
    ...(await filesUnder(join(projectRoot, "packages/web/sandbox"), "packages/web/sandbox")),
    ...(await filesUnder(
      join(projectRoot, "packages/runtime/node_modules/react"),
      "node_modules/react",
    )),
    ...(await filesUnder(
      join(projectRoot, "packages/runtime/node_modules/react-reconciler"),
      "node_modules/react-reconciler",
    )),
    ...(await filesUnder(
      join(projectRoot, "node_modules/.bun/scheduler@0.27.0/node_modules/scheduler"),
      "node_modules/scheduler",
    )),
  };
  return {
    web: await buildWeb(),
    almost,
    sandbox,
    esbuild: await readFile(join(depsModules, "esbuild-wasm/esm/browser.js"), "utf8"),
    wasm: await readFile(join(depsModules, "esbuild-wasm/esbuild.wasm")),
    sources,
  };
}

/** Writes `<output>/assets/` and `<output>/sandbox/` as listed in `webAssetFiles`. */
export async function writeWebAssets(output: string, built?: WebAssets) {
  const assets = built ?? (await buildWebAssets());
  const page = join(output, "assets");
  const sandbox = join(output, "sandbox");
  await mkdir(page, { recursive: true });
  await mkdir(sandbox, { recursive: true });
  await writeFile(join(page, "blast-web.js"), assets.web);
  await writeFile(join(page, "almostnode.mjs"), assets.almost);
  await writeFile(join(page, "esbuild.mjs"), assets.esbuild);
  await writeFile(join(page, "esbuild.wasm"), assets.wasm);
  await writeFile(join(page, "blast-sources.json"), JSON.stringify(assets.sources));
  await writeFile(join(sandbox, "index.html"), sandboxPage("./almostnode-full.mjs"));
  await writeFile(join(sandbox, "almostnode-full.mjs"), assets.sandbox);
  return { assets: page, sandbox };
}

if (import.meta.main) {
  const output = process.argv[2] ?? join(projectRoot, ".cache/web-assets");
  console.log(await writeWebAssets(output));
}
