import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

const live = process.argv.includes("--live");
const browsers = process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(root, ".cache", "ms-playwright");
process.env.PLAYWRIGHT_BROWSERS_PATH = browsers;
if (!existsSync(browsers)) throw new Error(`PLAYWRIGHT_BROWSERS_PATH is missing: ${browsers}`);
const server = spawn("bun", ["examples/browser-demo/main.ts"], {
  stdio: ["ignore", "pipe", "inherit"],
  env: process.env,
});
let output = "";
server.stdout.on("data", (chunk) => {
  output += String(chunk);
});
const started = Date.now();
try {
  while (!output.includes("Browser demo:")) await new Promise((resolve) => setTimeout(resolve, 25));
  const url = output.match(/http:\/\/127\.0\.0\.1:\d+\//)?.[0];
  if (!url) throw new Error("demo URL missing");
  // The demo server installs the pinned deps (Playwright included) before it
  // prints its URL, so import Playwright only now; a static import fails on a
  // fresh checkout.
  const { chromium } = (await import(
    join(root, ".cache/browser-demo/deps/node_modules/playwright/index.mjs")
  )) as typeof import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      const state = globalThis as typeof globalThis & {
        blastClipboard?: string;
        blastOpened?: string[];
      };
      state.blastClipboard = "";
      state.blastOpened = [];
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: async (value: string) => (state.blastClipboard = value) },
      });
      window.open = ((targetUrl?: string | URL) => {
        state.blastOpened?.push(String(targetUrl ?? ""));
        return null;
      }) as typeof window.open;
    });
    if (!live) {
      await page.route("**/catalog.json", (route) =>
        route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            commit: "fixture",
            extensions: [
              {
                name: "hello-list",
                title: "Hello List",
                commands: [{ name: "index", title: "Hello List", mode: "view" }],
              },
              {
                name: "other-extension",
                title: "Other Extension",
                commands: [{ name: "index", title: "Other Command", mode: "view" }],
              },
            ],
          }),
        }),
      );
    }
    page.on("console", (message) => console.error(`[browser:${message.type()}] ${message.text()}`));
    page.on("pageerror", (error) => console.error(`[pageerror] ${error.message}`));
    page.on("response", (response) => {
      if (response.status() >= 400)
        console.error(`[response:${response.status()}] ${response.url()}`);
    });
    await page.goto(url, { waitUntil: "load" });
    await page.locator("#root-search").waitFor();
    if (live) {
      await page.locator("#root-search").fill("ratio-calculator");
      await page.keyboard.press("Enter");
    } else {
      await page.keyboard.press("Control+K");
      for (const action of ["Run Command", "Open Extension on GitHub", "Copy Extension URL"])
        await page.getByRole("option", { name: new RegExp(`^${action}`) }).waitFor();
      await page.keyboard.press("Escape");
      await page.keyboard.press("Control+K");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      const copied = await page.evaluate(
        () => (globalThis as typeof globalThis & { blastClipboard?: string }).blastClipboard,
      );
      if (copied !== "https://github.com/raycast/extensions/tree/fixture/extensions/hello-list")
        throw new Error(`unexpected copied extension URL: ${copied}`);
      await page.keyboard.press("Control+K");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      const opened = await page.evaluate(
        () => (globalThis as typeof globalThis & { blastOpened?: string[] }).blastOpened,
      );
      if (
        !opened?.includes(
          "https://github.com/raycast/extensions/tree/fixture/extensions/hello-list",
        )
      )
        throw new Error(`unexpected opened extension URL: ${JSON.stringify(opened)}`);
      await page.keyboard.press("Escape");
      const options = page.locator('[role="option"]');
      const before = await options.count();
      await page.locator("#root-search").fill("hello");
      // Typing must really filter the catalog, not just leave the list as is.
      await page.waitForFunction(
        (total) => {
          const rows = document.querySelectorAll('[role="option"]').length;
          return rows > 0 && rows < total;
        },
        before,
        { timeout: 10_000 },
      );
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
    }
    await page
      .waitForFunction(() => document.querySelector("#app #search") !== null, live, {
        timeout: live ? 120_000 : 120_000,
      })
      .catch(async (error) => {
        throw new Error(`${error}\nstatus=${await page.locator("#status").textContent()}`);
      });
    await page.locator("#search").fill("ban");
    if (!live) {
      // hello-list starts with apple, banana and cherry, so "banana is shown"
      // proves nothing; the search must have removed the other rows.
      await page
        .waitForFunction(
          () => {
            const text = document.querySelector("#app")?.textContent ?? "";
            return text.includes("banana") && !text.includes("apple") && !text.includes("cherry");
          },
          { timeout: 30_000 },
        )
        .catch(async () => {
          throw new Error(
            `search did not filter to banana: ${await page.locator("#app").innerText()}`,
          );
        });
      // The primary action copies; the page's fake handler records it.
      await page.keyboard.press("Enter");
      await page
        .waitForFunction(
          () => (document.querySelector("#status")?.textContent ?? "").includes("Copied"),
          { timeout: 30_000 },
        )
        .catch(async () => {
          throw new Error(
            `clipboard.copy did not reach the host: ${await page.locator("#status").textContent()}`,
          );
        });
      await page.keyboard.press("Escape");
      await page.locator("#root-search").waitFor();
      // Back at the root, the sandbox session must be gone, not just hidden.
      if ((await page.locator("iframe").count()) !== 0)
        throw new Error("Esc returned to the root list but the sandbox iframe is still running");
      const deep = await browser.newPage();
      await deep.goto(`${url}?ext=hello-list&cmd=index`, { waitUntil: "load" });
      await deep.locator("#app #search").waitFor({ timeout: 120_000 });
      await deep.close();
    }
    const elapsed = Date.now() - started;
    const transfer = await page.evaluate(() => {
      const result: Record<string, number> = {};
      for (const entry of performance.getEntriesByType("resource") as PerformanceResourceTiming[]) {
        const resourceUrl = entry.name;
        const key = resourceUrl.includes("esbuild.wasm")
          ? "esbuild.wasm"
          : resourceUrl.includes("almostnode")
            ? "almostnode"
            : resourceUrl.includes("blast-sources") || resourceUrl.endsWith("/client.js")
              ? "Blast sources"
              : resourceUrl.includes("fixtures/") ||
                  resourceUrl.includes("raw.githubusercontent.com")
                ? "extension"
                : resourceUrl.includes("registry.npmjs.org") || resourceUrl.includes("npmjs.com")
                  ? "npm packages"
                  : "other";
        result[key] = (result[key] ?? 0) + (entry.transferSize || 0);
      }
      return result;
    });
    const bytes = Object.values(transfer).reduce((total, value) => total + value, 0);
    console.log(
      JSON.stringify({ pass: true, live, coldStartMs: elapsed, bytes, transfer }, null, 2),
    );
  } finally {
    await browser.close();
  }
} finally {
  server.kill("SIGTERM");
}
