import { chromium } from "../../.cache/browser-demo/deps/node_modules/playwright/index.mjs";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const live = process.argv.includes("--live");
const browsers =
  process.env.PLAYWRIGHT_BROWSERS_PATH ??
  "/Users/yukai/Projects/BlastLauncher/blast/.cache/ms-playwright";
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
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    page.on("console", (message) => console.error(`[browser:${message.type()}] ${message.text()}`));
    page.on("pageerror", (error) => console.error(`[pageerror] ${error.message}`));
    page.on("response", (response) => {
      if (response.status() >= 400)
        console.error(`[response:${response.status()}] ${response.url()}`);
    });
    await page.goto(url, { waitUntil: "load" });
    if (live)
      await page
        .locator("#extension")
        .fill("https://github.com/raycast/extensions/tree/main/extensions/ratio-calculator");
    await page.locator("#launch").click();
    await page
      .waitForFunction(() => document.querySelector("#app li") !== null, {
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
      // The primary action copies; the page's fake handler records the request.
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
    }
    const elapsed = Date.now() - started;
    const bytes = await page.evaluate(() =>
      performance
        .getEntriesByType("resource")
        .reduce(
          (total, entry) => total + ((entry as PerformanceResourceTiming).transferSize || 0),
          0,
        ),
    );
    console.log(JSON.stringify({ pass: true, live, coldStartMs: elapsed, bytes }, null, 2));
  } finally {
    await browser.close();
  }
} finally {
  server.kill("SIGTERM");
}
