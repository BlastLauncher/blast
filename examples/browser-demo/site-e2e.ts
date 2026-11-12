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
  getAttribute?(name: string): string | null;
  getBoundingClientRect(): { top: number; bottom: number; height: number; width: number };
};
type BrowserDocument = {
  activeElement?: BrowserElement | null;
  scrollingElement?: { scrollHeight: number };
  documentElement: { scrollWidth: number; clientHeight: number; clientWidth: number };
  querySelector<T extends BrowserElement = BrowserElement>(selector: string): T | null;
  querySelectorAll(selector: string): { length: number };
};
type BrowserScroller = BrowserElement & { scrollTop: number };
declare const document: BrowserDocument;
declare const getComputedStyle: (element: BrowserElement) => { outlineStyle: string };

const browsers = process.env.PLAYWRIGHT_BROWSERS_PATH;
if (!browsers) throw new Error("PLAYWRIGHT_BROWSERS_PATH is required");
const browserName = process.argv.slice(2).find((value) => value === "--browser")
  ? process.argv[process.argv.indexOf("--browser") + 1]
  : "chromium";
if (browserName !== "chromium" && browserName !== "firefox")
  throw new Error(`unsupported browser: ${browserName}`);
const wwwPort = 4175;
const sandboxPort = 4176;
const firefoxLaneDone = Symbol("firefox lane done");
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
type DemoPage = import("playwright").Page;
let scrollPage: DemoPage | undefined;
/**
 * Wheel `list` to its end, redraw with `redraw` (by default a pointer move
 * across the rows), and require the offset to survive; then ↓ must bring the
 * scrolled-away selection back into view.
 */
async function expectScrollKept(
  list: string,
  selected: string,
  redraw?: () => Promise<void>,
): Promise<void> {
  const page = scrollPage!;
  const box = await page.locator(list).boundingBox();
  if (!box) throw new Error(`${list} is not visible`);
  await page.mouse.move(box.x + box.width / 2, box.y + 30);
  for (let step = 0; step < 40; step++) await page.mouse.wheel(0, 600);
  const offset = () =>
    page.evaluate((selector) => document.querySelector<BrowserScroller>(selector)?.scrollTop, list);
  await page.waitForTimeout(400);
  const bottom = await offset();
  if (!bottom) throw new Error(`${list} did not scroll`);
  await page.mouse.move(box.x + box.width / 2 + 10, box.y + box.height - 40, { steps: 4 });
  await redraw?.();
  await page.waitForTimeout(600);
  if (Math.abs((await offset())! - bottom) > 1)
    throw new Error(`${list} scroll moved from ${bottom} to ${await offset()} after a redraw`);
  // Leave the list so no hover highlight follows the next scroll.
  await page.mouse.move(box.x + box.width / 2, Math.max(1, box.y - 30));
  await page.evaluate((selector) => {
    const element = document.querySelector<BrowserScroller>(selector);
    if (element) element.scrollTop = 0;
  }, list);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let step = 0; step < 40; step++) await page.mouse.wheel(0, 600);
  await page.mouse.move(box.x + box.width / 2, Math.max(1, box.y - 30));
  await page.waitForTimeout(300);
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(300);
  const visible = await page.evaluate(
    ([listSelector, rowSelector]) => {
      const row = document.querySelector(rowSelector)?.getBoundingClientRect();
      const frame = document.querySelector(listSelector)?.getBoundingClientRect();
      // A revealed row may sit against the list's border, a pixel or two past its box.
      return !!row && !!frame && row.top >= frame.top - 4 && row.bottom <= frame.bottom + 4;
    },
    [list, selected] as const,
  );
  if (!visible) throw new Error(`↓ did not bring the ${list} selection into view`);
}
const www = serve(result.www),
  sandbox = serve(result.sandbox, "/blast-sandbox/");
try {
  const { chromium, firefox } = (await import(
    join(projectRoot, ".cache/browser-demo/deps/node_modules/playwright/index.mjs")
  )) as typeof import("playwright");
  const browser = await (browserName === "firefox" ? firefox : chromium).launch({ headless: true });
  try {
    const page = await browser.newPage();
    scrollPage = page;
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
    await page.evaluate(() => localStorage.clear());
    // The demo bar names the page and links back to the landing page.
    await page.getByText("Browser demo · alpha").waitFor();
    if (
      (await page.getByRole("link", { name: /^Blast$/ }).getAttribute("href")) !==
      `http://127.0.0.1:${wwwPort}/`
    )
      throw new Error("the demo bar does not link to the landing page");
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
    const initialSelection = await page
      .locator('[role="option"][aria-selected="true"]')
      .getAttribute("data-root-index");
    await page.keyboard.press("ArrowDown");
    const downSelection = await page
      .locator('[role="option"][aria-selected="true"]')
      .getAttribute("data-root-index");
    if (initialSelection === downSelection)
      throw new Error("ArrowDown did not move root selection");
    await page.keyboard.press("Control+N");
    const controlNSelection = await page
      .locator('[role="option"][aria-selected="true"]')
      .getAttribute("data-root-index");
    if (controlNSelection === downSelection)
      throw new Error("Control+N did not move root selection");
    await page.keyboard.press("Control+P");
    const controlPSelection = await page
      .locator('[role="option"][aria-selected="true"]')
      .getAttribute("data-root-index");
    if (controlPSelection !== downSelection)
      throw new Error("Control+P did not move root selection");
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
    // 0147 scroll: a wheel scroll stays put through redraws; a key brings the
    // selection back. The pointer leaves the list at a different row than the
    // one it scrolled from, which highlights it and redraws the launcher.
    await expectScrollKept(".root-options", '[role="option"][aria-selected="true"]');
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
    if ((await page.locator("#root-search").inputValue()) !== "")
      throw new Error("Escape did not clear the root query");
    // Footer keys are buttons: the Actions button opens the root action panel.
    await page.locator('main.root [data-footer="actions"]').click();
    await page.getByRole("option", { name: /^Run Command/ }).waitFor({ timeout: 10_000 });
    await page.locator("#root-action-search").fill("copy");
    await page.getByRole("option", { name: /Copy Extension URL/ }).waitFor({ timeout: 10_000 });
    await page.keyboard.press("Escape");
    if (await page.locator("#root-action-search").count())
      throw new Error("Escape did not close root actions");
    // 0145 focus: the caret never strands outside the search field.
    const activeId = () => page.evaluate(() => document.activeElement?.id ?? "");
    const typesIntoRoot = async (label: string) => {
      await page.locator("#root-search").waitFor({ timeout: 10_000 });
      await page.waitForFunction(() => document.activeElement?.id === "root-search", undefined, {
        timeout: 5_000,
      });
      // Two keys: the first changes the highlighted row, which is when cmdk
      // used to move focus to the list.
      await page.keyboard.type("zq");
      const query = await page.locator("#root-search").inputValue();
      if (!query.endsWith("zq"))
        throw new Error(`${label}: typing reached ${await activeId()}, query ${query}`);
      await page.locator("#root-search").fill("");
    };
    const openHello = async () => {
      await page.locator("#root-search").fill("hello-list");
      await page.keyboard.press("Enter");
      await page.waitForFunction(
        () => (document.querySelector("#app .rows li:nth-child(3)")?.textContent ?? "") !== "",
        undefined,
        { timeout: 30_000 },
      );
    };
    // Pressing a row keeps focus in the search field, so the list draws no ring.
    await page.locator("#root-search").fill("hello-list");
    const row = await page
      .getByRole("option", { name: /Hello List/ })
      .first()
      .boundingBox();
    if (!row) throw new Error("hello-list row is not visible");
    await page.mouse.move(row.x + 40, row.y + row.height / 2);
    await page.mouse.down();
    const pressed = await page.evaluate(() => ({
      active: document.activeElement?.id,
      outline: getComputedStyle(document.querySelector(".root-options")!).outlineStyle,
    }));
    if (pressed.active !== "root-search" || pressed.outline !== "none")
      throw new Error(`pressing a root row moved focus: ${JSON.stringify(pressed)}`);
    await page.mouse.up();
    await page.waitForFunction(
      () => (document.querySelector("#app .rows li:nth-child(3)")?.textContent ?? "") !== "",
      undefined,
      { timeout: 30_000 },
    );
    // A pushed view focuses its own search field.
    if ((await activeId()) !== "search")
      throw new Error(`opened command did not focus its search: ${await activeId()}`);
    await page.keyboard.press("Escape");
    await typesIntoRoot("Esc from hello-list");
    await openHello();
    // Clicking a row or closing the action panel leaves the caret in search.
    await page.locator("#app .rows li:nth-child(2)").click();
    await page.locator('#app [data-footer="actions"]').click();
    await page.locator("#app section.actions").waitFor({ timeout: 10_000 });
    await page.keyboard.press("Escape");
    await page.locator("#app section.actions").waitFor({ state: "detached", timeout: 10_000 });
    if ((await activeId()) !== "search")
      throw new Error(`closing actions did not refocus search: ${await activeId()}`);
    await page.locator('#app [data-footer="back"]').click();
    await typesIntoRoot("Back button from hello-list");
    await page.keyboard.press("ControlOrMeta+K");
    await page.locator("#root-action-search").waitFor({ timeout: 10_000 });
    await page.keyboard.press("Escape");
    await page.locator("#root-action-search").waitFor({ state: "detached", timeout: 10_000 });
    await typesIntoRoot("closing ⌘K");
    // Tab still reaches real controls, and they show a focus ring.
    await page.keyboard.press("Tab");
    const tabbed = await page.evaluate(() => {
      const active = document.activeElement;
      return {
        tag: active?.tagName,
        visible: active?.matches?.(":focus-visible") ?? false,
        outline: active ? getComputedStyle(active).outlineStyle : "none",
      };
    });
    if (tabbed.tag !== "BUTTON" || !tabbed.visible || tabbed.outline === "none")
      throw new Error(`Tab did not reach a control with a ring: ${JSON.stringify(tabbed)}`);
    await page.locator("#root-search").click();

    await page.locator("#root-search").fill("hello-list");
    await page.keyboard.press("Enter");
    await page
      .waitForFunction(
        () => {
          const app = document.querySelector("#app");
          return (
            (app?.textContent ?? "").includes("banana") &&
            document.querySelector("#status")?.getAttribute?.("data-error") !== "true"
          );
        },
        undefined,
        { timeout: 30_000 },
      )
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
    await page.locator("#root-search").fill("");
    await page.locator('[cmdk-group-heading]:has-text("Recent")').waitFor({ timeout: 10_000 });
    await page
      .getByRole("option", { name: /Hello List/ })
      .first()
      .click();
    await page
      .waitForFunction(
        () => (document.querySelector(".breadcrumb")?.textContent ?? "").includes("Hello List"),
        undefined,
        { timeout: 30_000 },
      )
      .catch(async (error) => {
        throw new Error(
          `${error} status=${await page.locator("#status").textContent()} app=${await page.locator("#app").innerText()}`,
        );
      });
    if (!(await page.locator(".breadcrumb").textContent())?.includes("Hello List"))
      throw new Error("launching a command from Recent failed");
    await page.locator('#app [data-footer="back"]').click();
    await page.locator("#root-search").waitFor({ timeout: 10_000 });
    await page.reload({ waitUntil: "load" });
    await page.locator("#root-search").waitFor({ timeout: 10_000 });

    // Declared no-view commands finish back at the root and retain their HUD title.
    await page.locator("#root-search").fill("finish");
    await page.keyboard.press("Enter");
    await page
      .waitForFunction(
        () =>
          document.querySelector("#root-search") !== null &&
          (document.querySelector("#status")?.textContent ?? "").includes("Finished"),
        undefined,
        { timeout: 30_000 },
      )
      .catch(async (error) => {
        throw new Error(
          `${error} finish status=${await page.locator("#status").textContent()} app=${await page.locator("#app").innerText()}`,
        );
      });
    // Menu-bar commands draw sections, submenus and items; pointer and keyboard activate.
    await page.locator("#root-search").fill("menu");
    await page
      .getByRole("option", { name: /Menu Command/ })
      .first()
      .click();
    await page.locator(".menu-bar button[data-menu-id]").first().waitFor({ timeout: 30_000 });
    // 0147: the menu hangs from a status item at the right of the top bar.
    const menuBoxes = () =>
      page.evaluate(() => {
        const box = (selector: string) => {
          const rect = document.querySelector(selector)?.getBoundingClientRect() as
            | { left: number; right: number; top: number; bottom: number }
            | undefined;
          return rect && { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
        };
        return {
          viewport: document.documentElement.clientWidth,
          item: box("[data-status-item]"),
          github: box(".demo-github"),
          menu: box('.menu-panel[data-menu-level="0"]'),
          submenu: box('.menu-panel[data-menu-level="1"]'),
          expanded: document.querySelector("[data-status-item]")?.getAttribute?.("aria-expanded"),
        };
      });
    const placed = await menuBoxes();
    if (
      !placed.item ||
      !placed.menu ||
      !placed.github ||
      placed.expanded !== "true" ||
      placed.item.right > placed.github.left ||
      placed.item.left < placed.viewport / 2 ||
      placed.item.bottom > 60 ||
      placed.menu.top < placed.item.bottom ||
      placed.menu.top > placed.item.bottom + 12 ||
      placed.menu.right <= placed.item.left ||
      placed.menu.left > placed.item.right
    )
      throw new Error(`menu is not under a top-right status item: ${JSON.stringify(placed)}`);
    const menuText = (await page.locator(".menu-bar").textContent()) ?? "";
    if (!menuText.includes("Actions") || !menuText.includes("Direct"))
      throw new Error("menu-bar sections did not render");
    // Clicking the submenu opens it; Enter activates its item.
    await page.locator('.menu-bar button[data-menu-id]:has-text("More")').click();
    await page.locator('.menu-bar button[data-menu-id]:has-text("Nested")').waitFor({
      timeout: 10_000,
    });
    const beside = await menuBoxes();
    if (
      !beside.menu ||
      !beside.submenu ||
      !(beside.submenu.left >= beside.menu.right - 4 || beside.submenu.right <= beside.menu.left + 4)
    )
      throw new Error(`the submenu did not open beside its menu: ${JSON.stringify(beside)}`);
    await page.keyboard.press("Enter");
    // ← closes the submenu and stays in the command; the counter reached 1.
    await page.keyboard.press("ArrowLeft");
    await page
      .locator('.menu-bar button[data-menu-id]:has-text("Clicks: 1")')
      .waitFor({ timeout: 10_000 });
    // A click must step over the section header and stop on the clicked item;
    // with the header counted it would land on "Other" instead.
    await page.locator('.menu-bar button[data-menu-id]:has-text("Clicks: 1")').click();
    await page
      .locator('.menu-bar button[data-menu-id]:has-text("Clicks: 2")')
      .waitFor({ timeout: 10_000 });
    if (!(await page.locator('.menu-bar button[data-menu-id]:has-text("Other: 0")').count()))
      throw new Error("the click activated the wrong menu item");
    // Feedback from a menu item draws next to the menu, which stays open.
    await page.locator('.menu-bar button[data-menu-id]:has-text("Show HUD")').click();
    await page.locator(".hud").waitFor({ timeout: 10_000 });
    if ((await page.locator(".hud").textContent()) !== "Menu HUD")
      throw new Error(`unexpected menu HUD: ${await page.locator(".hud").textContent()}`);
    if ((await page.locator(".menu-bar").count()) !== 1)
      throw new Error("the menu disappeared after showHUD");
    await page.locator('.menu-bar button[data-menu-id]:has-text("Failure toast")').click();
    await page.locator('.toast[data-style="failure"]').waitFor({ timeout: 10_000 });
    if (!(await page.locator(".toast").textContent())?.includes("Menu toast"))
      throw new Error(`unexpected menu toast: ${await page.locator(".toast").textContent()}`);
    if ((await page.locator(".menu-bar").count()) !== 1)
      throw new Error("the menu disappeared after the failure toast");
    await page.locator('.menu-bar button[data-menu-id]:has-text("Ask")').click();
    await page.locator(".alert").waitFor({ timeout: 10_000 });
    if ((await page.locator(".menu-bar").count()) !== 1)
      throw new Error("the menu disappeared behind the alert");
    await page.locator('[data-alert="confirm"]').click();
    await page.locator(".alert").waitFor({ state: "detached", timeout: 10_000 });
    if ((await page.locator(".menu-bar").count()) !== 1)
      throw new Error("the menu did not survive answering its alert");
    // Esc at the top returns to the root list.
    await page.keyboard.press("Escape");
    await page.locator("#root-search").waitFor({ timeout: 10_000 });
    if ((await page.locator(".menu-panel").count()) !== 0) throw new Error("Esc left the menu open");
    // The status item stays in the bar and toggles the menu; a click outside closes it.
    await page.locator("[data-status-item]").click();
    await page.locator('.menu-bar button[data-menu-id]:has-text("Clicks")').waitFor({
      timeout: 30_000,
    });
    await page.locator("[data-status-item]").click();
    await page.locator("#root-search").waitFor({ timeout: 10_000 });
    await page.locator("[data-status-item]").click();
    await page.locator('.menu-bar button[data-menu-id]:has-text("Clicks")').waitFor({
      timeout: 30_000,
    });
    await page.mouse.click(40, 500);
    await page.locator("#root-search").waitFor({ timeout: 10_000 });
    if ((await page.locator('[data-status-item][aria-expanded="false"]').count()) !== 1)
      throw new Error("the status item did not stay, collapsed, after the menu closed");
    // 0147 scroll in a pushed list of 50 rows: an action-panel round trip and
    // (Chromium, where ⌘⇧C reaches the page) a fresh scene keep the offset.
    await page.locator("#root-search").fill("browser-keyboard");
    await page.keyboard.press("Enter");
    await page.waitForFunction(
      () => document.querySelectorAll("#app .rows li").length >= 40,
      undefined,
      { timeout: 30_000 },
    );
    await expectScrollKept("#app .rows", "#app .rows li.selected", async () => {
      await page.locator('#app [data-footer="actions"]').click();
      await page.locator("#app section.actions").waitFor({ timeout: 10_000 });
      await page.keyboard.press("Escape");
      await page.locator("#app section.actions").waitFor({ state: "detached", timeout: 10_000 });
      if (browserName !== "chromium") return;
      await page.keyboard.press("ControlOrMeta+Shift+C");
      await page.getByRole("heading", { name: "Shortcut ran" }).waitFor({ timeout: 10_000 });
    });
    for (let press = 0; press < 3 && !(await page.locator("#root-search").count()); press++) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
    }
    await page.locator("#root-search").waitFor({ timeout: 10_000 });

    // 0146 shortcuts, in both lanes. ControlOrMeta is ⌘ on macOS and Ctrl
    // elsewhere, the same mapping the demo applies to Raycast's `cmd`.
    const mac = await page.evaluate(() => /mac/i.test(navigator.platform));
    const cmd = (key: string) => (mac ? `⌘${key}` : `Ctrl+${key}`);
    const headingText = () => page.locator("#app h1").first().textContent();
    const waitTitle = (text: string) =>
      page
        .waitForFunction(
          (expected: string) =>
            (document.querySelector("#app h1")?.textContent ?? "").includes(expected),
          text,
          { timeout: 10_000 },
        )
        .catch(async (error) => {
          throw new Error(`${error} expected title ${text}, got ${await headingText()}`);
        });
    // A root ⌘K panel shortcut: ⌘O opens the selected extension on GitHub.
    await page
      .context()
      .route("https://github.com/**", (route) =>
        route.fulfill({ contentType: "text/plain", body: "ok" }),
      );
    await page.locator("#root-search").fill("Play Nano Snake");
    await page.keyboard.press("ControlOrMeta+K");
    await page.locator("#root-action-search").waitFor({ timeout: 10_000 });
    const openKey = await page
      .locator('main.root .actions [cmdk-item]:has-text("Open Extension on GitHub") kbd')
      .textContent();
    if (openKey !== cmd("O")) throw new Error(`root GitHub action shows ${openKey}`);
    if ((await page.locator('main.root [data-footer="actions"] kbd').textContent()) !== cmd("K"))
      throw new Error("the root Actions footer does not show the platform key");
    const opened = page.context().waitForEvent("page", { timeout: 10_000 });
    await page.keyboard.press("ControlOrMeta+O");
    const githubPage = await opened;
    if (!githubPage.url().includes("/extensions/nano-games"))
      throw new Error(`⌘O opened ${githubPage.url()}`);
    await githubPage.close();
    await page.locator("#root-action-search").waitFor({ state: "detached", timeout: 10_000 });
    // ⌘↵ runs the secondary action with the search field focused.
    await page.locator("#root-search").fill("hello-list");
    await page.keyboard.press("Enter");
    await page.waitForFunction(
      () => (document.querySelector("#app .rows li:nth-child(3)")?.textContent ?? "") !== "",
      undefined,
      { timeout: 30_000 },
    );
    if ((await activeId()) !== "search") throw new Error("hello-list search is not focused");
    const selectedFruit = (fruit: string) =>
      page.waitForFunction(
        (expected: string) =>
          (document.querySelector("#app .rows li.selected")?.textContent ?? "") === expected,
        fruit,
        { timeout: 10_000 },
      );
    await page.keyboard.press("Control+N");
    await selectedFruit("banana");
    await page.keyboard.press("Control+P");
    await selectedFruit("apple");
    await page.keyboard.press("ControlOrMeta+Enter");
    await waitTitle("pinned apple");
    // With the action panel open, the shortcut runs and closes the panel.
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ControlOrMeta+K");
    await page.locator("#app section.actions").waitFor({ timeout: 10_000 });
    await page.keyboard.press("ControlOrMeta+Enter");
    await waitTitle("pinned banana");
    await page.locator("#app section.actions").waitFor({ state: "detached", timeout: 10_000 });
    await page.keyboard.press("Escape");
    await page.locator("#root-search").waitFor({ timeout: 10_000 });
    // An action shortcut fires from the search field and with the panel open;
    // a reserved combo is muted but its action stays reachable from the panel.
    await page.locator("#root-search").fill("browser-keyboard");
    await page.keyboard.press("Enter");
    await page.waitForFunction(
      () => document.querySelectorAll("#app .rows li").length >= 40,
      undefined,
      { timeout: 30_000 },
    );
    if ((await activeId()) !== "search") throw new Error("browser-keyboard search is not focused");
    await page.keyboard.press("ControlOrMeta+Shift+C");
    await waitTitle("Shortcut ran");
    await page.keyboard.press("ControlOrMeta+K");
    await page.locator("#app section.actions").waitFor({ timeout: 10_000 });
    const reserved = page.locator(
      `#app section.actions li:has-text("Open in New Tab") small.reserved`,
    );
    if (
      (await reserved.textContent()) !== cmd("T") ||
      !(await reserved.getAttribute("title"))?.includes("Browser reserved")
    )
      throw new Error(`reserved combo is not marked: ${await reserved.count()}`);
    if (await page.locator('#app section.actions li:has-text("Run Cmd") small.reserved').count())
      throw new Error("a deliverable combo is marked reserved");
    await page.locator("#action-search").fill("new tab");
    await page.waitForFunction(
      () => document.querySelectorAll("#app section.actions li[data-action-index]").length === 1,
      undefined,
      { timeout: 10_000 },
    );
    await page.keyboard.press("Enter");
    await waitTitle("Reserved ran");
    await page.keyboard.press("Escape");
    await page.locator("#root-search").waitFor({ timeout: 10_000 });
    // Nano Snake (a real catalog command): ⌘R restarts the game, not the page.
    await page.locator("#root-search").fill("Play Nano Snake");
    await page.keyboard.press("Enter");
    const snakeText = () => page.locator("#app").textContent();
    await page
      .waitForFunction(
        () => (document.querySelector("#app")?.textContent ?? "").includes("GAME OVER"),
        undefined,
        { timeout: 60_000 },
      )
      .catch(async (error) => {
        throw new Error(
          `${error} status=${await page.locator("#status").textContent()} app=${await snakeText()}`,
        );
      });
    await page.evaluate(() => Object.assign(globalThis, { blastNoReload: true }));
    await page.keyboard.press("ControlOrMeta+R");
    await page
      .waitForFunction(
        () => (document.querySelector("#app")?.textContent ?? "").includes("Playing"),
        undefined,
        { timeout: 10_000 },
      )
      .catch(async (error) => {
        throw new Error(`${error} after ⌘R: ${await snakeText()}`);
      });
    if (!(await page.evaluate(() => "blastNoReload" in globalThis)))
      throw new Error("⌘R reloaded the page instead of restarting Nano Snake");
    if (browserName === "firefox") throw firefoxLaneDone;
    // Esc clears the game board from the search bar, then leaves.
    for (let press = 0; press < 5 && !(await page.locator("#root-search").count()); press++) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
    }
    await page.locator("#root-search").waitFor({ timeout: 10_000 });
    // Keyboard fixture: long list search, shortcut dispatch, layered Escape, detail push,
    // form focus movement/submission, and a real-duration success toast.
    await page.locator("#root-search").fill("");
    await page.locator("#root-search").pressSequentially("browser-keyboard");
    await page.keyboard.press("Enter");
    await page.keyboard.type("ab");
    await page.keyboard.press("Backspace");
    await page.keyboard.type("c");
    await page
      .waitForFunction(
        () =>
          document.querySelector("#search")?.value === "ac" &&
          (document.querySelector("#app")?.textContent ?? "").includes("ac-special"),
        undefined,
        { timeout: 30_000 },
      )
      .catch(async (error) => {
        throw new Error(
          `${error} after browser-keyboard: ${await page.locator("#app").innerText()}`,
        );
      });
    if ((await page.evaluate(() => document.activeElement?.id)) !== "search")
      throw new Error("early search input did not receive focus");
    const earlyRows = await page.locator(".rows li").count();
    if (earlyRows !== 2 || (await page.locator(".rows").innerText()).includes("item-"))
      throw new Error(
        `early search did not filter rows: ${await page.locator(".rows").innerText()}`,
      );
    const firstItem =
      (await page.locator(".rows li:not(.section-header)").first().textContent()) ?? "";
    if (!firstItem.includes("Subtitle ac-special"))
      throw new Error(`row subtitle did not render: ${firstItem}`);
    if (!firstItem.includes("Accessory ac-special"))
      throw new Error(`row accessory did not render: ${firstItem}`);
    const header = (await page.locator(".rows li.section-header").first().textContent()) ?? "";
    if (!header.includes("Items") || !header.includes("1"))
      throw new Error(`section header or filtered count did not render: ${header}`);
    await page.locator("#search").click();
    await page.locator("#search").fill("");
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
    await page.keyboard.press("ControlOrMeta+Shift+C");
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
    await page.keyboard.press("ControlOrMeta+Shift+T");
    await page.getByText("Success toast").waitFor({ timeout: 10_000 });
    await page.waitForFunction(() => !document.querySelector(".toast"), undefined, {
      timeout: 10_000,
    });
    await page.keyboard.press("Escape");
    await page.locator("#root-search").waitFor({ timeout: 10_000 });

    // Grid: selection moves in both dimensions across two rows of three cells.
    await page.locator("#root-search").fill("browser-grid");
    await page.keyboard.press("Enter");
    await page.waitForFunction(
      () => document.querySelectorAll(".grid-cell").length === 6,
      undefined,
      { timeout: 30_000 },
    );
    const expectSelected = (title: string) =>
      page
        .waitForFunction(
          (expected: string) =>
            document.querySelectorAll(".grid-cell.selected").length === 1 &&
            document.querySelector(".grid-cell.selected strong")?.textContent === expected,
          title,
          { timeout: 10_000 },
        )
        .catch(async (error) => {
          const now = await page.evaluate(
            () => document.querySelector(".grid-cell.selected strong")?.textContent ?? "none",
          );
          throw new Error(`${error} expected selected cell ${title}, got ${now}`);
        });
    await expectSelected("beer");
    await page.keyboard.press("ArrowRight");
    await expectSelected("wine");
    await page.keyboard.press("ArrowDown");
    await expectSelected("tea");
    await page.keyboard.press("ArrowLeft");
    await expectSelected("cider");
    await page.keyboard.press("ArrowUp");
    await expectSelected("beer");

    // The dropdown fits a phone viewport, filters, and chooses by keyboard and by mouse.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("[data-dropdown-open]").click();
    await page.locator(".dropdown-panel").waitFor({ timeout: 10_000 });
    const dropdownBox = await page.locator(".dropdown-panel").boundingBox();
    if (
      !dropdownBox ||
      dropdownBox.x < 0 ||
      dropdownBox.y < 0 ||
      dropdownBox.x + dropdownBox.width > 390 ||
      dropdownBox.y + dropdownBox.height > 844
    )
      throw new Error(`dropdown does not fit the phone viewport: ${JSON.stringify(dropdownBox)}`);
    await page.setViewportSize({ width: 1280, height: 800 });
    if ((await page.locator("[data-dropdown-value]").count()) !== 6)
      throw new Error("dropdown should list all six drinks");
    await page.locator("#dropdown-search").fill("w");
    await page.waitForFunction(
      () => document.querySelectorAll("[data-dropdown-value]").length === 2,
      undefined,
      { timeout: 10_000 },
    );
    for (const hidden of ["beer", "cider", "tea", "milk"])
      if ((await page.locator(`[data-dropdown-value="${hidden}"]`).count()) !== 0)
        throw new Error(`filtering "w" should hide ${hidden}`);
    const highlighted = () =>
      page.evaluate(
        () =>
          document
            .querySelector(".dropdown-panel button.selected")
            ?.getAttribute?.("data-dropdown-value") ?? "none",
      );
    if ((await highlighted()) !== "wine") throw new Error("filtered dropdown should start on wine");
    await page.keyboard.press("ArrowDown");
    if ((await highlighted()) !== "water") throw new Error("ArrowDown did not move the dropdown");
    await page.keyboard.press("ArrowUp");
    if ((await highlighted()) !== "wine") throw new Error("ArrowUp did not move the dropdown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await page.locator(".dropdown-panel").waitFor({ state: "detached", timeout: 10_000 });
    await page.getByRole("heading", { name: "drink water" }).waitFor({ timeout: 10_000 });
    // Escape closes only the dropdown; the extension stays open.
    await page.locator("[data-dropdown-open]").click();
    await page.locator(".dropdown-panel").waitFor({ timeout: 10_000 });
    await page.keyboard.press("Escape");
    await page.locator(".dropdown-panel").waitFor({ state: "detached", timeout: 10_000 });
    if ((await page.locator("#root-search").count()) !== 0)
      throw new Error("Escape with the dropdown open left the extension");
    await page.locator("[data-dropdown-open]").click();
    await page.locator('[data-dropdown-value="milk"]').click();
    await page.getByRole("heading", { name: "drink milk" }).waitFor({ timeout: 10_000 });
    await page.locator('#app [data-footer="back"]').click();
    await page.locator("#root-search").waitFor({ timeout: 10_000 });

    // Alert: buttons, Escape and Enter each answer; Tab stays inside the dialog.
    await page.locator("#root-search").fill("browser-feedback");
    await page.keyboard.press("Enter");
    await page.getByText("Answers: none").waitFor({ timeout: 30_000 });
    const answered = (answers: string) =>
      page.getByText(`Answers: ${answers}`).waitFor({ timeout: 10_000 });
    const inAlert = (selector: string) =>
      page.evaluate(
        (expected: string) => document.activeElement?.matches?.(expected) ?? false,
        selector,
      );
    await page.keyboard.press("Enter");
    await page.locator(".alert").waitFor({ timeout: 10_000 });
    await page.setViewportSize({ width: 390, height: 844 });
    const alertBox = await page.locator(".alert").boundingBox();
    if (
      !alertBox ||
      alertBox.x < 0 ||
      alertBox.y < 0 ||
      alertBox.x + alertBox.width > 390 ||
      alertBox.y + alertBox.height > 844
    )
      throw new Error(`alert does not fit the phone viewport: ${JSON.stringify(alertBox)}`);
    await page.setViewportSize({ width: 1280, height: 800 });
    if (!(await inAlert('.alert [data-alert="confirm"]')))
      throw new Error("the alert did not focus its primary button");
    await page.keyboard.press("Tab");
    if (!(await inAlert('.alert [data-alert="dismiss"]')))
      throw new Error("Tab did not wrap to the dismiss button");
    await page.keyboard.press("Shift+Tab");
    if (!(await inAlert('.alert [data-alert="confirm"]')))
      throw new Error("Shift-Tab did not wrap back to the primary button");
    for (let index = 0; index < 5; index++) await page.keyboard.press("Tab");
    if (!(await inAlert(".alert *"))) throw new Error("focus escaped the alert");
    await page.locator('[data-alert="confirm"]').click();
    await page.locator(".alert").waitFor({ state: "detached", timeout: 10_000 });
    await answered("true");
    await page.keyboard.press("Enter");
    await page.locator(".alert").waitFor({ timeout: 10_000 });
    await page.keyboard.press("Escape");
    await page.locator(".alert").waitFor({ state: "detached", timeout: 10_000 });
    await answered("true,false");
    // Escape answered the alert instead of leaving the extension.
    if ((await page.locator("#root-search").count()) !== 0)
      throw new Error("Escape on the alert left the extension");
    await page.keyboard.press("Enter");
    await page.locator(".alert").waitFor({ timeout: 10_000 });
    await page.keyboard.press("Enter");
    await page.locator(".alert").waitFor({ state: "detached", timeout: 10_000 });
    await answered("true,false,true");

    // Toast action: the HUD title only the action produces.
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await page.locator(".toast").waitFor({ timeout: 10_000 });
    if ((await page.locator(".hud").count()) !== 0)
      throw new Error("the HUD appeared before the toast action ran");
    await page.locator('[data-toast-action="0"]').click();
    await page.locator(".hud").waitFor({ timeout: 10_000 });
    if ((await page.locator(".hud").textContent()) !== "From action")
      throw new Error(`unexpected HUD: ${await page.locator(".hud").textContent()}`);
    await page.keyboard.press("Escape");
    await page.locator("#root-search").waitFor({ timeout: 10_000 });

    await page.locator("#root-search").fill("browser-form");
    await page.keyboard.press("Enter");
    await page.keyboard.type("stray");
    await page
      .locator('input[data-field="1"]')
      .waitFor({ timeout: 30_000 })
      .catch(async (error) => {
        throw new Error(
          `${error} status=${await page.locator("#status").textContent()} app=${await page.locator("#app").innerText()}`,
        );
      });
    const firstField = page.locator('input[data-field="1"]');
    if ((await firstField.inputValue()) !== "")
      throw new Error(`early form typing leaked into field 1: ${await firstField.inputValue()}`);
    if ((await page.locator('input[data-field="2"]').inputValue()) !== "initial")
      throw new Error("early form typing leaked into field 2");
    await firstField.pressSequentially("one");
    // Let the extension echo the controlled value before focus leaves, or a stale scene
    // could overwrite the text.
    await page.getByRole("heading", { name: "Name: one" }).waitFor({ timeout: 10_000 });
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
      throw new Error(`ArrowDown changed the focused text field: ${await firstField.inputValue()}`);
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
    await page.keyboard.press("ControlOrMeta+Enter");
    await page.getByRole("heading", { name: /Submitted:/ }).waitFor({ timeout: 10_000 });
    await page.keyboard.press("Escape");
    await page.locator("#root-search").waitFor({ timeout: 10_000 });
    // Every field kind round-trips through the UI and into the submitted values.
    await page.locator("#root-search").fill("browser-fields");
    await page.keyboard.press("Enter");
    await page.locator("label.form-field textarea").waitFor({ timeout: 30_000 });
    await page.waitForFunction(
      () =>
        (document.querySelector(".form-description")?.textContent ?? "").includes(
          "One of each field kind",
        ) && document.querySelectorAll(".form-separator").length === 1,
      undefined,
      { timeout: 30_000 },
    );
    if ((await page.locator(".form-description").textContent()) !== "About: One of each field kind")
      throw new Error("form description did not render its title and text");
    if ((await page.locator(".form-description + .form-field").count()) !== 1)
      throw new Error("form description is not before the first field");
    if ((await page.locator('.form-field:has-text("Notes") + .form-separator').count()) !== 1)
      throw new Error("form separator is not after Notes");
    if ((await page.locator('.form-separator + .form-field:has-text("Secret")').count()) !== 1)
      throw new Error("form separator is not before Secret");
    const field = (label: string, control: string) =>
      page.locator(`label.form-field:has-text("${label}") ${control}`);
    await field("Notes", "textarea").fill("line1\nline2");
    await field("Secret", "input").fill("hunter2");
    await field("Color", "select").selectOption("blue");
    await field("When", "input").fill("2026-03-15");
    // Alpha starts selected: this drops it and adds two, so de-selection round-trips.
    await field("Tags", "select").selectOption(["b", "c"]);
    await page.getByRole("heading", { name: "Tags: b+c" }).waitFor({ timeout: 10_000 });
    if (
      !(await page.locator(".form-unavailable").textContent())?.includes(
        "not available in the browser",
      )
    )
      throw new Error("the file picker did not show its unavailable note");
    await page.keyboard.press("ControlOrMeta+Enter");
    const submitted = page.getByRole("heading", { name: /Submitted:/ });
    await submitted.waitFor({ timeout: 10_000 });
    const values = JSON.parse(((await submitted.textContent()) ?? "").replace(/^Submitted: /, ""));
    const expected = {
      notes: "line1\nline2",
      secret: "hunter2",
      color: "blue",
      when: "2026-03-15T00:00:00.000Z",
      tags: ["b", "c"],
      files: [],
    };
    for (const [key, value] of Object.entries(expected))
      if (JSON.stringify(values[key]) !== JSON.stringify(value))
        throw new Error(
          `form value ${key}: ${JSON.stringify(values[key])} !== ${JSON.stringify(value)}`,
        );
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
        browser: browserName,
        site: `http://127.0.0.1:${wwwPort}/`,
        sandbox: `http://127.0.0.1:${sandboxPort}/blast-sandbox/`,
      }),
    );
  } catch (error) {
    if (error !== firefoxLaneDone) throw error;
    console.log(JSON.stringify({ pass: true, browser: browserName }));
  } finally {
    await browser.close();
  }
} finally {
  www.stop();
  sandbox.stop();
}
