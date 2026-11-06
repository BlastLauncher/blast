import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildBrowserAssets, projectRoot, relativeFiles } from "./build.ts";
import { prebuildCatalog } from "./prebuild.ts";
import { demoPage } from "./template.ts";
import type { Catalog } from "./root.ts";

export type SiteOptions = {
  siteOrigin: string;
  sandboxUrl: string;
  buildSha?: string;
  fixtures?: boolean;
};
export type SiteStats = {
  coverage: { covered: number; total: number; percent: string };
  rendered: number;
  commands: number;
};

export function parseOrigin(value: string, label = "origin"): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be an http(s) origin`);
  }
  if (
    !/^https?:$/.test(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error(`${label} must be an http(s) origin without a path`);
  return url;
}
export function parseSandboxUrl(value: string, label = "sandbox URL"): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be an http(s) URL with a path`);
  }
  if (
    !/^https?:$/.test(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname === "/" ||
    !url.pathname.endsWith("/") ||
    url.search ||
    url.hash
  )
    throw new Error(`${label} must be an http(s) URL with a trailing-slash path`);
  return url;
}
export function cnameForOrigin(value: string): string | undefined {
  const url = parseOrigin(value);
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".github.io"))
    return undefined;
  return url.hostname;
}
export function extractStats(coverage: string, sweep: string): SiteStats {
  const match =
    coverage.match(
      /Non-deprecated coverage is not reported here|Non-deprecated coverage[^\n]*?(\d+)\/(\d+) covered/i,
    ) ?? coverage.match(/\*\*Non-deprecated coverage:\s*(\d+)\/(\d+)/i);
  const covered = Number(match?.[1] ?? 0),
    total = Number(match?.[2] ?? 0);
  const rendered = Number(sweep.match(/rendered:\s*(\d+) command/i)?.[1] ?? 0);
  const commands = Number(
    sweep.match(/and\s*(\d+) commands/i)?.[1] ?? sweep.match(/(\d+) command records/i)?.[1] ?? 0,
  );
  return {
    coverage: {
      covered,
      total,
      percent: total ? `${((covered / total) * 100).toFixed(1)}%` : "0.0%",
    },
    rendered,
    commands,
  };
}
function landing(stats: SiteStats, siteOrigin: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="description" content="Blast runs Raycast-compatible extensions outside Raycast."><link rel="stylesheet" href="./site.css"><title>Blast — an engine for extension experiences</title><style>:root{font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#17202b;background:#f5f7fa;line-height:1.5}*{box-sizing:border-box}body{margin:0}a{color:inherit}.wrap{max-width:1120px;margin:auto;padding:0 24px}.nav{display:flex;align-items:center;justify-content:space-between;padding-block:24px}.mark{display:flex;align-items:center;gap:10px;font-weight:800;letter-spacing:-.03em}.mark i{display:block;width:25px;height:25px;border-radius:8px;background:#ff6338}.navlinks{display:flex;gap:20px;font-size:14px;color:#536070}.hero{padding-block:82px 76px;display:grid;grid-template-columns:1.1fr .9fr;gap:70px;align-items:center}.eyebrow{font:700 12px ui-monospace,SFMono-Regular,monospace;letter-spacing:.13em;text-transform:uppercase;color:#e34c26}.hero h1{font-size:clamp(42px,6vw,76px);line-height:1.02;letter-spacing:-.065em;margin:15px 0 24px;max-width:720px}.hero p{font-size:20px;color:#536070;max-width:600px}.buttons{display:flex;gap:12px;flex-wrap:wrap;margin-top:32px}.button{display:inline-block;padding:12px 17px;border-radius:10px;text-decoration:none;font-weight:700;background:#17202b;color:white}.button.alt{background:transparent;color:#17202b;border:1px solid #c6ced8}.console{background:#17202b;color:#f5f7fa;border-radius:18px;padding:20px;box-shadow:18px 22px 0 #dce2e9;transform:rotate(2deg)}.console .bar{display:flex;gap:6px;margin-bottom:24px}.console .bar b{width:8px;height:8px;border-radius:50%;background:#ff6338}.console code{display:block;font:14px/2 ui-monospace,SFMono-Regular,monospace}.console code span{color:#91a2b8}.section{padding-block:74px;border-top:1px solid #dce2e9}.section h2{font-size:34px;letter-spacing:-.04em;margin:0 0 12px}.section>p{color:#536070;max-width:650px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:30px}.card{background:white;border:1px solid #dce2e9;border-radius:14px;padding:24px}.card b{font-size:18px}.card p{color:#536070;font-size:15px}.number{font-size:36px;font-weight:800;letter-spacing:-.06em}.label{color:#536070;font-size:13px}.install{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:30px}.code{background:#17202b;color:#d8e1eb;border-radius:12px;padding:20px;overflow:auto;font:14px ui-monospace,SFMono-Regular,monospace}.code strong{color:#ff9f7c}.footer{padding-block:38px 58px;color:#536070;font-size:14px}.footer a{margin-right:18px}@media(prefers-color-scheme:dark){:root{color:#e7edf4;background:#10161e}.navlinks,.hero p,.section>p,.card p,.label,.footer{color:#a9b6c5}.button{background:#ff6338;color:#10161e}.button.alt{background:transparent;color:#e7edf4;border-color:#455261}.card{background:#18212c;border-color:#334151}.section{border-color:#334151}.console{box-shadow:18px 22px 0 #273342}}@media(max-width:760px){.hero{grid-template-columns:1fr;padding-top:45px;gap:38px}.wrap{padding-inline:16px}.console{transform:none}.grid,.install{grid-template-columns:1fr}.navlinks{gap:10px}.navlinks a:first-child{display:none}}</style></head><body><header class="wrap nav"><a class="mark" href="/"><i aria-hidden="true"></i>Blast</a><nav class="navlinks" aria-label="Primary"><a href="${siteOrigin}/demo/">Try the demo</a><a href="https://github.com/blastlauncher/blast">GitHub</a></nav></header><main><section class="wrap hero"><div><div class="eyebrow">An embeddable runtime</div><h1>Extensions, outside the launcher.</h1><p>Blast runs extensions compatible with Raycast in your own product. Keep your UI, your host, and your boundaries.</p><div class="buttons"><a class="button" href="${siteOrigin}/demo/">Open the browser demo</a><a class="button alt" href="https://github.com/blastlauncher/blast/blob/main/docs/embedding.md">Read embedding docs</a></div></div><div class="console" aria-label="Example Blast session"><div class="bar"><b></b><b></b><b></b></div><code><span>$</span> blast serve</code><code><span>→</span> extension ready</code><code><span>→</span> scene published</code><code><span>→</span> your UI decides</code></div></section><section class="wrap section" aria-labelledby="ways"><h2 id="ways">Two ways to embed</h2><p>Choose the boundary that fits your host. Both expose the same engine and client semantics.</p><div class="grid"><article class="card"><b>In process</b><p>Use the engine and client core directly when your application owns the JavaScript runtime and rendering loop.</p><code>import { createEngine } from "@blastlauncher/engine"</code></article><article class="card"><b>blast serve</b><p>Run the headless engine over stdio and let any language draw scenes, route events, and broker capabilities.</p><code>npx -p @blastlauncher/serve@next blast-serve</code></article><article class="card"><b>Small by design</b><p>No launcher assumptions. Blast is a portable host you can place behind your own product surface.</p></article></div></section><section class="wrap section" aria-labelledby="status"><h2 id="status">Alpha, with receipts</h2><p>The compatibility surface is measured against the current API declarations and a broad extension sweep. It is work in progress, published plainly.</p><div class="grid"><div class="card"><div class="number">${stats.coverage.percent}</div><div class="label">non-deprecated API covered (${stats.coverage.covered}/${stats.coverage.total})</div></div><div class="card"><div class="number">${stats.rendered.toLocaleString()}</div><div class="label">commands rendered in the sweep</div></div><div class="card"><div class="number">${stats.commands.toLocaleString()}</div><div class="label">commands measured</div></div></div></section><section class="wrap section" aria-labelledby="install"><h2 id="install">Start with npm</h2><div class="install"><pre class="code"><strong>npm install</strong> @blastlauncher/engine@next</pre><pre class="code"><strong>npm install</strong> @blastlauncher/client-core@next</pre></div></section></main><footer class="wrap footer"><a href="https://github.com/blastlauncher/blast">GitHub</a><a href="https://github.com/blastlauncher/blast/blob/main/docs/embedding.md">Embedding guide</a><a href="${siteOrigin}/demo/">Demo</a><span>Blast is alpha software.</span></footer></body></html>`;
}

export async function buildSite(
  options: SiteOptions,
): Promise<{ www: string; sandbox: string; stats: SiteStats }> {
  const site = parseOrigin(options.siteOrigin, "--site-origin");
  const sandboxUrl = parseSandboxUrl(options.sandboxUrl, "--sandbox-url");
  const buildSha = options.buildSha ?? process.env.GITHUB_SHA ?? "local";
  const stats = extractStats(
    await readFile(join(projectRoot, "compat/COVERAGE.md"), "utf8"),
    await readFile(join(projectRoot, "compat/SWEEP.md"), "utf8"),
  );
  const output = join(projectRoot, ".cache", "site");
  await rm(output, { recursive: true, force: true });
  const www = join(output, "www"),
    sandbox = join(output, "sandbox"),
    demo = join(www, "demo");
  await mkdir(demo, { recursive: true });
  await mkdir(sandbox, { recursive: true });
  const assets = await buildBrowserAssets();
  await writeFile(join(www, "index.html"), landing(stats, site.origin));
  await writeFile(
    join(www, "site.css"),
    ".button:focus-visible,a:focus-visible,input:focus-visible{outline:3px solid #ff6338;outline-offset:3px}\n",
  );
  await writeFile(
    join(www, "404.html"),
    '<!doctype html><title>Blast — not found</title><p>That page is not here. <a href="/">Go home</a>.</p>\n',
  );
  await writeFile(join(www, ".nojekyll"), "");
  await writeFile(join(demo, "index.html"), demoPage(sandboxUrl.href, "./", options.fixtures));
  await cp(join(projectRoot, "examples/browser-demo/demo.css"), join(demo, "demo.css"));
  await writeFile(join(demo, "client.js"), assets.clientJs);
  await writeFile(join(demo, "almostnode.mjs"), assets.almost);
  await writeFile(join(demo, "esbuild.wasm"), assets.wasm);
  await writeFile(join(demo, "blast-sources.json"), JSON.stringify(assets.sources));
  const catalog = JSON.parse(
    await readFile(join(projectRoot, "examples/browser-demo/catalog.json"), "utf8"),
  ) as Catalog;
  if (options.fixtures) {
    catalog.extensions.push({
      name: "hello-list",
      title: "Hello List",
      commands: [{ name: "index", title: "Hello List", mode: "view" }],
    });
    catalog.extensions.push({
      name: "browser-storage",
      title: "Browser Storage",
      commands: [{ name: "index", title: "Browser Storage", mode: "view" }],
    });
    catalog.extensions.push({
      name: "browser-preferences",
      title: "Browser Preferences",
      commands: [{ name: "index", title: "Browser Preferences", mode: "view" }],
    });
    catalog.extensions.sort((a, b) =>
      String((a as { name?: unknown }).name).localeCompare(String((b as { name?: unknown }).name)),
    );
  }
  await writeFile(join(demo, "catalog.json"), `${JSON.stringify(catalog)}\n`);
  if (options.fixtures)
    await cp(
      join(projectRoot, "fixtures/extensions/hello-list"),
      join(demo, "fixtures/hello-list"),
      { recursive: true },
    );
  if (options.fixtures)
    await writeFile(
      join(demo, "fixtures/hello-list/__files"),
      JSON.stringify(await relativeFiles(join(projectRoot, "fixtures/extensions/hello-list"))),
    );
  if (options.fixtures)
    await cp(
      join(projectRoot, "fixtures/extensions/browser-storage"),
      join(demo, "fixtures/browser-storage"),
      {
        recursive: true,
      },
    );
  if (options.fixtures)
    await writeFile(
      join(demo, "fixtures/browser-storage/__files"),
      JSON.stringify(await relativeFiles(join(projectRoot, "fixtures/extensions/browser-storage"))),
    );
  if (options.fixtures)
    await cp(
      join(projectRoot, "fixtures/extensions/browser-preferences"),
      join(demo, "fixtures/browser-preferences"),
      { recursive: true },
    );
  if (options.fixtures)
    await writeFile(
      join(demo, "fixtures/browser-preferences/__files"),
      JSON.stringify(
        await relativeFiles(join(projectRoot, "fixtures/extensions/browser-preferences")),
      ),
    );
  await prebuildCatalog(catalog, buildSha, demo, options.fixtures);
  await writeFile(
    join(sandbox, "index.html"),
    `<!doctype html><script type="module">import {Runtime,VirtualFS} from './almostnode-full.mjs'; const runtime=new Runtime(new VirtualFS(),{}); addEventListener('message',async e=>{if(e.data?.type==='execute'){try{const result=await runtime.execute(e.data.code,e.data.filename); parent.postMessage({type:'result',id:e.data.id,result},'*')}catch(error){parent.postMessage({type:'error',id:e.data.id,error:String(error)},'*')}}}); parent.postMessage({type:'ready'},'*');</script>`,
  );
  await writeFile(join(sandbox, "almostnode-full.mjs"), assets.sandbox);
  await writeFile(join(www, "build.json"), `${JSON.stringify({ sha: buildSha })}\n`);
  await writeFile(join(sandbox, "build.json"), `${JSON.stringify({ sha: buildSha })}\n`);
  await writeFile(
    join(sandbox, "_headers"),
    "/*\n  Access-Control-Allow-Origin: *\n  Cross-Origin-Resource-Policy: cross-origin\n",
  );
  await writeFile(join(sandbox, ".nojekyll"), "");
  await writeFile(join(sandbox, "404.html"), "<!doctype html><title>Not found</title>\n");
  const cname = cnameForOrigin(site.origin);
  if (cname) await writeFile(join(www, "CNAME"), `${cname}\n`);
  return { www, sandbox, stats };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const value = (name: string) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const siteOrigin = value("--site-origin") ?? "http://127.0.0.1:4173";
  const sandboxUrl = value("--sandbox-url") ?? "http://127.0.0.1:4174/";
  const result = await buildSite({
    siteOrigin,
    sandboxUrl,
    fixtures: args.includes("--fixtures"),
  });
  console.log(`site:build ${result.www} and ${result.sandbox}`);
}
