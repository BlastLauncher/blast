import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildBrowserAssets, projectRoot, relativeFiles } from "./build.ts";

function html(sandboxOrigin: string, base = "/") {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Blast demo</title><style>:root{color-scheme:dark}body{font:14px system-ui,-apple-system,sans-serif;max-width:760px;margin:3rem auto;background:#111;color:#eee}main{background:#1b1b1d;border:1px solid #39393d;border-radius:14px;overflow:hidden;box-shadow:0 18px 55px #0008}header{padding:18px 20px 12px}h1{font-size:16px;margin:0 0 12px}input{background:#252528;color:inherit;border:1px solid #4b4b50;border-radius:8px;padding:.7rem;width:100%;box-sizing:border-box}.rows{margin:0;padding:0;list-style:none}.rows li{min-height:40px;box-sizing:border-box;padding:7px 20px;display:flex;align-items:center;gap:11px}.rows li.selected{background:#34343a;outline:1px solid #666}.root-copy{display:flex;flex-direction:column;flex:1;min-width:0}.root-copy strong,.root-copy small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.root-copy small{color:#aaa}.root-accessory{color:#999;font-size:12px}.root-icon{width:24px;text-align:center;font-size:18px}.empty{padding:18px 20px;color:#aaa}footer{display:flex;justify-content:space-between;border-top:1px solid #333;padding:11px 20px;color:#aaa;font-size:12px}#status{padding:8px 20px;color:#aaa}#status[data-error=true]{color:#ff8b8b}.actions{padding:18px}.actions li{padding:10px}.breadcrumb{color:#aaa;margin:5px 0 12px}@media(prefers-color-scheme:light){:root{color-scheme:light}body{background:#f2f2f4;color:#171719}main{background:#fff;border-color:#ddd}.rows li.selected{background:#e8e8ed}.root-copy small,.root-accessory,footer,#status,.breadcrumb{color:#666}input{background:#f7f7f8;border-color:#bbb}}</style></head><body><p id="status">Loading catalog…</p><div id="app"></div><script>window.__BLAST_SANDBOX__=${JSON.stringify(sandboxOrigin)}</script><script type="module" src="${base}client.js"></script></body></html>`;
}
async function main() {
  const assets = await buildBrowserAssets();
  const sandbox = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (request) => {
      if (new URL(request.url).pathname === "/almostnode-full.mjs")
        return new Response(assets.sandbox, { headers: { "content-type": "text/javascript" } });
      return new Response(
        `<!doctype html><script type="module">import {Runtime,VirtualFS} from '/almostnode-full.mjs'; const runtime=new Runtime(new VirtualFS(),{}); addEventListener('message',async e=>{if(e.data?.type==='execute'){try{const result=await runtime.execute(e.data.code,e.data.filename); parent.postMessage({type:'result',id:e.data.id,result},'*')}catch(error){parent.postMessage({type:'error',id:e.data.id,error:String(error)},'*')}}}); parent.postMessage({type:'ready'},'*');</script>`,
        { headers: { "content-type": "text/html" } },
      );
    },
  });
  const host = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (request) => {
      const path = new URL(request.url).pathname;
      if (path === "/" || path === "/index.html")
        return new Response(html(`http://127.0.0.1:${sandbox.port}/`, "/"), {
          headers: { "content-type": "text/html" },
        });
      if (path === "/client.js")
        return new Response(assets.clientJs, { headers: { "content-type": "text/javascript" } });
      if (path === "/blast-sources.json") return Response.json(assets.sources);
      if (path === "/catalog.json")
        return new Response(
          await readFile(join(projectRoot, "examples/browser-demo/catalog.json")),
          { headers: { "content-type": "application/json" } },
        );
      if (path === "/almostnode.mjs")
        return new Response(assets.almost, { headers: { "content-type": "text/javascript" } });
      if (path === "/esbuild.wasm")
        return new Response(assets.wasm, { headers: { "content-type": "application/wasm" } });
      if (path.startsWith("/fixtures/")) {
        const fixturePath = decodeURIComponent(path.slice("/fixtures/".length));
        const fixtureName = fixturePath.split("/")[0]!;
        const fixtureRoot = join(projectRoot, "fixtures/extensions", fixtureName);
        const relativePath = fixturePath.slice(fixtureName.length).replace(/^\//, "");
        if (relativePath === "__files") return Response.json(await relativeFiles(fixtureRoot));
        return new Response(Bun.file(join(fixtureRoot, relativePath)));
      }
      return new Response("Not found", { status: 404 });
    },
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
