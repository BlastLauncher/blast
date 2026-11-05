import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { cp, mkdir, readFile, stat, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser } from "playwright";

declare const window: Record<string, unknown>;

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const cache = join(root, ".cache", "browser-runtime");
const deps = join(cache, "deps");
const browsers = process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(root, ".cache", "ms-playwright");
const almostVersion = "0.2.14";
const playwrightVersion = "1.58.0";
const bunBuild = (options: Parameters<typeof Bun.build>[0] & Record<string, unknown>) =>
  Bun.build(options as unknown as Parameters<typeof Bun.build>[0]);
async function command(args: string[]): Promise<void> {
  const p = Bun.spawn(["bun", ...args], { cwd: root, stdout: "inherit", stderr: "inherit" });
  if ((await p.exited) !== 0) throw new Error(`command failed: bun ${args.join(" ")}`);
}
async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}
async function ensureDependencies(): Promise<void> {
  await mkdir(deps, { recursive: true });
  const packageFile = join(deps, "package.json");
  if (!(await exists(packageFile)))
    await writeFile(
      packageFile,
      '{"name":"blast-browser-runtime-deps","private":true,"type":"module"}\n',
    );
  const marker = join(deps, `installed-${almostVersion}-${playwrightVersion}`);
  if (!(await exists(marker))) {
    await command([
      "add",
      "--cwd",
      deps,
      "--no-save",
      `almostnode@${almostVersion}`,
      `playwright@${playwrightVersion}`,
    ]);
    await writeFile(marker, "ok\n");
  }
  if (!(await exists(browsers)))
    throw new Error(`PLAYWRIGHT_BROWSERS_PATH is missing: ${browsers}`);
}
function send(response: ServerResponse, body: string, type = "text/html") {
  response.writeHead(200, {
    "content-type": `${type}; charset=utf-8`,
    "access-control-allow-origin": "*",
    "cross-origin-resource-policy": "cross-origin",
  });
  response.end(body);
}
function server(handler: (request: IncomingMessage, response: ServerResponse) => void) {
  return new Promise<{ port: number; close: () => Promise<void> }>((resolve, reject) => {
    const instance = createServer(handler);
    instance.once("error", reject);
    instance.listen(0, "127.0.0.1", () => {
      const address = instance.address();
      if (!address || typeof address === "string")
        return reject(new Error("server address unavailable"));
      resolve({
        port: address.port,
        close: () => new Promise((done) => instance.close(() => done())),
      });
    });
  });
}
async function boundedClose(close: (() => Promise<void>) | undefined): Promise<void> {
  if (!close) return;
  await Promise.race([
    close(),
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 500);
      timer.unref();
    }),
  ]);
}
function sandboxHtml(almostUrl: string): string {
  return `<!doctype html><script type="module">
import { Runtime, VirtualFS, PackageManager } from ${JSON.stringify(almostUrl)};
let runtime;
let npm;
addEventListener('message', async (event) => {
  const m = event.data;
  if (m?.type === 'init') { const vfs = VirtualFS.fromSnapshot(m.vfsSnapshot); runtime = new Runtime(vfs, m.options ?? {}); npm = new PackageManager(vfs, { registry: 'https://registry.npmjs.org' }); return; }
  if (m?.type === 'execute' && runtime) { try { const result = runtime.execute(m.code, m.filename); parent.postMessage({type:'result', id:m.id, result}, '*'); } catch (error) { parent.postMessage({type:'error', id:m.id, error:String(error)}, '*'); } return; }
  if (m?.type === 'esbuild-probe' && runtime) { try { const result = runtime.execute('module.exports = require("esbuild").transform("export const answer = 42", { loader: "js", format: "cjs" });', '/esbuild-probe.cjs'); parent.postMessage({type:'esbuild-result', ok:true, result}, '*'); } catch (error) { parent.postMessage({type:'esbuild-result', ok:false, error:String(error)}, '*'); } return; }
  if (m?.type === 'npm-install' && npm) { const started = performance.now(); try { const installed = new Map(); for (const spec of m.specs) { const result = await npm.install(spec, { transform: false }); for (const [name, pkg] of result.installed) installed.set(name, pkg.version); } parent.postMessage({type:'npm-result', id:m.id, ok:true, ms:performance.now()-started, installed:[...installed], vfsBytes: JSON.stringify(npm['vfs'].toSnapshot()).length}, '*'); } catch (error) { parent.postMessage({type:'npm-result', id:m.id, ok:false, ms:performance.now()-started, error:String(error)}, '*'); } return; }
  if (m?.type === 'blast-host') dispatchEvent(new MessageEvent('message', { data: m }));
});
parent.postMessage({type:'ready'}, '*');
</script>`;
}
function hostHtml(sandboxUrl: string): string {
  return `<!doctype html><script type="module">
import { createRuntime, VirtualFS } from '/almostnode.mjs';
const sandbox = ${JSON.stringify(sandboxUrl)}; const vfs = new VirtualFS();
const runtime = await createRuntime(vfs, { sandbox });
const frame = [...document.querySelectorAll('iframe')].at(-1);
const events = []; let ready; let npmId = 0; const npmWaiters = new Map();
let esbuildWaiter;
addEventListener('message', (event) => {
  if (event.origin !== new URL(sandbox).origin) return;
  if (event.data?.type === 'blast') { events.push(event.data.message); window.blastState = { events, frame: event.source }; }
  if (event.data?.type === 'npm-result') { npmWaiters.get(event.data.id)?.(event.data); npmWaiters.delete(event.data.id); }
  if (event.data?.type === 'esbuild-result') { esbuildWaiter?.(event.data); esbuildWaiter = undefined; }
});
const code = await fetch('/blast-runtime.cjs').then((r) => r.text());
await runtime.execute(code, '/blast-runtime.cjs');
window.blastSend = (message) => { const target = window.blastState?.frame; if (!target) throw new Error('sandbox frame not ready'); target.postMessage({type:'blast-host', message}, new URL(sandbox).origin); };
window.blastInit = () => window.blastSend({type:'init'});
window.blastNpmInstall = (specs) => new Promise((resolve) => { const id = String(++npmId); npmWaiters.set(id, resolve); window.blastState.frame.postMessage({type:'npm-install', id, specs}, new URL(sandbox).origin); });
window.blastEsbuild = () => new Promise((resolve) => { esbuildWaiter = resolve; window.blastState.frame.postMessage({type:'esbuild-probe'}, new URL(sandbox).origin); });
window.blastRuntimeReady = true;
</script>`;
}
async function buildBundles(): Promise<{
  almostHost: string;
  almostSandbox: string;
  blast: string;
}> {
  await mkdir(cache, { recursive: true });
  const almostRoot = join(deps, "node_modules", "almostnode");
  if (!(await exists(join(almostRoot, "src", "runtime.ts"))))
    throw new Error(`almostnode source missing from deps install: ${almostRoot}`);
  const almostEntry = join(cache, "almost-entry.ts");
  const sandboxEntry = join(cache, "almost-full-entry.ts");
  const sourceRuntime = await readFile(join(almostRoot, "src", "runtime.ts"), "utf8");
  const childImport = "./shims/child_process";
  const childReplacement = "./shims/child_process-browser";
  const childImportCount = sourceRuntime.split(childImport).length - 1;
  if (childImportCount < 1)
    throw new Error(`almostnode ${almostVersion} runtime patch target not found: ${childImport}`);
  const patchedRuntime = sourceRuntime.split(childImport).join(childReplacement);
  await cp(join(almostRoot, "src"), join(cache, "almost-src"), { recursive: true, force: true });
  if (!(await exists(join(cache, "node_modules"))))
    await symlink(join(deps, "node_modules"), join(cache, "node_modules"), "dir");
  await writeFile(join(cache, "almost-src", "runtime.ts"), patchedRuntime);
  await writeFile(
    almostEntry,
    `import { SandboxRuntime } from ${JSON.stringify(join(almostRoot, "src/sandbox-runtime.ts"))};\nimport { VirtualFS } from ${JSON.stringify(join(almostRoot, "src/virtual-fs.ts"))};\nexport { VirtualFS };\nexport async function createRuntime(vfs: VirtualFS, options: { sandbox: string }) { return new SandboxRuntime(options.sandbox, vfs); }\n`,
  );
  await writeFile(
    sandboxEntry,
    `export { Runtime } from ${JSON.stringify(join(cache, "almost-src/runtime.ts"))};\nexport { VirtualFS } from ${JSON.stringify(join(cache, "almost-src/virtual-fs.ts"))};\nexport { PackageManager } from ${JSON.stringify(join(almostRoot, "src/npm/index.ts"))};\n`,
  );
  const almost = await bunBuild({
    entrypoints: [almostEntry],
    target: "browser",
    format: "esm",
    outfile: join(cache, "almostnode.mjs"),
  });
  const sandboxBundle = await bunBuild({
    entrypoints: [sandboxEntry],
    target: "browser",
    format: "esm",
    outfile: join(cache, "almostnode-full.mjs"),
  });
  if (!almost.success || !sandboxBundle.success)
    throw new Error(
      `almostnode bundle failed: ${[...almost.logs, ...sandboxBundle.logs].map((x) => x.message).join("; ")}`,
    );
  await writeFile(join(cache, "almostnode.mjs"), await almost.outputs[0]!.text());
  await writeFile(join(cache, "almostnode-full.mjs"), await sandboxBundle.outputs[0]!.text());
  const blast = await bunBuild({
    entrypoints: [join(root, "examples/browser-runtime/runtime-entry.ts")],
    target: "browser",
    format: "cjs",
    outfile: join(cache, "blast-runtime.cjs"),
    plugins: [
      {
        name: "blast-browser-aliases",
        setup(build) {
          build.onResolve({ filter: /^@raycast\/api$/ }, () => ({
            path: join(root, "packages/runtime/src/api/index.ts"),
          }));
          build.onResolve({ filter: /^node:/ }, ({ path }) => ({ path, external: true }));
          build.onResolve({ filter: /^react(?:\/.*)?$/ }, ({ path }) => ({
            path:
              path === "react"
                ? join(root, "packages/runtime/node_modules/react/index.js")
                : join(root, "packages/runtime/node_modules", `${path}.js`),
          }));
        },
      },
    ],
  });
  if (!blast.success)
    throw new Error(`Blast runtime bundle failed: ${blast.logs.map((x) => x.message).join("; ")}`);
  await writeFile(join(cache, "blast-runtime.cjs"), await blast.outputs[0]!.text());
  return {
    almostHost: await readFile(join(cache, "almostnode.mjs"), "utf8"),
    almostSandbox: await readFile(join(cache, "almostnode-full.mjs"), "utf8"),
    blast: await readFile(join(cache, "blast-runtime.cjs"), "utf8"),
  };
}
async function fetchWalkthroughManifest(): Promise<{ dependencies: string[]; source: string }> {
  const url =
    "https://raw.githubusercontent.com/raycast/extensions/main/extensions/ratio-calculator/package.json";
  const response = await fetch(url);
  if (!response.ok) throw new Error(`walkthrough manifest fetch failed: ${response.status}`);
  const source = await response.text();
  await mkdir(cache, { recursive: true });
  await writeFile(join(cache, "ratio-calculator-package.json"), source);
  const manifest = JSON.parse(source) as { dependencies?: Record<string, string> };
  return {
    dependencies: Object.entries(manifest.dependencies ?? {}).map(
      ([name, version]) => `${name}@${version}`,
    ),
    source,
  };
}
async function main(): Promise<void> {
  await ensureDependencies();
  const bundles = await buildBundles();
  let host: Awaited<ReturnType<typeof server>> | undefined;
  let sandbox: Awaited<ReturnType<typeof server>> | undefined;
  let browser: Browser | undefined;
  try {
    sandbox = await server((request, response) =>
      request.url === "/almostnode-full.mjs"
        ? send(response, bundles.almostSandbox, "text/javascript")
        : send(response, sandboxHtml(`http://127.0.0.1:${sandbox!.port}/almostnode-full.mjs`)),
    );
    host = await server((request, response) => {
      if (request.url === "/almostnode.mjs")
        return send(response, bundles.almostHost, "text/javascript");
      if (request.url === "/blast-runtime.cjs")
        return send(response, bundles.blast, "text/javascript");
      send(response, hostHtml(`http://127.0.0.1:${sandbox!.port}/`));
    });
    const { chromium } = await import("playwright");
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    let responseBytes = 0;
    const countResponses = () => {
      responseBytes = 0;
      const handler = (response: { body: () => Promise<Buffer> }) => {
        void response
          .body()
          .then((body) => {
            responseBytes += body.byteLength;
          })
          .catch(() => {});
      };
      page.on("response", handler as never);
      return () => page.off("response", handler as never);
    };
    const stopCounting = countResponses();
    const started = performance.now();
    await page.goto(`http://127.0.0.1:${host.port}/`, { waitUntil: "load" });
    await page.waitForFunction(() => Boolean((window as any).blastRuntimeReady));
    await page.evaluate(() => (window as any).blastInit());
    await page.waitForFunction(() =>
      (window as any).blastState?.events?.some((x: any) => x.type === "scene"),
    );
    const coldStartMs = performance.now() - started;
    await new Promise((resolve) => setTimeout(resolve, 20));
    const coldBytes = responseBytes;
    const scene = await page.evaluate(
      () => (window as any).blastState.events.find((x: any) => x.type === "scene")?.scene,
    );
    if (!scene?.root?.children?.length && scene?.root?.type !== "List")
      throw new Error("step 1 failed: Blast runtime scene missing");
    // eslint-disable-next-line unicorn/consistent-function-scoping
    const find = (node: any, type: string): any =>
      node?.type === type ? node : node?.children?.map((x: any) => find(x, type)).find(Boolean);
    const list = find(scene.root, "List");
    const searchHandler = list?.props?.onSearchTextChange?.$handler;
    if (!searchHandler)
      throw new Error(
        `step 2 failed: search handler missing from real scene ${JSON.stringify(scene)}`,
      );
    await page.evaluate(
      (event) =>
        (window as any).blastSend({
          type: "event",
          node: event.node,
          handler: event.handler,
          args: ["ban"],
        }),
      { node: list.id, handler: searchHandler },
    );
    await page.waitForFunction(() =>
      (window as any).blastState.events.some(
        (x: any) => x.type === "scene" && JSON.stringify(x.scene).includes("banana"),
      ),
    );
    const copyNode = await page.evaluate(() => {
      const all = (window as any).blastState.events
        .toReversed()
        .find((x: any) => x.type === "scene")?.scene?.root;
      // eslint-disable-next-line unicorn/consistent-function-scoping
      const walk = (x: any): any =>
        x?.type === "Action.CopyToClipboard"
          ? x
          : x?.children?.map((y: any) => walk(y)).find(Boolean);
      return walk(all);
    });
    const copyHandler = copyNode?.props?.onAction?.$handler;
    if (!copyHandler) throw new Error("step 3 failed: copy handler missing from real scene");
    await new Promise((resolve) => setTimeout(resolve, 100));
    await page.evaluate(
      (event) =>
        (window as any).blastSend({
          type: "event",
          node: event.node,
          handler: event.handler,
          args: [],
        }),
      { node: copyNode.id, handler: copyHandler },
    );
    await page
      .waitForFunction(
        () => (window as any).blastState.events.some((x: any) => x.type === "capability.request"),
        { timeout: 3000 },
      )
      .catch(async () => {
        throw new Error(
          `step 3 failed: ${await page.evaluate(() => JSON.stringify((window as any).blastState.events.slice(-3)))}`,
        );
      });
    await page.evaluate(() => {
      const req = (window as any).blastState.events.find(
        (x: any) => x.type === "capability.request",
      );
      (window as any).blastSend({ type: "capability.result", id: req.id, ok: true, value: null });
    });
    const isolation = await page.evaluate(() =>
      (window as any).blastState.events.find((x: any) => x.type === "isolation"),
    );
    if (
      isolation?.probe?.dom !== "blocked" ||
      isolation?.probe?.storage !== "blocked" ||
      isolation?.probe?.cookie !== ""
    )
      throw new Error(
        `step 8 failed: sandbox isolation probe exposed host state ${JSON.stringify(isolation)}`,
      );
    const builtins = await page.evaluate(() =>
      (window as any).blastState.events.find((x: any) => x.type === "builtins"),
    );
    if (
      builtins?.probe?.joined !== "blast/browser" ||
      builtins?.probe?.buffer !== "6f6b" ||
      builtins?.probe?.hash !== "b71286fe532c8d91af81b310cbfddf04ba67dd89860f61f31258facf5ea07f36"
    ) {
      if (
        builtins?.probe?.joined !== "blast/browser" ||
        builtins?.probe?.buffer !== "6f6b" ||
        builtins?.probe?.hash !== "b71286fe532c8d91af81b310cbfddf04ba67dd89860f61f31258facf5ea07f36"
      )
        throw new Error(`step 5 failed: node built-ins probe ${JSON.stringify(builtins)}`);
    }
    const manifest = await fetchWalkthroughManifest();
    const npmResult = manifest.dependencies.length
      ? await page.evaluate(
          (specs) => (window as any).blastNpmInstall(specs),
          manifest.dependencies,
        )
      : { ok: true, ms: 0, installed: [], vfsBytes: 0 };
    const esbuildResult = await page.evaluate(() => (window as any).blastEsbuild());
    const warmStart = performance.now();
    stopCounting();
    let warmBytes = 0;
    const warmHandler = (response: { body: () => Promise<Buffer> }) => {
      void response
        .body()
        .then((body) => {
          warmBytes += body.byteLength;
        })
        .catch(() => {});
    };
    page.on("response", warmHandler as never);
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => Boolean((window as any).blastRuntimeReady));
    await page.evaluate(() => (window as any).blastInit());
    await page.waitForFunction(() =>
      (window as any).blastState?.events?.some((x: any) => x.type === "scene"),
    );
    const warmStartMs = performance.now() - warmStart;
    await new Promise((resolve) => setTimeout(resolve, 20));
    page.off("response", warmHandler as never);
    const bytes = bundles.almostHost.length + bundles.almostSandbox.length + bundles.blast.length;
    console.log(
      JSON.stringify(
        {
          pass: true,
          firstScene: true,
          search: true,
          clipboard: true,
          coldStartMs: Math.round(coldStartMs),
          warmStartMs: Math.round(warmStartMs),
          pageBytes: coldBytes,
          warmPageBytes: warmBytes,
          almostnodeBytes: bundles.almostHost.length + bundles.almostSandbox.length,
          runtimeBytes: bundles.blast.length,
          npmInstall: npmResult,
          npmManifest: join(cache, "ratio-calculator-package.json"),
          esbuildWasm: esbuildResult,
          bundleBytes: bytes,
        },
        null,
        2,
      ),
    );
  } finally {
    await boundedClose(browser?.close.bind(browser));
    await boundedClose(host?.close);
    await boundedClose(sandbox?.close);
  }
}
try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  process.exit(process.exitCode ?? 0);
}
