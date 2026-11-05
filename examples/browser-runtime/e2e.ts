import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const cache = join(root, ".cache", "browser-runtime");
const deps = join(cache, "deps");
const browsers =
  process.env.PLAYWRIGHT_BROWSERS_PATH ??
  "/Users/yukai/Projects/BlastLauncher/blast/.cache/ms-playwright";
const almostVersion = "0.2.14";
const playwrightVersion = "1.58.0";
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
  if (!(await exists(join(browsers, "chromium- chromium"))) && !(await exists(browsers)))
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
import { Runtime, VirtualFS } from ${JSON.stringify(almostUrl)};
let runtime;
addEventListener('message', async (event) => {
  const m = event.data;
  if (m?.type === 'init') { runtime = new Runtime(VirtualFS.fromSnapshot(m.vfsSnapshot), m.options ?? {}); return; }
  if (m?.type === 'execute' && runtime) { try { const result = runtime.execute(m.code, m.filename); parent.postMessage({type:'result', id:m.id, result}, '*'); } catch (error) { parent.postMessage({type:'error', id:m.id, error:String(error)}, '*'); } return; }
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
const events = []; let ready;
addEventListener('message', (event) => {
  if (event.origin !== new URL(sandbox).origin) return;
  if (event.data?.type === 'blast') { events.push(event.data.message); window.blastState = { events, frame: event.source }; }
});
const code = await fetch('/blast-runtime.cjs').then((r) => r.text());
await runtime.execute(code, '/blast-runtime.cjs');
window.blastSend = (message) => { const target = window.blastState?.frame; if (!target) throw new Error('sandbox frame not ready'); target.postMessage({type:'blast-host', message}, new URL(sandbox).origin); };
window.blastInit = () => window.blastSend({type:'init'});
window.blastRuntimeReady = true;
</script>`;
}
async function buildBundles(): Promise<{
  almostHost: string;
  almostSandbox: string;
  blast: string;
}> {
  await mkdir(cache, { recursive: true });
  const almostEntry = join(cache, "almost-entry.ts");
  const sandboxEntry = join(cache, "almost-full-entry.ts");
  await writeFile(
    almostEntry,
    `import { SandboxRuntime } from ${JSON.stringify(join(root, "node_modules/.bun/almostnode@0.2.14/node_modules/almostnode/src/sandbox-runtime.ts"))};\nimport { VirtualFS } from ${JSON.stringify(join(root, "node_modules/.bun/almostnode@0.2.14/node_modules/almostnode/src/virtual-fs.ts"))};\nexport { VirtualFS };\nexport async function createRuntime(vfs: VirtualFS, options: { sandbox: string }) { return new SandboxRuntime(options.sandbox, vfs); }\n`,
  );
  await writeFile(
    sandboxEntry,
    `export { Runtime } from ${JSON.stringify(join(cache, "almost-src2/runtime.ts"))};\nexport { VirtualFS } from ${JSON.stringify(join(cache, "almost-src2/virtual-fs.ts"))};\n`,
  );
  const almost = await Bun.build({
    entrypoints: [almostEntry],
    target: "browser",
    format: "esm",
    outfile: join(cache, "almostnode.mjs"),
  });
  const sandboxBundle = await Bun.build({
    entrypoints: [sandboxEntry],
    target: "browser",
    format: "esm",
    outfile: join(cache, "almostnode-full.mjs"),
  });
  if (!almost.success || !sandboxBundle.success)
    throw new Error(
      `almostnode bundle failed: ${[...almost.logs, ...sandboxBundle.logs].map((x) => x.message).join("; ")}`,
    );
  const blast = await Bun.build({
    entrypoints: [join(root, "examples/browser-runtime/runtime-entry.ts")],
    target: "browser",
    format: "cjs",
    outfile: join(cache, "blast-runtime.cjs"),
  });
  if (!blast.success)
    throw new Error(`Blast runtime bundle failed: ${blast.logs.map((x) => x.message).join("; ")}`);
  return {
    almostHost: await readFile(join(cache, "almostnode.mjs"), "utf8"),
    almostSandbox: await readFile(join(cache, "almostnode-full.mjs"), "utf8"),
    blast: await readFile(join(cache, "blast-runtime.cjs"), "utf8"),
  };
}
async function main(): Promise<void> {
  await ensureDependencies();
  const bundles = await buildBundles();
  let host: Awaited<ReturnType<typeof server>> | undefined;
  let sandbox: Awaited<ReturnType<typeof server>> | undefined;
  let browser: { close: () => Promise<void> } | undefined;
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
    const started = performance.now();
    await page.goto(`http://127.0.0.1:${host.port}/`, { waitUntil: "load" });
    await page.waitForFunction(() => Boolean((window as any).blastRuntimeReady));
    await page.evaluate(() => (window as any).blastInit());
    await page.waitForFunction(() =>
      (window as any).blastState?.events?.some((x: any) => x.type === "scene"),
    );
    const coldStartMs = performance.now() - started;
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
      const all = (window as any).blastState.events.at(-1).scene.root;
      // eslint-disable-next-line unicorn/consistent-function-scoping
      const walk = (x: any): any =>
        x?.type === "Action.CopyToClipboard"
          ? x
          : x?.children?.map((y: any) => walk(y)).find(Boolean);
      return walk(all);
    });
    const copyHandler = copyNode?.props?.onAction?.$handler;
    if (!copyHandler) throw new Error("step 3 failed: copy handler missing from real scene");
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
    await page.waitForFunction(() =>
      (window as any).blastState.events.some((x: any) => x.type === "capability.request"),
    );
    await page.evaluate(() => {
      const req = (window as any).blastState.events.find(
        (x: any) => x.type === "capability.request",
      );
      (window as any).blastSend({ type: "capability.result", id: req.id, ok: true, value: null });
    });
    const bytes = bundles.almostHost.length + bundles.almostSandbox.length + bundles.blast.length;
    console.log(
      JSON.stringify(
        {
          pass: true,
          firstScene: true,
          search: true,
          clipboard: true,
          coldStartMs: Math.round(coldStartMs),
          warmStartMs: null,
          pageBytes: bytes,
          almostnodeBytes: bundles.almostHost.length + bundles.almostSandbox.length,
          runtimeBytes: bundles.blast.length,
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
