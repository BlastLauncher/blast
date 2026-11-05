import { cp, mkdir, readFile, readdir, stat, symlink, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const cache = join(root, ".cache", "browser-demo");
const deps = join(cache, "deps");
const almostVersion = "0.2.14";
const esbuildVersion = "0.28.2";
const playwrightVersion = "1.58.0";
const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );
async function run(args: string[]) {
  const process = Bun.spawn(["bun", ...args], { cwd: root, stdout: "inherit", stderr: "inherit" });
  if (await process.exited) throw new Error(`bun ${args.join(" ")} failed`);
}
async function depsReady() {
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
async function relativeFiles(directory: string): Promise<string[]> {
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
  const host = await Bun.build({
    entrypoints: [hostEntry],
    target: "browser",
    format: "esm",
    outfile: join(cache, "almostnode.mjs"),
  });
  const sandbox = await Bun.build({
    entrypoints: [sandboxEntry],
    target: "browser",
    format: "esm",
    outfile: join(cache, "almostnode-full.mjs"),
  });
  if (!host.success || !sandbox.success) throw new Error("almostnode build failed");
  await writeFile(join(cache, "almostnode.mjs"), await host.outputs[0]!.text());
  await writeFile(join(cache, "almostnode-full.mjs"), await sandbox.outputs[0]!.text());
}
function html(sandboxPort: number) {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Blast browser demo</title><style>:root{color-scheme:dark}body{font:14px system-ui,-apple-system,sans-serif;max-width:760px;margin:3rem auto;background:#111;color:#eee}main{background:#1b1b1d;border:1px solid #39393d;border-radius:14px;overflow:hidden;box-shadow:0 18px 55px #0008}header{padding:18px 20px 12px}h1{font-size:16px;margin:0 0 12px}input,select{background:#252528;color:inherit;border:1px solid #4b4b50;border-radius:8px;padding:.7rem;width:100%;box-sizing:border-box}ul{margin:0;padding:0;list-style:none}.rows li{min-height:40px;box-sizing:border-box;padding:7px 20px;display:flex;align-items:center;gap:11px}.rows li.selected{background:#34343a;outline:1px solid #666}.root-copy{display:flex;flex-direction:column;flex:1;min-width:0}.root-copy strong,.root-copy small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.root-copy small{color:#aaa}.root-accessory{color:#999;font-size:12px}.root-icon{width:24px;text-align:center;font-size:18px}.empty{padding:18px 20px;color:#aaa}footer{display:flex;justify-content:space-between;border-top:1px solid #333;padding:11px 20px;color:#aaa;font-size:12px}#status{padding:8px 20px;color:#aaa}#status[data-error=true]{color:#ff8b8b}.actions{padding:18px}.actions li{padding:10px}.breadcrumb{color:#aaa;margin:5px 0 12px}@media(prefers-color-scheme:light){:root{color-scheme:light}body{background:#f2f2f4;color:#171719}main{background:#fff;border-color:#ddd}.rows li.selected{background:#e8e8ed}.root-copy small,.root-accessory,footer,#status,.breadcrumb{color:#666}input{background:#f7f7f8;border-color:#bbb}}</style><p id="status">Loading catalog…</p><div id="app"></div><script>window.__BLAST_SANDBOX__=${JSON.stringify(`http://127.0.0.1:${sandboxPort}/`)}</script><script type="module" src="/client.js"></script>`;
}
async function listen(handler: (request: Request) => Response | Promise<Response>) {
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: handler });
  return server;
}
async function main() {
  await depsReady();
  await buildAlmost();
  const sourceFiles = {
    ...(await filesUnder(join(root, "packages/runtime/src"), "packages/runtime/src")),
    ...(await filesUnder(join(root, "packages/protocol/src"), "packages/protocol/src")),
    ...(await filesUnder(join(root, "packages/client-core/src"), "packages/client-core/src")),
    ...(await filesUnder(join(root, "examples/browser-demo"), "examples/browser-demo")),
    ...(await filesUnder(join(root, "packages/runtime/node_modules/react"), "node_modules/react")),
    ...(await filesUnder(
      join(root, "packages/runtime/node_modules/react-reconciler"),
      "node_modules/react-reconciler",
    )),
    ...(await filesUnder(
      join(root, "node_modules/.bun/scheduler@0.27.0/node_modules/scheduler"),
      "node_modules/scheduler",
    )),
  };
  const client = await Bun.build({
    entrypoints: [join(root, "examples/browser-demo/client.ts")],
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
  const clientJs = await client.outputs[0]!.text();
  const sandbox = await listen(async (request) => {
    if (new URL(request.url).pathname === "/almostnode-full.mjs")
      return new Response(await readFile(join(cache, "almostnode-full.mjs")), {
        headers: { "content-type": "text/javascript" },
      });
    return new Response(
      `<!doctype html><script type="module">import {Runtime,VirtualFS} from '/almostnode-full.mjs'; const runtime=new Runtime(new VirtualFS(),{}); addEventListener('message',async e=>{if(e.data?.type==='init')return; if(e.data?.type==='execute'){try{const result=await runtime.execute(e.data.code,e.data.filename); parent.postMessage({type:'result',id:e.data.id,result},'*')}catch(error){parent.postMessage({type:'error',id:e.data.id,error:String(error)},'*')}}}); parent.postMessage({type:'ready'},'*');</script>`,
      { headers: { "content-type": "text/html" } },
    );
  });
  const host = await listen(async (request) => {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === "/")
      return new Response(html(sandbox.port), { headers: { "content-type": "text/html" } });
    if (path === "/client.js")
      return new Response(clientJs, { headers: { "content-type": "text/javascript" } });
    if (path === "/blast-sources.json") return Response.json(sourceFiles);
    if (path === "/catalog.json")
      return new Response(await readFile(join(root, "examples/browser-demo/catalog.json")), {
        headers: { "content-type": "application/json" },
      });
    if (path === "/almostnode.mjs")
      return new Response(await readFile(join(cache, "almostnode.mjs")), {
        headers: { "content-type": "text/javascript" },
      });
    if (path === "/esbuild.wasm")
      return new Response(await readFile(join(deps, "node_modules/esbuild-wasm/esbuild.wasm")), {
        headers: { "content-type": "application/wasm" },
      });
    if (path.startsWith("/fixtures/")) {
      const fixturePath = decodeURIComponent(path.slice("/fixtures/".length));
      const fixtureName = fixturePath.split("/")[0]!;
      const fixtureRoot = join(root, "fixtures/extensions", fixtureName);
      const relativePath = fixturePath.slice(fixtureName.length).replace(/^\//, "");
      if (!(await exists(fixtureRoot))) return new Response("Not found", { status: 404 });
      if (relativePath === "__files") return Response.json(await relativeFiles(fixtureRoot));
      const fixture = join(fixtureRoot, relativePath);
      if (!(await exists(fixture))) return new Response("Not found", { status: 404 });
      return new Response(Bun.file(fixture));
    }
    return new Response("Not found", { status: 404 });
  });
  console.log(`Browser demo: http://127.0.0.1:${host.port}/`);
  const close = () => {
    host.stop();
    sandbox.stop();
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}
await main();
