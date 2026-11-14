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
    const page = await browser.newPage();
    await page.addInitScript(() => {
      const state = globalThis as typeof globalThis & { blastClipboard?: string };
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: async (value: string) => (state.blastClipboard = value) },
      });
    });
    page.on("pageerror", (error) => console.error(`[pageerror] ${error.message}`));
    const url = `http://127.0.0.1:${host.port}/?fixtures&sandbox=${encodeURIComponent(`http://127.0.0.1:${sandbox.port}/`)}`;
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
    const rooted = await browser.newPage();
    await rooted.goto(`${url}&root`, { waitUntil: "load" });
    await rooted.locator("#app li[data-id]:has-text('index')").waitFor({ timeout: 120_000 });
    await rooted.keyboard.press("Enter");
    await rooted.locator("#app li[data-id]:has-text('cherry')").waitFor({ timeout: 120_000 });
    console.log(JSON.stringify({ pass: true, rows: 3, copied, root: true }));
  } finally {
    await browser.close();
  }
} finally {
  host.stop();
  sandbox.stop();
}
