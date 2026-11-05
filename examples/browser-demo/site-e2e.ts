import { existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { buildSite } from "./site.ts";
import { projectRoot } from "./build.ts";

type BrowserDocument = { querySelector(selector: string): { textContent: string | null } | null };
declare const document: BrowserDocument;

const browsers = process.env.PLAYWRIGHT_BROWSERS_PATH;
if (!browsers) throw new Error("PLAYWRIGHT_BROWSERS_PATH is required");
const wwwPort = 4175;
const sandboxPort = 4176;
const result = await buildSite({
  siteOrigin: `http://127.0.0.1:${wwwPort}`,
  sandboxUrl: `http://127.0.0.1:${sandboxPort}/blast-sandbox/`,
  fixtures: true,
});
function serve(root: string, basePath = "/") {
  return Bun.serve({
    hostname: "127.0.0.1",
    port: root === result.www ? wwwPort : sandboxPort,
    fetch: async (request) => {
      const pathname = decodeURIComponent(new URL(request.url).pathname);
      if (!pathname.startsWith(basePath)) return new Response("Not found", { status: 404 });
      const urlPath = pathname.slice(basePath.length).replace(/^\/+/, "");
      const path = join(
        root,
        urlPath.endsWith("/") ? `${urlPath}index.html` : urlPath || "index.html",
      );
      const safe = relative(root, path);
      if (safe.startsWith(`..${sep}`) || safe === ".." || !existsSync(path))
        return new Response("Not found", { status: 404 });
      return new Response(Bun.file(path));
    },
  });
}
const www = serve(result.www),
  sandbox = serve(result.sandbox, "/blast-sandbox/");
try {
  const { chromium } = (await import(
    join(projectRoot, ".cache/browser-demo/deps/node_modules/playwright/index.mjs")
  )) as typeof import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const resources: string[] = [];
    page.on("console", (message) => console.error(`[browser:${message.type()}] ${message.text()}`));
    page.on("pageerror", (error) => console.error(`[pageerror] ${error.message}`));
    page.on("response", (response) => {
      resources.push(response.url());
      if (response.status() >= 400)
        console.error(`[response:${response.status()}] ${response.url()}`);
    });
    await page.goto(`http://127.0.0.1:${wwwPort}/`, { waitUntil: "load" });
    await page.getByRole("heading", { name: "Extensions, outside the launcher." }).waitFor();
    await page.getByRole("link", { name: "Open the browser demo" }).click();
    await page.locator("#root-search").waitFor();
    await page.locator("#root-search").fill("hello-list");
    await page.keyboard.press("Enter");
    await page
      .locator("#app #search")
      .waitFor({ timeout: 30_000 })
      .catch(async (error) => {
        throw new Error(
          `${error} status=${await page.locator("#status").textContent()} app=${await page.locator("#app").innerText()}`,
        );
      });
    if (resources.some((url) => url.includes("esbuild.wasm")))
      throw new Error("prebuilt fixture launch requested esbuild.wasm");
    await page.locator("#app #search").fill("ban");
    await page.waitForFunction(
      () => (document.querySelector("#app")?.textContent ?? "").includes("banana"),
      undefined,
      { timeout: 30_000 },
    );
    await page.keyboard.press("Escape");
    if ((await page.locator("#root-search").count()) !== 1)
      throw new Error("Escape did not return to root list");
    console.log(
      JSON.stringify({
        pass: true,
        site: `http://127.0.0.1:${wwwPort}/`,
        sandbox: `http://127.0.0.1:${sandboxPort}/blast-sandbox/`,
      }),
    );
  } finally {
    await browser.close();
  }
} finally {
  www.stop();
  sandbox.stop();
}
