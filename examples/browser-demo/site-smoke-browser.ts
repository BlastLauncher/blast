import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "./build.ts";

type SmokeImage = { naturalWidth: number };
type SmokeIframe = { src: string };
declare const document: {
  body: object;
  querySelector<T extends object = object>(selector: string): T | null;
  querySelectorAll<T extends object = object>(selector: string): Iterable<T>;
};
declare const window: { open: (...args: unknown[]) => null };
declare function getComputedStyle(value: object): {
  fontFamily: string;
  color: string;
  backgroundColor: string;
};

const siteUrl = process.argv[2];
const sandboxUrl = process.argv[3];
if (!siteUrl || !sandboxUrl)
  throw new Error("usage: bun run site:smoke:browser <site-url> <sandbox-url>");
const site = new URL(siteUrl);
const sandbox = new URL(sandboxUrl);
if (!/^https?:$/.test(site.protocol) || !/^https?:$/.test(sandbox.protocol))
  throw new Error("site and sandbox URLs must use http(s)");
const browsers = process.env.PLAYWRIGHT_BROWSERS_PATH;
if (!browsers) throw new Error("PLAYWRIGHT_BROWSERS_PATH is required");
if (!existsSync(browsers)) throw new Error(`PLAYWRIGHT_BROWSERS_PATH is missing: ${browsers}`);
const { chromium } = (await import(
  join(projectRoot, ".cache/browser-demo/deps/node_modules/playwright/index.mjs")
)) as typeof import("playwright");
await mkdir(join(projectRoot, ".cache/site-smoke"), { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors: string[] = [];
try {
  const page = await browser.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async () => undefined },
    });
    window.open = (() => null) as typeof window.open;
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(site.href, { waitUntil: "load" });
  const landingStyled = await page.evaluate(() => {
    const body = getComputedStyle(document.body);
    return body.fontFamily !== "" && body.color !== "canvastext";
  });
  if (!landingStyled) throw new Error("landing page stylesheet was not applied");
  await page.screenshot({
    path: join(projectRoot, ".cache/site-smoke/landing.png"),
    fullPage: true,
  });

  await page.goto(new URL("demo/", site).href, { waitUntil: "load" });
  await page.locator("#root-search").waitFor({ timeout: 30_000 });
  const optionCount = await page.locator('[role="option"]').count();
  if (optionCount < 200)
    throw new Error(`expected at least 200 catalog options, got ${optionCount}`);
  const demoStyled = await page.evaluate(
    () => getComputedStyle(document.body).backgroundColor !== "rgba(0, 0, 0, 0)",
  );
  if (!demoStyled) throw new Error("demo stylesheet was not applied");
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll<SmokeImage>(".root-icon img")].some(
        (image) => image.naturalWidth > 0,
      ),
    { timeout: 30_000 },
  );
  await page.screenshot({ path: join(projectRoot, ".cache/site-smoke/demo.png"), fullPage: true });
  await page.locator("#root-search").fill("ratio-calculator");
  await page.keyboard.press("Enter");
  await page.locator("#app #search").waitFor({ timeout: 120_000 });
  const status = await page.locator("#status").textContent();
  if (status?.includes("error") || status?.includes("failed"))
    throw new Error(`command failed: ${status}`);
  const iframeOrigin = await page.evaluate(() => {
    const iframe = document.querySelector<SmokeIframe>("iframe");
    return iframe?.src ? new URL(iframe.src).origin : "";
  });
  if (iframeOrigin !== sandbox.origin)
    throw new Error(`sandbox origin ${iframeOrigin} did not match ${sandbox.origin}`);
  if (errors.length || errors.some((error) => error.includes("DataCloneError")))
    throw new Error(`browser errors: ${errors.join("; ")}`);
  console.log(
    JSON.stringify({
      pass: true,
      site: site.href,
      sandbox: sandbox.href,
      options: optionCount,
      errors,
    }),
  );
} finally {
  await browser.close();
}
