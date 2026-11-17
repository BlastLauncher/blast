import { handleRequest } from "../../packages/cors-proxy/src/index.ts";
import { build } from "esbuild";
import { browserBuiltinModules } from "../../packages/web/src/browser-bundle.ts";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildWebAssets, projectRoot, relativeFiles } from "../../packages/web/build/assets.ts";
import { sandboxPage } from "../../packages/web/sandbox/page.ts";

// Loopback only, headless: the page and the sandbox are two origins on 127.0.0.1.
const here = dirname(fileURLToPath(import.meta.url));
const browsers =
  process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(projectRoot, ".cache", "ms-playwright");
process.env.PLAYWRIGHT_BROWSERS_PATH = browsers;
if (!existsSync(browsers)) throw new Error(`PLAYWRIGHT_BROWSERS_PATH is missing: ${browsers}`);

const assets = await buildWebAssets();
// Bundle already-installed clients locally: the fixture never contacts npm.
for (const name of ["node-fetch", "axios"]) {
  const bundled = await build({
    entryPoints: [join(projectRoot, "packages/shared-deps/node_modules", name, "index.js")],
    // node-fetch has no index.js at its root.
    ...(name === "node-fetch"
      ? {
          entryPoints: [
            join(projectRoot, "packages/shared-deps/node_modules/node-fetch/src/index.js"),
          ],
        }
      : {}),
    bundle: true,
    write: false,
    platform: "browser",
    format: "cjs",
    external: [
      ...browserBuiltinModules,
      ...browserBuiltinModules.map((builtin) => `node:${builtin}`),
    ],
  });
  assets.sources[`/node_modules/${name}/index.js`] = bundled.outputFiles![0]!.text;
  assets.sources[`/node_modules/${name}/package.json`] = '{"main":"index.js"}';
}
const clients = ["fetch", "xhr", "https", "node-fetch", "axios-xhr", "axios-fetch"];
const js = (body: string) => new Response(body, { headers: { "content-type": "text/javascript" } });

const sandbox = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch: (request) =>
    new URL(request.url).pathname === "/almostnode-full.mjs"
      ? js(assets.sandbox)
      : new Response(sandboxPage("/almostnode-full.mjs"), {
          headers: { "content-type": "text/html" },
        }),
});
const received: string[] = [];
const upstream = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    received.push(`${request.method} ${request.headers.get("x-test")} ${await request.text()}`);
    return Response.json({ message: "local data" });
  },
});
const proxy = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch(request) {
    request.headers.set("CF-Connecting-IP", "192.0.2.1");
    return handleRequest(
      request,
      {
        ALLOWED_ORIGINS: `http://127.0.0.1:${sandbox.port}`,
        RATE_LIMITER: { limit: async () => ({ success: true }) },
      },
      (url, init) => {
        if (url !== "https://no-cors.example.test/data.json")
          throw new Error(`Unexpected target ${url}`);
        return fetch(`http://127.0.0.1:${upstream.port}/data.json`, init);
      },
    );
  },
});
const host = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch: async (request) => {
    const path = new URL(request.url).pathname;
    if (path === "/") return new Response(Bun.file(join(here, "index.html")));
    if (path === "/blast-web.js") return js(assets.web);
    if (path === "/assets/almostnode.mjs") return js(assets.almost);
    if (path === "/assets/esbuild.mjs") return js(assets.esbuild);
    if (path === "/assets/esbuild.wasm")
      return new Response(assets.wasm, { headers: { "content-type": "application/wasm" } });
    if (path === "/assets/blast-sources.json") return Response.json(assets.sources);
    if (path.startsWith("/assets/fixtures/")) {
      const [name, ...rest] = decodeURIComponent(path.slice("/assets/fixtures/".length)).split("/");
      const directory = join(projectRoot, "fixtures/extensions", name!);
      const file = rest.join("/");
      return file === "__files"
        ? Response.json(await relativeFiles(directory))
        : new Response(Bun.file(join(directory, file)));
    }
    return new Response("Not found", { status: 404 });
  },
});

try {
  const { chromium } = (await import(
    join(projectRoot, ".cache/browser-demo/deps/node_modules/playwright/index.mjs")
  )) as typeof import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript(() => {
      const state = globalThis as typeof globalThis & { blastClipboard?: string };
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: async (value: string) => (state.blastClipboard = value) },
      });
    });
    page.on("pageerror", (error) => console.error(`[pageerror] ${error.message}`));
    const url = `http://127.0.0.1:${host.port}/?fixtures&sandbox=${encodeURIComponent(`http://127.0.0.1:${sandbox.port}/`)}`;
    // Refuse any accidental external traffic, including the deliberately fake target.
    await context.route("**/*", (route) => {
      const requestUrl = new URL(route.request().url());
      return requestUrl.hostname === "127.0.0.1" ? route.continue() : route.abort();
    });
    const rows = page.locator("#app li[data-id]");

    await page.goto(url, { waitUntil: "load" });
    await rows.first().waitFor({ timeout: 120_000 });
    const text = await page.locator("#app").innerText();
    for (const fruit of ["apple", "banana", "cherry"])
      if (!text.includes(fruit)) throw new Error(`row ${fruit} missing: ${text}`);
    // The sandbox is a different origin from the embedding page.
    const sandboxFrame = page.locator(`iframe[src^="http://127.0.0.1:${sandbox.port}/"]`);
    if ((await sandboxFrame.count()) === 0)
      throw new Error("the extension did not run in the sandbox origin");

    await page.locator("#search").fill("ban");
    await page.locator("#app li[data-id]:has-text('banana')").waitFor({ timeout: 30_000 });
    await page
      .locator("#app li[data-id]:has-text('apple')")
      .waitFor({ state: "detached", timeout: 30_000 });
    await page.keyboard.press("Enter");
    await page.locator("#status:has-text('Copied')").waitFor({ timeout: 30_000 });
    const copied = await page.evaluate(
      () => (globalThis as typeof globalThis & { blastClipboard?: string }).blastClipboard,
    );
    if (copied !== "banana") throw new Error(`primary action copied ${JSON.stringify(copied)}`);

    // root: true shows the engine root view first and launches on primary.
    const rooted = await context.newPage();
    await rooted.goto(`${url}&root`, { waitUntil: "load" });
    await rooted.locator("#app li[data-id]:has-text('index')").waitFor({ timeout: 120_000 });
    await rooted.keyboard.press("Enter");
    await rooted.locator("#app li[data-id]:has-text('cherry')").waitFor({ timeout: 120_000 });

    // Files the command reads at load time are in the sandbox's own file system,
    // and the mount's launch arguments reach the command's props.
    const assetPage = await context.newPage();
    assetPage.on("pageerror", (error) => console.error(`[pageerror] ${error.message}`));
    assetPage.on("console", (message) => {
      if (message.type() === "error") console.error(`[console] ${message.text()}`);
    });
    const label = encodeURIComponent(JSON.stringify({ label: "given" }));
    await assetPage.goto(`${url}&extension=raycast/extensions/browser-assets&arguments=${label}`, {
      waitUntil: "load",
    });
    await assetPage
      .locator("#app li[data-id]:has-text('argument')")
      .waitFor({ timeout: 120_000 })
      .catch(async (error: unknown) => {
        throw new Error(`${error} app=${await assetPage.locator("#app").innerText()}`);
      });
    const assetText = await assetPage.locator("#app").innerText();
    for (const row of [
      "nested asset",
      "bytes 0,127,128,255",
      "manifest browser-assets",
      "argument given",
    ])
      if (!assetText.includes(row)) throw new Error(`asset row ${row} missing: ${assetText}`);
    for (const proxied of [false, true]) {
      received.length = 0;
      const network = await context.newPage();
      network.on("pageerror", (error) => console.error(`[network pageerror] ${error.message}`));
      console.log(`network proxy=${proxied}`);
      await network.goto(
        `${url}&extension=raycast/extensions/browser-network${proxied ? `&fetchProxy=${encodeURIComponent(`http://127.0.0.1:${proxy.port}/v1`)}` : `&arguments=${encodeURIComponent(JSON.stringify({ target: `http://127.0.0.1:${upstream.port}/data.json` }))}`}`,
      );
      for (const client of clients)
        await network
          .locator(
            `#app li[data-id] strong:text-is('${client} ${proxied ? (client === "node-fetch" ? "status 200" : "local data") : "blocked"}')`,
          )
          .waitFor({ timeout: 30_000 })
          .catch(async (error: unknown) => {
            throw new Error(`${error} app=${await network.locator("#app").innerText()}`);
          });
      await network.close();
    }
    for (const client of clients)
      if (
        !received.includes(
          client === "node-fetch"
            ? "GET node-fetch-header "
            : `POST ${client}-header ${client}-body`,
        )
      )
        throw new Error(`Missing upstream request ${client}: ${JSON.stringify(received)}`);
    console.log(
      JSON.stringify({
        network:
          "fetch/xhr/https/axios: local data via proxy; node-fetch: status 200; all blocked direct",
        received,
      }),
    );
    console.log(JSON.stringify({ pass: true, rows: 3, copied, root: true, assets: true }));
  } finally {
    await browser.close();
  }
} finally {
  proxy.stop();
  upstream.stop();
  host.stop();
  sandbox.stop();
}
