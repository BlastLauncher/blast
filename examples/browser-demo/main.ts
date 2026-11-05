import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildBrowserAssets, projectRoot, relativeFiles } from "./build.ts";
import { demoPage } from "./template.ts";
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
        return new Response(demoPage(`http://127.0.0.1:${sandbox.port}/`, "/", true), {
          headers: { "content-type": "text/html" },
        });
      if (path === "/demo.css")
        return new Response(await readFile(join(projectRoot, "examples/browser-demo/demo.css")), {
          headers: { "content-type": "text/css" },
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
