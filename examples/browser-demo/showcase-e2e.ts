import { join } from "node:path";

type Page = import("playwright").Page;
type Found = { textContent: string | null };
declare const document: {
  querySelector(selector: string): Found | null;
  querySelectorAll(selector: string): ArrayLike<Found>;
};

export type ShowcaseOptions = {
  /** Write `<command>-light.png` and `<command>-dark.png` here when set. */
  screenshots?: string;
};

/**
 * Open every showcase command from the root's Showcase section and check the
 * one thing it exists to show. Starts and ends at the root list. A selector
 * that matches nothing fails through `waitFor`, never silently.
 */
export async function checkShowcase(page: Page, options: ShowcaseOptions = {}): Promise<void> {
  const fail = async (message: string): Promise<never> => {
    throw new Error(`showcase: ${message}; app=${await page.locator("#app").innerText()}`);
  };
  const wait = (selector: string, timeout = 30_000) =>
    page
      .locator(selector)
      .first()
      .waitFor({ timeout })
      .catch(() => fail(`${selector} did not appear`));
  const text = async (selector: string) => {
    await wait(selector);
    return (await page.locator(selector).first().textContent()) ?? "";
  };
  const expectText = async (selector: string, expected: string) => {
    await page
      .waitForFunction(
        ([css, value]) =>
          Array.from(document.querySelectorAll(css)).some((element) =>
            (element.textContent ?? "").includes(value),
          ),
        [selector, expected] as const,
        { timeout: 15_000 },
      )
      .catch(() => fail(`no ${selector} contains "${expected}"`));
  };
  const shot = async (name: string) => {
    if (!options.screenshots) return;
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await page.waitForTimeout(150);
      await page.screenshot({ path: join(options.screenshots, `${name}-${colorScheme}.png`) });
    }
    await page.emulateMedia({ colorScheme: "light" });
  };
  const toRoot = async () => {
    for (let press = 0; press < 5 && !(await page.locator("#root-search").count()); press++) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
    }
    await wait("#root-search", 10_000);
  };
  const open = async (command: string) => {
    await toRoot();
    await page.locator("#root-search").fill("");
    // cmdk owns the list's ids, so find the row by its group and value.
    const row = `[cmdk-group]:has([cmdk-group-heading]:text-is("Showcase")) [cmdk-item][data-value="blast-showcase:${command}"]`;
    await wait(row, 10_000);
    await page.locator(row).click();
  };

  // The root opens with the Showcase section.
  await toRoot();
  await page.locator("#root-search").fill("");
  if ((await text("[cmdk-group-heading]")) !== "Showcase")
    await fail(`the first root section is ${await text("[cmdk-group-heading]")}`);
  const items = page.locator(
    '[cmdk-group]:has([cmdk-group-heading]:text-is("Showcase")) [cmdk-item]',
  );
  if ((await items.count()) !== 8) await fail(`Showcase lists ${await items.count()} commands`);
  await expectText('[cmdk-item][data-value="blast-showcase:form"]', "Every field kind");
  await shot("root");

  // List: sections, accessories, filtering, and a pushed Detail.
  await open("list");
  await expectText("#app .rows li.section-header", "Rocky planets");
  await expectText("#app .rows li", "1 moon");
  await shot("list");
  await page.locator("#app #search").fill("sat");
  await page
    .waitForFunction(
      () =>
        document.querySelectorAll("#app .rows li:not(.section-header)").length === 1 &&
        (document.querySelector("#app .rows li.selected")?.textContent ?? "").includes("Saturn"),
      undefined,
      { timeout: 10_000 },
    )
    .catch(() => fail("filtering did not leave only Saturn"));
  await page.keyboard.press("Enter");
  await expectText(".detail h1", "Saturn");
  await page.keyboard.press("Escape");
  await wait("#app .rows");

  // Detail: markdown headings, inline code, a link and an image.
  await open("detail");
  await expectText(".detail h1", "Markdown Detail");
  await expectText(".detail h2", "What you can use");
  await wait(".detail code");
  await wait('.detail a[href="https://github.com/blastlauncher/blast"]');
  if (
    !(await page.locator('.detail img[alt="Blast badge"]').getAttribute("src"))?.startsWith(
      "data:image/svg+xml",
    )
  )
    await fail("the markdown image did not render");
  await shot("detail");

  // Form: every field kind, validation, then a toast on a valid submit.
  await open("form");
  await wait('label.form-field:has-text("Name") input');
  for (const control of [
    'label.form-field:has-text("Secret") input[type="password"]',
    'label.form-field:has-text("Notes") textarea',
    'input[type="checkbox"]',
    'label.form-field:has-text("Flavor") select',
    'label.form-field:has-text("When") input[type="date"]',
    'label.form-field:has-text("Topics") select[multiple]',
  ])
    await wait(control, 10_000);
  await page.locator('label.form-field:has-text("Name") input').click();
  await page.keyboard.press("ControlOrMeta+Enter");
  await expectText(".form-error", "Name is required");
  await shot("form");
  await page.locator('label.form-field:has-text("Name") input').pressSequentially("Ada");
  await page
    .waitForFunction(() => !document.querySelector(".form-error"), undefined, { timeout: 10_000 })
    .catch(() => fail("typing a name did not clear the error"));
  await page.keyboard.press("ControlOrMeta+Enter");
  await expectText(".toast", "Thanks, Ada!");

  // Grid: titled sections of cells.
  await open("grid");
  await expectText(".grid-header", "Vegetables");
  await expectText(".grid-cell", "Apple");
  if ((await page.locator(".grid-cell").count()) !== 7)
    await fail(`the grid has ${await page.locator(".grid-cell").count()} cells`);
  await shot("grid");
  await page.keyboard.press("Enter");
  await expectText(".hud", "Picked Apple");

  // Actions: a submenu, a shortcut, open URL, and a pushed view.
  await open("actions");
  await expectText("#app .rows li", "Coffee size: Medium");
  await page.locator('#app [data-footer="actions"]').click();
  for (const title of ["Push a View", "Choose Size", "Copy Order", "Open Blast on GitHub"])
    await expectText("#app section.actions li", title);
  await shot("actions");
  await page.locator('#app section.actions li:has-text("Choose Size")').click();
  await page.locator('#app section.actions li:has-text("Large")').click();
  await expectText("#app .rows li", "Coffee size: Large");
  await page.keyboard.press("ControlOrMeta+Shift+H");
  await expectText(".hud", "Hello from a shortcut");
  await page.locator('#app [data-footer="actions"]').click();
  const opened = page.context().waitForEvent("page", { timeout: 10_000 });
  await page.locator('#app section.actions li:has-text("Open Blast on GitHub")').click();
  const github = await opened;
  if (!github.url().startsWith("https://github.com/blastlauncher/blast"))
    await fail(`Open in Browser opened ${github.url()}`);
  await github.close();
  await page.keyboard.press("Enter");
  await expectText(".detail h1", "Pushed");
  await page.keyboard.press("Escape");
  await wait("#app .rows");

  // Feedback: a toast with its own action, a HUD, and a confirm alert.
  await open("feedback");
  await expectText("#app .rows li", "Show a Toast");
  await page.keyboard.press("Enter");
  await expectText(".toast", "Saved");
  await shot("feedback");
  await page.locator('[data-toast-action="0"]').click();
  await expectText(".hud", "Undone");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await wait(".alert", 10_000);
  await page.locator('[data-alert="confirm"]').click();
  await expectText("#app .rows li", "Answer: delete");

  // Storage: the count survives closing the command and reloading the page.
  const visits = async () => {
    await expectText("#app .rows li", "Opened");
    const match = (await text("#app .rows li")).match(/Opened (\d+)/);
    return Number(match?.[1] ?? Number.NaN);
  };
  await open("storage");
  const first = await visits();
  await shot("storage");
  await toRoot();
  await page.reload({ waitUntil: "load" });
  await open("storage");
  const second = await visits();
  if (!(first >= 1 && second === first + 1)) await fail(`storage counted ${first} then ${second}`);

  // Menu bar: the menu drops from a status item in the top bar.
  await open("menu");
  await wait('.menu-bar button[data-menu-id]:has-text("Cups: 0")');
  const item = await page.locator("[data-status-item]").boundingBox();
  const menu = await page.locator('.menu-panel[data-menu-level="0"]').boundingBox();
  if (!item || !menu || item.y > 60 || menu.y < item.y + item.height - 1)
    await fail(`the menu is not under the status item: ${JSON.stringify({ item, menu })}`);
  await page.locator('.menu-bar button[data-menu-id]:has-text("Cups: 0")').click();
  await wait('.menu-bar button[data-menu-id]:has-text("Cups: 1")');
  await shot("menu");
  await toRoot();
}
