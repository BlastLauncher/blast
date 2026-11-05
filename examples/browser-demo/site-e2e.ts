import { existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { buildSite } from "./site.ts";
import { projectRoot } from "./build.ts";

type BrowserElement = {
  textContent: string | null;
  getBoundingClientRect(): { top: number; bottom: number; height: number };
};
type BrowserDocument = {
  scrollingElement?: { scrollHeight: number };
  querySelector<T extends BrowserElement = BrowserElement>(selector: string): T | null;
};
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
    page.on("console", (message) => console.error(`[browser:${message.type()}] ${message.text()}`));
    page.on("pageerror", (error) => console.error(`[pageerror] ${error.message}`));
    page.on("response", (response) => {
      if (response.status() >= 400)
        console.error(`[response:${response.status()}] ${response.url()}`);
    });
    await page.goto(`http://127.0.0.1:${wwwPort}/`, { waitUntil: "load" });
    await page.getByRole("heading", { name: "Extensions, outside the launcher." }).waitFor();
    await page.getByRole("link", { name: "Open the browser demo" }).click();
    await page.locator("#root-search").waitFor();
    if ((await page.locator('[role="option"]').count()) < 237)
      throw new Error("catalog should render at least 237 command options");
    const panelHeight = await page.evaluate(
      () => document.querySelector("main.root")?.getBoundingClientRect().height ?? 0,
    );
    if (!panelHeight || panelHeight > 520)
      throw new Error(`launcher panel is too tall: ${panelHeight}`);
    const documentHeight = await page.evaluate(() => document.scrollingElement?.scrollHeight ?? 0);
    if (documentHeight > 801) throw new Error(`page unexpectedly scrolls: ${documentHeight}px`);
    for (let index = 0; index < 30; index++) await page.keyboard.press("ArrowDown");
    const selectedPosition = await page.evaluate(() => {
      const selected = document.querySelector('[role="option"][aria-selected="true"]');
      const list = document.querySelector(".root-options");
      if (!selected || !list) return null;
      const row = selected.getBoundingClientRect();
      const box = list.getBoundingClientRect();
      return {
        visible: row.top >= box.top - 1 && row.bottom <= box.bottom + 1,
        row: [row.top, row.bottom],
        box: [box.top, box.bottom],
      };
    });
    if (!selectedPosition?.visible)
      throw new Error(
        `selected option was not kept in the visible list: ${JSON.stringify(selectedPosition)}`,
      );
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
    if (!(await page.locator(".breadcrumb").textContent())?.includes("Hello List"))
      throw new Error("extension breadcrumb did not show the fixture title");
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
