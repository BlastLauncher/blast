import { cp, mkdir, readFile, readdir, stat, symlink, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const cache = join(projectRoot, ".cache", "browser-demo");
const deps = join(cache, "deps");
const almostVersion = "0.2.14";
const esbuildVersion = "0.28.2";
const playwrightVersion = "1.58.0";
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
  const packageRoot = join(deps, "node_modules", "almostnode");
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
    await symlink(join(deps, "node_modules"), join(cache, "node_modules"), "dir");
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
  const host = await bunBuild({
    entrypoints: [hostEntry],
    target: "browser",
    format: "esm",
    outfile: join(cache, "almostnode.mjs"),
  });
  const sandbox = await bunBuild({
    entrypoints: [sandboxEntry],
    target: "browser",
    format: "esm",
    outfile: join(cache, "almostnode-full.mjs"),
  });
  if (!host.success || !sandbox.success) throw new Error("almostnode build failed");
  await writeFile(join(cache, "almostnode.mjs"), await host.outputs[0]!.text());
  await writeFile(join(cache, "almostnode-full.mjs"), await sandbox.outputs[0]!.text());
}

export type BrowserAssets = {
  clientJs: string;
  almost: string;
  sandbox: string;
  wasm: Uint8Array;
  sources: Record<string, string>;
};
export async function buildBrowserAssets(): Promise<BrowserAssets> {
  await depsReady();
  await buildAlmost();
  const sources = {
    ...(await filesUnder(join(projectRoot, "packages/runtime/src"), "packages/runtime/src")),
    ...(await filesUnder(join(projectRoot, "packages/protocol/src"), "packages/protocol/src")),
    ...(await filesUnder(
      join(projectRoot, "packages/client-core/src"),
      "packages/client-core/src",
    )),
    ...(await filesUnder(join(projectRoot, "examples/browser-demo"), "examples/browser-demo")),
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
  const client = await bunBuild({
    entrypoints: [join(projectRoot, "examples/browser-demo/client.ts")],
    target: "browser",
    format: "esm",
    write: false,
    define: { "globalThis.__BLAST_SANDBOX__": "window.__BLAST_SANDBOX__" },
    plugins: [
      {
        name: "demo-deps",
        setup(build) {
          build.onResolve({ filter: /^esbuild-wasm$/ }, () => ({
            path: join(deps, "node_modules/esbuild-wasm/esm/browser.js"),
          }));
        },
      },
    ],
  });
  if (!client.success) throw new Error(client.logs.map((log) => log.message).join("\n"));
  return {
    clientJs: await client.outputs[0]!.text(),
    almost: await readFile(join(cache, "almostnode.mjs"), "utf8"),
    sandbox: await readFile(join(cache, "almostnode-full.mjs"), "utf8"),
    wasm: await readFile(join(deps, "node_modules/esbuild-wasm/esbuild.wasm")),
    sources,
  };
}
