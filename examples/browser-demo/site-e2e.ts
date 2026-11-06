import { existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { buildSite } from "./site.ts";
import { projectRoot } from "./build.ts";

type BrowserElement = {
  id?: string;
  tagName?: string;
  value?: string;
  textContent: string | null;
  matches?(selector: string): boolean;
  getBoundingClientRect(): { top: number; bottom: number; height: number; width: number };
};
type BrowserDocument = {
  activeElement?: BrowserElement | null;
  scrollingElement?: { scrollHeight: number };
  documentElement: { scrollWidth: number; clientHeight: number };
  querySelector<T extends BrowserElement = BrowserElement>(selector: string): T | null;
  querySelectorAll(selector: string): { length: number };
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
    // The root list warms the sandbox ahead of the first command open.
    await page.waitForFunction(
      () => document.querySelector('iframe[data-blast="warm"]') !== null,
      undefined,
      { timeout: 30_000 },
    );
    // 0125 layout: a fixed panel, no page scroll, and selection kept in view.
    // (These checks were lost once in a merge; keep them with the flow.)
    if ((await page.locator('[role="option"]').count()) < 237)
      throw new Error("catalog should render at least 237 command options");
    const panelHeight = await page.evaluate(
      () => document.querySelector("main.root")?.getBoundingClientRect().height ?? 0,
    );
    if (!panelHeight || panelHeight > 520)
      throw new Error(`launcher panel is too tall: ${panelHeight}`);
    const documentHeight = await page.evaluate(() => document.scrollingElement?.scrollHeight ?? 0);
    if (documentHeight > 801) throw new Error(`page unexpectedly scrolls: ${documentHeight}px`);
    // On a phone the panel fits the width and the footer sits inside the viewport.
    await page.setViewportSize({ width: 390, height: 844 });
    const phone = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth,
      panel: Math.round(document.querySelector("main.root")?.getBoundingClientRect().width ?? 0),
      footerBottom: Math.round(
        document.querySelector("main.root footer")?.getBoundingClientRect().bottom ?? 0,
      ),
      viewport: document.documentElement.clientHeight,
    }));
    if (phone.page > 390 || phone.panel > 390 || phone.footerBottom > phone.viewport)
      throw new Error(`launcher does not fit a 390x844 viewport: ${JSON.stringify(phone)}`);
    await page.setViewportSize({ width: 1280, height: 800 });
    for (let index = 0; index < 30; index++) await page.keyboard.press("ArrowDown");
    const selectedPosition = await page.evaluate(() => {
      const selected = document.querySelector('[role="option"][aria-selected="true"]');
      const list = document.querySelector(".root-options");
      if (!selected || !list) return null;
      const row = selected.getBoundingClientRect();
      const box = list.getBoundingClientRect();
      return { visible: row.top >= box.top - 1 && row.bottom <= box.bottom + 1 };
    });
    if (!selectedPosition?.visible) throw new Error("selected option left the visible list");
    // Real typing keeps the root search focused while filtering its catalog.
    await page.locator("#root-search").click();
    await page.locator("#root-search").pressSequentially("browser");
    if (
      (await page.evaluate(() => document.activeElement?.id)) !== "root-search" ||
      (await page.locator("#root-search").inputValue()) !== "browser"
    )
      throw new Error("root search lost focus or text while typing");
    if ((await page.locator('[role="option"]').count()) === 0)
      throw new Error("root search did not filter to browser fixtures");
    await page.keyboard.press("Escape");
    // Footer keys are buttons: the Actions button opens the root action panel.
    await page.locator('main.root [data-footer="actions"]').click();
    await page.getByRole("option", { name: /^Run Command/ }).waitFor({ timeout: 10_000 });
    await page.keyboard.press("Escape");
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
    if ((await page.locator('iframe[data-blast="session"]').count()) !== 1)
      throw new Error("the command did not reuse the warmed sandbox");
    if (!(await page.locator(".breadcrumb").textContent())?.includes("Hello List"))
      throw new Error("extension breadcrumb did not show the fixture title");
    // Wait for the first scene; input before it is dropped by the controller.
    await page.waitForFunction(
      () => (document.querySelector("#app .rows li:nth-child(3)")?.textContent ?? "") !== "",
      undefined,
      { timeout: 30_000 },
    );
    // Arrow keys move the extension's selection.
    await page.keyboard.press("ArrowDown");
    await page.waitForFunction(
      () => (document.querySelector("#app .rows li.selected")?.textContent ?? "") === "banana",
      undefined,
      { timeout: 10_000 },
    );
    // The Actions footer button toggles the extension's action panel.
    await page.locator('#app [data-footer="actions"]').click();
    await page.locator("#app section.actions").waitFor({ timeout: 10_000 });
    await page.locator('#app [data-footer="actions"]').click();
    await page.locator("#app section.actions").waitFor({ state: "detached", timeout: 10_000 });
    await page.locator("#app #search").fill("ban");
    await page.waitForFunction(
      () => (document.querySelector("#app")?.textContent ?? "").includes("banana"),
      undefined,
      { timeout: 30_000 },
    );
    // The Back footer button leaves the extension like Esc does.
    await page.locator('#app [data-footer="back"]').click();
    await page.locator("#root-search").waitFor({ timeout: 10_000 });
    if ((await page.locator("#root-search").count()) !== 1)
      throw new Error("the Back button did not return to root list");
    if ((await page.locator('iframe[data-blast="session"]').count()) !== 0)
      throw new Error("the sandbox session outlived the extension view");

    // Keyboard fixture: long list search, shortcut dispatch, layered Escape, detail push,
    // form focus movement/submission, and a real-duration success toast.
    await page.locator("#root-search").fill("");
    await page.locator("#root-search").pressSequentially("browser-keyboard");
    await page.keyboard.press("Enter");
    await page.locator("#app #search").waitFor({ timeout: 30_000 });
    await page
      .waitForFunction(
        () => (document.querySelector("#app")?.textContent ?? "").includes("abc-special"),
        undefined,
        { timeout: 30_000 },
      )
      .catch(async (error) => {
        throw new Error(
          `${error} after browser-keyboard: ${await page.locator("#app").innerText()}`,
        );
      });
    if (!(await page.locator(".rows li").first().textContent())?.includes("Subtitle"))
      throw new Error("row subtitle did not render");
    if (!(await page.locator(".rows li").first().textContent())?.includes("Accessory"))
      throw new Error("row accessory did not render");
    await page.locator("#search").click();
    await page.locator("#search").pressSequentially("abc");
    await page.waitForFunction(
      () => document.querySelector("#search")?.value === "abc",
      undefined,
      { timeout: 10_000 },
    );
    await page.locator("#search").fill("");
    await page.waitForFunction(
      () => document.querySelectorAll("#app .rows li").length >= 40,
      undefined,
      { timeout: 10_000 },
    );
    await page.keyboard.press("Meta+Shift+C");
    await page.getByRole("heading", { name: "Shortcut ran" }).waitFor({ timeout: 10_000 });
    await page.locator('#app [data-footer="actions"]').click();
    await page.locator("#app section.actions").waitFor({ timeout: 10_000 });
    await page.keyboard.press("Escape");
    await page.locator("#app section.actions").waitFor({ state: "detached", timeout: 10_000 });
    await page.keyboard.press("Enter");
    await page.locator(".detail").waitFor({ timeout: 10_000 });
    if (
      !(await page.locator(".detail").textContent())?.includes("<script>this stays text</script>")
    )
      throw new Error("detail markdown was not escaped");
    await page.keyboard.press("Escape");
    await page.locator("#app .rows").waitFor({ timeout: 10_000 });
    await page.keyboard.press("Meta+Shift+T");
    await page.getByText("Success toast").waitFor({ timeout: 10_000 });
    await page.waitForFunction(() => !document.querySelector(".toast"), undefined, {
      timeout: 10_000,
    });
    await page.keyboard.press("Escape");
    await page.locator("#root-search").waitFor({ timeout: 10_000 });

    await page.locator("#root-search").fill("grid");
    await page.keyboard.press("Enter");
    await page.locator(".grid-cell").first().waitFor({ timeout: 30_000 });
    await page.keyboard.press("ArrowRight");
    if ((await page.locator(".grid-cell.selected").count()) !== 1)
      throw new Error("grid selection did not move");
    await page.locator("[data-dropdown-open]").click();
    await page.locator("#dropdown-search").fill("wine");
    await page.locator('[data-dropdown-value="wine"]').click();
    await page.waitForFunction(
      () => (document.querySelector("#app")?.textContent ?? "").includes("drink wine"),
      undefined,
      { timeout: 10_000 },
    );
    await page.locator('#app [data-footer="back"]').click();
    await page.locator("#root-search").waitFor({ timeout: 10_000 });

    await page.locator("#root-search").fill("feedback");
    await page.keyboard.press("Enter");
    await page.locator(".alert").waitFor({ timeout: 30_000 });
    await page.setViewportSize({ width: 390, height: 844 });
    const alertBox = await page.locator(".alert").boundingBox();
    if (!alertBox || alertBox.right > 390 || alertBox.bottom > 844)
      throw new Error("alert does not fit the phone viewport");
    await page.locator('[data-alert="dismiss"]').click();
    await page.locator(".toast").waitFor({ timeout: 10_000 });
    await page.locator('[data-toast-action="0"]').click();
    await page.locator(".hud").waitFor({ timeout: 10_000 });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.keyboard.press("Escape");
    await page.locator("#root-search").waitFor({ timeout: 10_000 });

    await page.locator("#root-search").fill("browser-form");
    await page.keyboard.press("Enter");
    await page
      .locator('input[data-field="1"]')
      .waitFor({ timeout: 30_000 })
      .catch(async (error) => {
        throw new Error(
          `${error} status=${await page.locator("#status").textContent()} app=${await page.locator("#app").innerText()}`,
        );
      });
    const firstField = page.locator('input[data-field="1"]');
    await firstField.pressSequentially("one");
    await page.keyboard.press("Tab");
    if (
      !(await page.evaluate(
        () => document.activeElement?.matches?.('input[data-field="2"]') ?? false,
      ))
    )
      throw new Error("Tab did not focus second form field");
    await page.locator('input[data-field="2"]').pressSequentially("two");
    await page.keyboard.press("Shift+Tab");
    if (
      !(await page.evaluate(
        () => document.activeElement?.matches?.('input[data-field="1"]') ?? false,
      ))
    )
      throw new Error("Shift-Tab did not return to first form field");
    await page.keyboard.press("ArrowDown");
    if ((await firstField.inputValue()) !== "one")
      throw new Error("ArrowDown changed the focused text field");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Space");
    await page.waitForFunction(
      () =>
        (document.querySelector('input[type="checkbox"]') as { checked?: boolean } | null)
          ?.checked === true,
      undefined,
      { timeout: 10_000 },
    );
    if (!(await page.locator('input[type="checkbox"]').isChecked()))
      throw new Error("Space did not toggle the checkbox");
    await page.keyboard.press("Meta+Enter");
    await page.getByRole("heading", { name: /Submitted:/ }).waitFor({ timeout: 10_000 });
    await page.keyboard.press("Escape");
    await page.locator("#root-search").waitFor({ timeout: 10_000 });
    // LocalStorage is extension-scoped and survives closing and reopening a command.
    await page.locator("#root-search").fill("browser-storage");
    await page.keyboard.press("Enter");
    await page.locator("#app #search").waitFor({ timeout: 30_000 });
    await page.waitForFunction(
      () => (document.querySelector("#app")?.textContent ?? "").includes("Storage: persists"),
      undefined,
      { timeout: 30_000 },
    );
    await page.locator('#app [data-footer="back"]').click();
    await page.locator("#root-search").waitFor({ timeout: 10_000 });
    await page.locator("#root-search").fill("browser-storage");
    await page.keyboard.press("Enter");
    await page.locator("#app #search").waitFor({ timeout: 30_000 });
    await page.waitForFunction(
      () => (document.querySelector("#app")?.textContent ?? "").includes("Storage: persists"),
      undefined,
      { timeout: 30_000 },
    );
    await page.locator('#app [data-footer="back"]').click();
    await page.locator("#root-search").waitFor({ timeout: 10_000 });
    await page.locator("#root-search").fill("browser-preferences");
    await page.keyboard.press("Enter");
    await page.locator("#preferences-form").waitFor({ timeout: 30_000 });
    if (
      await page.evaluate(
        () => !(document.querySelector('#preferences-form button[type="submit"]') as any)?.disabled,
      )
    )
      throw new Error("Run should be disabled while the required preference is empty");
    await page.locator('input[name="secret"]').fill("browser-secret");
    await page.locator('#preferences-form button[type="submit"]').click();
    // The frame (and its search bar) renders before the first scene, so wait for
    // the command's own output rather than the search input.
    await page
      .waitForFunction(
        () => (document.querySelector("#app")?.textContent ?? "").includes("Secret: "),
        undefined,
        { timeout: 30_000 },
      )
      .catch(async (error) => {
        throw new Error(`${error} after preferences: ${await page.locator("#app").innerText()}`);
      });
    if (!(await page.locator("#app").textContent())?.includes("browser-secret"))
      throw new Error("preference value did not reach the command");
    if (!(await page.locator("#app").textContent())?.includes("vanilla"))
      throw new Error("preference default did not reach the command");
    await page.locator('#app [data-footer="actions"]').click();
    await page.locator('[data-action-index="0"]').click();
    await page.locator('input[name="secret"]').waitFor({ timeout: 10_000 });
    if (
      (await page.evaluate(
        () => (document.querySelector('input[name="secret"]') as any)?.value,
      )) !== "browser-secret"
    )
      throw new Error("preferences form did not reopen with its saved value");
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
