import { mkdir } from "node:fs/promises";
import { join } from "node:path";

type Browser = import("playwright").Browser;
type Page = import("playwright").Page;
type PlayerWindow = { tuiPlayer?: { text(): string } };
declare const window: PlayerWindow & { scrollTo(x: number, y: number): void };
declare const document: {
  querySelector(selector: string): { style: { width: string } } | null;
};

/** A page that only mounts the built player, so the check does not depend on the landing. */
const testPage = `<!doctype html>
<meta charset="utf-8">
<title>tui-player check</title>
<body style="margin:0;background:#11111b;color:#cdd6f4">
<div id="player" style="width:900px;margin:24px"></div>
<div style="height:3000px"></div>
<script type="module">
import { mountTuiPlayer } from "/tui-player.js";
window.tuiPlayer = mountTuiPlayer(document.getElementById("player"), "/tui.cast");
</script>
`;

const screenText = (page: Page) => page.evaluate(() => window.tuiPlayer?.text() ?? "");
/** The progress bar's fill, in percent. */
const progress = async (page: Page) =>
  parseFloat(
    await page.evaluate(
      () => document.querySelector(".tui-player-progress > span")?.style.width ?? "",
    ),
  );

async function openPlayer(
  browser: Browser,
  origin: string,
  reducedMotion: "reduce" | "no-preference",
) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 760 } });
  await page.emulateMedia({ reducedMotion });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") errors.push(message.text());
  });
  await page.route(`${origin}/__tui-player.html`, (route) =>
    route.fulfill({ contentType: "text/html", body: testPage }),
  );
  await page.goto(`${origin}/__tui-player.html`, { waitUntil: "load" });
  return { page, errors };
}

/**
 * 0184: the built `/tui-player.js` replays `/tui.cast` in a ghostty-web
 * terminal: text from the recording shows within 5 s, the terminal fills the
 * element's width, Pause and leaving the viewport stop the clock, and reduced
 * motion shows the last frame without playing.
 */
export async function checkTuiPlayer(
  browser: Browser,
  origin: string,
  options: { screenshots?: string; label?: string } = {},
): Promise<void> {
  const { page, errors } = await openPlayer(browser, origin, "no-preference");
  try {
    await page
      .waitForFunction(() => window.tuiPlayer?.text().includes("Split Vertical"), undefined, {
        timeout: 5_000,
      })
      .catch(async () => {
        throw new Error(`tui-player: no recording text within 5 s:\n${await screenText(page)}`);
      });
    if (options.screenshots) {
      await mkdir(options.screenshots, { recursive: true });
      await page.locator("#player").screenshot({
        path: join(options.screenshots, `tui-player-${options.label ?? "chromium"}.png`),
      });
    }
    const box = await page.locator(".tui-player-screen").boundingBox();
    if (!box || Math.abs(box.width - 900) > 1 || box.height < 200)
      throw new Error(`tui-player: screen is ${JSON.stringify(box)}, expected 900px wide`);

    await page.getByRole("button", { name: "Pause the recording" }).click();
    const pausedText = await screenText(page),
      pausedAt = await progress(page);
    await page.waitForTimeout(1_200);
    if ((await screenText(page)) !== pausedText || (await progress(page)) !== pausedAt)
      throw new Error("tui-player: the recording kept playing while paused");
    await page.getByRole("button", { name: "Play the recording" }).click();
    await page.waitForTimeout(600);
    if ((await progress(page)) === pausedAt)
      throw new Error("tui-player: Play did not resume the recording");

    await page.evaluate(() => window.scrollTo(0, 2_400));
    await page.waitForTimeout(300);
    const away = await progress(page);
    await page.waitForTimeout(1_200);
    if ((await progress(page)) !== away)
      throw new Error("tui-player: the recording kept playing off-screen");
    if (errors.length) throw new Error(`tui-player: page errors: ${errors.join(" | ")}`);
  } finally {
    await page.close();
  }

  const still = await openPlayer(browser, origin, "reduce");
  try {
    await still.page
      .waitForFunction(() => window.tuiPlayer?.text().includes("0:engine"), undefined, {
        timeout: 5_000,
      })
      .catch(async () => {
        throw new Error(
          `tui-player: reduced motion did not show the last frame:\n${await screenText(still.page)}`,
        );
      });
    if ((await progress(still.page)) !== 100)
      throw new Error(`tui-player: reduced motion progress is ${await progress(still.page)}`);
    await still.page.getByRole("button", { name: "Play the recording" }).waitFor();
    if (still.errors.length)
      throw new Error(`tui-player: page errors: ${still.errors.join(" | ")}`);
  } finally {
    await still.page.close();
  }
}
