import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { buildSite } from "./site.ts";
import { depsReady, projectRoot } from "./build.ts";
import { validateCatalog, type Catalog } from "./root.ts";

type SweepElement = {
  dataset?: { kind?: string };
  textContent?: string | null;
  querySelector<T extends SweepElement = SweepElement>(selector: string): T | null;
  querySelectorAll<T extends SweepElement = SweepElement>(selector: string): ArrayLike<T>;
};
declare const document: {
  querySelector<T extends SweepElement = SweepElement>(selector: string): T | null;
};
declare const window: { open: (...args: unknown[]) => null };

/** A grid cell is drawn as a button inside `.grid`, not as a `.rows` item. */
export const gridCellSelector = ".grid-cell";
/** Form controls carry `data-field` on input, textarea and select alike. */
export const formFieldSelector = "form [data-field]";
/** Content that means the command's first scene (or a prompt) has arrived. */
export const contentSelector = [
  "#app .rows li",
  `#app ${gridCellSelector}`,
  "#app .detail",
  `#app ${formFieldSelector}`,
  "#preferences-form",
  "#app .empty strong",
  '#status[data-error="true"]',
  "#app .menu-bar button[data-menu-id]",
].join(", ");

type SceneSnapshot = {
  kind: string;
  rows: number;
  cells: number;
  detail: boolean;
  fields: number;
  hasEmptyView: boolean;
  hasSearchBar?: boolean;
  isLoading?: boolean;
  menuRows?: number;
};
export type BrowserObservation = {
  scene?: SceneSnapshot;
  status?: string;
  statusError?: boolean;
  pageErrors?: string[];
  consoleErrors?: string[];
  capability?: string;
  network?: boolean;
  bundleFallbackFailed?: boolean;
  timedOut?: boolean;
  needsPreferences?: boolean;
  completed?: boolean;
};
export type BrowserOutcome =
  | "rendered"
  | "completed"
  | "empty"
  | `capability-denied:${string}`
  | "network"
  | `runtime-error:${string}`
  | "bundle-fallback-failed"
  | "needs-preferences"
  | "timeout";

const firstLine = (value: string) => value.split(/\r?\n/u, 1)[0]!.trim();
const compact = (value: string) => firstLine(value).replace(/\s+/gu, " ").slice(0, 240);
const networkPattern =
  /cors|cross-origin|failed to fetch|networkerror|network error|err_(?:failed|aborted|connection|name_not_resolved)|fetch failed/iu;

export function classifyBrowserOutcome(observation: BrowserObservation): BrowserOutcome {
  if (observation.timedOut) return "timeout";
  if (observation.completed) return "completed";
  if (observation.bundleFallbackFailed) return "bundle-fallback-failed";
  if (observation.needsPreferences) return "needs-preferences";
  if (observation.capability) return `capability-denied:${observation.capability}`;
  const pageErrors = observation.pageErrors ?? [];
  const consoleErrors = observation.consoleErrors ?? [];
  if (
    observation.network ||
    pageErrors.some((error) => networkPattern.test(error)) ||
    consoleErrors.some((error) => networkPattern.test(error))
  )
    return "network";
  if (observation.statusError || pageErrors.length > 0)
    return `runtime-error:${compact(pageErrors[0] || consoleErrors[0] || observation.status || "runtime error")}`;
  const scene = observation.scene;
  if (!scene) return "timeout";
  const content =
    scene.rows > 0 ||
    scene.cells > 0 ||
    scene.detail ||
    scene.fields > 0 ||
    (scene.menuRows ?? 0) > 0;
  if (content) return "rendered";
  if (scene.kind === "list" && scene.hasSearchBar && !scene.isLoading) return "rendered";
  return scene.hasEmptyView ? "rendered" : "empty";
}

type CatalogCommand = {
  extension: string;
  command: string;
  title: string;
  mode: string;
  url: string;
};
type SweepResult = {
  extension: string;
  command: string;
  title: string;
  outcome: BrowserOutcome;
  status?: string;
  pageErrors: string[];
  consoleErrors: string[];
  elapsedMs: number;
};
type Report = {
  schema: 1;
  commit: string;
  date: string;
  commands: number;
  wallTimeMs: number;
  totals: Record<string, number>;
  capabilities: Record<string, number>;
  results: SweepResult[];
};

type BrowserPage = {
  addInitScript(fn: () => void): Promise<void>;
  goto(url: string, options?: { waitUntil?: "load" }): Promise<unknown>;
  waitForFunction<T, A>(
    fn: (arg: A) => T,
    arg: A,
    options?: { timeout?: number },
  ): Promise<unknown>;
  evaluate<T, A>(fn: (arg: A) => T, arg: A): Promise<T>;
  locator(selector: string): { count(): Promise<number>; textContent(): Promise<string | null> };
  on(event: "console", fn: (message: { type(): string; text(): string }) => void): void;
  on(event: "pageerror", fn: (error: { message: string }) => void): void;
  on(event: "response", fn: (response: { status(): number; url(): string }) => void): void;
  close(): Promise<void>;
};
type Browser = {
  newPage(options?: {
    colorScheme?: "dark";
    viewport?: { width: number; height: number };
  }): Promise<BrowserPage>;
  close(): Promise<void>;
};

function serve(root: string, port: number, basePath = "/") {
  return Bun.serve({
    hostname: "127.0.0.1",
    port,
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

function commands(catalog: Catalog): CatalogCommand[] {
  return catalog.extensions
    .flatMap((extension) =>
      extension.commands.map((command) => ({
        extension: extension.name,
        command: command.name,
        title: command.title,
        mode: command.mode,
        url: `https://github.com/raycast/extensions/tree/${catalog.commit}/extensions/${extension.name}`,
      })),
    )
    .toSorted((a, b) => `${a.extension}:${a.command}`.localeCompare(`${b.extension}:${b.command}`));
}

async function runCommand(
  page: BrowserPage,
  item: CatalogCommand,
  baseUrl: string,
): Promise<SweepResult> {
  const started = performance.now();
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  let network = false;
  let bundleFallbackFailed = false;
  page.on("pageerror", (error) => pageErrors.push(compact(error.message)));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(compact(message.text()));
  });
  page.on("response", (response) => {
    if (response.status() >= 400 && networkPattern.test(response.url())) network = true;
    if (response.url().includes("/bundles/") && response.status() >= 400)
      bundleFallbackFailed = true;
  });
  const deep = `${baseUrl}/demo/?ext=${encodeURIComponent(item.url)}&cmd=${encodeURIComponent(item.command)}`;
  try {
    await page.goto(deep, { waitUntil: "load" });
    await page.waitForFunction(
      () =>
        document.querySelector("#app #search") !== null ||
        document.querySelector("#preferences-form") !== null ||
        document.querySelector('#status[data-error="true"]') !== null ||
        document.querySelector("#root-search") !== null,
      undefined,
      { timeout: 15_000 },
    );
    // The controller publishes its initial empty view before the sandbox can
    // deliver the command's first scene. Prefer a content marker, but allow
    // genuinely empty commands a bounded settle window.
    await Promise.race([
      page.waitForFunction(
        (selector) => document.querySelector(selector) !== null,
        contentSelector,
        { timeout: 15_000 },
      ),
      new Promise((resolve) => setTimeout(resolve, 2_000)),
    ]);
    const snapshot = await page.evaluate(
      (selectors) => {
        const sceneMain = document.querySelector<SweepElement>("#app main[data-kind]");
        const kind = sceneMain?.dataset?.kind ?? "";
        return {
          scene: sceneMain
            ? {
                kind,
                rows: sceneMain.querySelectorAll(".rows li").length,
                menuRows: sceneMain.querySelectorAll(".menu-bar button[data-menu-id]").length,
                cells: sceneMain.querySelectorAll(selectors.cells).length,
                detail: Boolean(sceneMain.querySelector(".detail")?.textContent?.trim()),
                fields: sceneMain.querySelectorAll(selectors.fields).length,
                needsPreferences: document.querySelector("#preferences-form") !== null,
                hasEmptyView: Boolean(sceneMain.querySelector(".empty strong")),
                hasSearchBar: Boolean(sceneMain.querySelector("#search")),
                isLoading: sceneMain.querySelector("[data-loading='true']") !== null,
              }
            : undefined,
          needsPreferences: document.querySelector("#preferences-form") !== null,
          status: document.querySelector("#status")?.textContent?.trim() ?? "",
          statusError: document.querySelector('#status[data-error="true"]') !== null,
          capability: document
            .querySelector('#status[data-error="true"]')
            ?.textContent?.match(/([a-z]+\.[a-z]+) is unavailable/u)?.[1],
        };
      },
      { cells: gridCellSelector, fields: formFieldSelector },
    );
    const capability = snapshot.capability;
    const observation: BrowserObservation = {
      ...(snapshot.scene ? { scene: snapshot.scene } : {}),
      needsPreferences: snapshot.needsPreferences,
      status: snapshot.status,
      statusError: snapshot.statusError,
      pageErrors,
      consoleErrors,
      ...(capability ? { capability } : {}),
      network,
      bundleFallbackFailed: bundleFallbackFailed && snapshot.statusError,
      completed:
        item.mode === "no-view" && snapshot.scene?.kind === "root" && !snapshot.statusError,
    };
    const outcome = classifyBrowserOutcome(observation);
    return {
      ...item,
      outcome,
      ...(snapshot.status ? { status: snapshot.status } : {}),
      pageErrors,
      consoleErrors,
      elapsedMs: Math.round(performance.now() - started),
    };
  } catch (error) {
    const timedOut = /Timeout|timeout/u.test(String(error));
    const outcome = classifyBrowserOutcome({
      pageErrors,
      consoleErrors,
      network,
      bundleFallbackFailed,
      timedOut,
      status: String(error),
    });
    return {
      ...item,
      outcome,
      pageErrors,
      consoleErrors,
      elapsedMs: Math.round(performance.now() - started),
    };
  }
}

function markdown(report: Report): string {
  const failures = new Map<string, SweepResult[]>();
  for (const result of report.results) {
    if (
      result.outcome === "rendered" ||
      result.outcome === "empty" ||
      result.outcome === "completed"
    )
      continue;
    const list = failures.get(result.outcome) ?? [];
    list.push(result);
    failures.set(result.outcome, list);
  }
  const lines = [
    "# Browser catalog sweep",
    "",
    `Catalog commit \`${report.commit}\`; date ${report.date}; ${report.commands} command records; wall time ${(report.wallTimeMs / 1000).toFixed(1)} s.`,
    "",
    "## Totals",
    "",
    ...Object.entries(report.totals).map(([outcome, count]) => `- ${outcome}: ${count} command(s)`),
    "",
    "## Failures",
    "",
    "| Signature | Commands | Examples |",
    "| --- | ---: | --- |",
    ...[...failures.entries()]
      .map(([signature, results]) => [signature, results] as const)
      .toSorted((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
      .map(
        ([signature, results]) =>
          `| ${signature.replaceAll("|", "\\|")} | ${results.length} | ${results
            .slice(0, 5)
            .map((result) => `\`${result.extension}/${result.command}\``)
            .join(", ")} |`,
      ),
    "",
    "## Capability usage",
    "",
    ...Object.entries(report.capabilities).map(([name, count]) => `- ${name}: ${count} command(s)`),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

async function main() {
  const browsers = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!browsers) throw new Error("PLAYWRIGHT_BROWSERS_PATH is required");
  if (!existsSync(browsers)) throw new Error(`PLAYWRIGHT_BROWSERS_PATH is missing: ${browsers}`);
  const wwwPort = 4177;
  const sandboxPort = 4178;
  const built = await buildSite({
    siteOrigin: `http://127.0.0.1:${wwwPort}`,
    sandboxUrl: `http://127.0.0.1:${sandboxPort}/blast-sandbox/`,
  });
  const www = serve(built.www, wwwPort);
  const sandbox = serve(built.sandbox, sandboxPort, "/blast-sandbox/");
  await depsReady();
  const { chromium } = (await import(
    join(projectRoot, ".cache/browser-demo/deps/node_modules/playwright/index.mjs")
  )) as { chromium: { launch(options: { headless: boolean }): Promise<Browser> } };
  const browser = await chromium.launch({ headless: true });
  const started = performance.now();
  try {
    const catalog = validateCatalog(
      JSON.parse(await readFile(join(projectRoot, "examples/browser-demo/catalog.json"), "utf8")),
    );
    const items = commands(catalog);
    const results: SweepResult[] = [];
    let next = 0;
    const worker = async () => {
      while (true) {
        const index = next++;
        if (index >= items.length) return;
        const page = await browser.newPage({
          colorScheme: "dark",
          viewport: { width: 1280, height: 800 },
        });
        try {
          await page.addInitScript(() => {
            Object.defineProperty(navigator, "clipboard", {
              configurable: true,
              value: { writeText: async () => undefined },
            });
            window.open = (() => null) as typeof window.open;
          });
          results.push(await runCommand(page, items[index]!, `http://127.0.0.1:${wwwPort}`));
        } finally {
          await page.close();
        }
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
    results.sort((a, b) =>
      `${a.extension}:${a.command}`.localeCompare(`${b.extension}:${b.command}`),
    );
    const totals: Record<string, number> = {};
    const capabilities: Record<string, number> = {};
    for (const result of results) {
      totals[result.outcome] = (totals[result.outcome] ?? 0) + 1;
      if (result.outcome.startsWith("capability-denied:")) {
        const name = result.outcome.slice("capability-denied:".length);
        capabilities[name] = (capabilities[name] ?? 0) + 1;
      }
    }
    const report: Report = {
      schema: 1,
      commit: catalog.commit,
      date: new Date().toISOString().slice(0, 10),
      commands: results.length,
      wallTimeMs: Math.round(performance.now() - started),
      totals: Object.fromEntries(Object.entries(totals).toSorted(([a], [b]) => a.localeCompare(b))),
      capabilities: Object.fromEntries(
        Object.entries(capabilities).toSorted(([a], [b]) => a.localeCompare(b)),
      ),
      results,
    };
    await mkdir(join(projectRoot, "compat"), { recursive: true });
    await writeFile(
      join(projectRoot, "compat/browser-sweep.json"),
      `${JSON.stringify(report, null, 2)}\n`,
    );
    await writeFile(join(projectRoot, "compat/BROWSER-SWEEP.md"), markdown(report));
    console.log(
      `browser sweep: ${results.length} commands in ${(report.wallTimeMs / 1000).toFixed(1)}s`,
    );
  } finally {
    await browser.close();
    www.stop();
    sandbox.stop();
  }
}

if (import.meta.main) await main();
