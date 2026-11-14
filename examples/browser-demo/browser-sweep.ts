import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { buildSite } from "./site.ts";
import { depsReady, projectRoot } from "./build.ts";
import { bundleKey, parseBundleIndex } from "../../packages/web/src/bundles.ts";
import { validateCatalog, type Catalog } from "./root.ts";

type SweepElement = {
  dataset?: { kind?: string; loading?: string };
  textContent?: string | null;
  querySelector<T extends SweepElement = SweepElement>(selector: string): T | null;
  querySelectorAll<T extends SweepElement = SweepElement>(selector: string): ArrayLike<T>;
};
declare const document: {
  querySelector<T extends SweepElement = SweepElement>(selector: string): T | null;
  body: { dataset: Record<string, string | undefined> };
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
  `#app ${formFieldSelector}`,
  "#preferences-form",
  "#app .empty strong",
  "#app .toast",
  "#app .hud",
  "#app .alert",
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
  placeholders?: boolean;
  completed?: boolean;
  missingArguments?: string[];
};
export type BrowserOutcome =
  | "rendered"
  | "completed"
  | "empty"
  | "missing-arguments"
  | `capability-denied:${string}`
  | "network"
  | `runtime-error:${string}`
  | "bundle-fallback-failed"
  | "needs-preferences"
  | "rendered-with-placeholders"
  | "browser-limit"
  | "timeout";

const firstLine = (value: string) => value.split(/\r?\n/u, 1)[0]!.trim();
const compact = (value: string) => firstLine(value).replace(/\s+/gu, " ").slice(0, 240);
const networkPattern =
  /cors|cross-origin|failed to fetch|networkerror|network error|err_(?:failed|aborted|connection|name_not_resolved)|fetch failed/iu;

export function classifyBrowserOutcome(observation: BrowserObservation): BrowserOutcome {
  if (observation.timedOut) return "timeout";
  if (observation.capability) return "browser-limit";
  if (observation.bundleFallbackFailed) return "bundle-fallback-failed";
  const pageErrors = observation.pageErrors ?? [];
  const consoleErrors = observation.consoleErrors ?? [];
  const scene = observation.scene;
  // A command that already produced real content (rows, cells, a detail, form
  // fields, menu items or its own EmptyView) is rendered even when a later
  // request fails. Hyrule's broadSearch draws its whole local grid while every
  // lookup 404s; that is a rendered command with noisy network, not an empty
  // one. A client-invented "No results" placeholder does not count.
  const content =
    scene !== undefined &&
    ((scene.kind !== "root" && scene.rows > 0) ||
      scene.cells > 0 ||
      scene.detail ||
      scene.fields > 0 ||
      (scene.menuRows ?? 0) > 0 ||
      scene.hasEmptyView);
  if (
    observation.network ||
    pageErrors.some((error) => networkPattern.test(error)) ||
    consoleErrors.some((error) => networkPattern.test(error))
  )
    return content && !observation.statusError
      ? observation.placeholders
        ? "rendered-with-placeholders"
        : "rendered"
      : "browser-limit";
  if (observation.statusError || pageErrors.length > 0 || consoleErrors.length > 0)
    return `runtime-error:${compact(pageErrors[0] || consoleErrors[0] || observation.status || "runtime error")}`;
  if (observation.needsPreferences) return "needs-preferences";
  if (observation.completed) return "completed";
  if (!scene) return "timeout";
  if (content) return observation.placeholders ? "rendered-with-placeholders" : "rendered";
  if (scene.kind === "list" && scene.hasSearchBar && !scene.isLoading)
    return observation.placeholders ? "rendered-with-placeholders" : "rendered";
  // A still-loading scene with nothing to show is not proof of an empty
  // command; name the state instead of calling it empty.
  if (scene.isLoading) return "timeout";
  if (observation.missingArguments?.length) return "missing-arguments";
  return "empty";
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
  missingArguments?: string[];
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

/** How long a scene must stay unchanged before it counts as settled. */
const settleQuietMs = 700;
/** The longest a command may take to leave its loading state. */
const settleTimeoutMs = 15_000;

type SettleState = {
  kind: string;
  loading: boolean;
  content: boolean;
  statusError: boolean;
  signature: string;
};

/**
 * Wait for the command's own scene rather than a fixed delay. A fast command
 * still settles in under a second; a fetch that resolves after two seconds is
 * allowed to produce its rows, and a failed fetch is allowed to produce its
 * error toast before the snapshot is classified.
 */
async function settleScene(page: BrowserPage): Promise<SettleState> {
  const started = performance.now();
  let signature = "";
  let stableSince = started;
  let state: SettleState = {
    kind: "",
    loading: true,
    content: false,
    statusError: false,
    signature: "",
  };
  while (performance.now() - started < settleTimeoutMs) {
    state = await page.evaluate(
      (selectors) => {
        const sceneMain = document.querySelector("#app main[data-kind]");
        if (!sceneMain)
          return {
            kind: "",
            loading: true,
            content: false,
            statusError: false,
            signature: "",
          };
        const kind = sceneMain.dataset?.kind ?? "";
        const statusError = document.querySelector('#status[data-error="true"]') !== null;
        const detail = (sceneMain.querySelector(".detail")?.textContent ?? "").trim().length > 0;
        return {
          kind,
          loading: sceneMain.dataset?.loading !== "false",
          content: document.querySelector(selectors.content) !== null || detail,
          statusError,
          // Text changes when rows, empty views or feedback replace a
          // placeholder, so a slow fetch cannot be mistaken for a quiet scene.
          signature: `${kind}|${sceneMain.textContent ?? ""}|${statusError}`,
        };
      },
      { content: contentSelector },
    );
    const signatureNow = state.signature;
    if (state.statusError || state.kind === "root" || state.kind === "preferences") return state;
    if (state.kind && (state.content || !state.loading)) {
      if (signatureNow === signature) {
        if (performance.now() - stableSince >= settleQuietMs) return state;
      } else {
        signature = signatureNow;
        stableSince = performance.now();
      }
    } else {
      signature = "";
      stableSince = performance.now();
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return state;
}

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

/** Required launch arguments per `extension:command`, read from the built bundles. */
function requiredArguments(
  catalog: Catalog,
  index: ReturnType<typeof parseBundleIndex>,
): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const extension of catalog.extensions) {
    for (const command of extension.commands) {
      const declared =
        index.bundles[bundleKey(extension.name, command.name)]?.manifest?.arguments?.[
          command.name
        ] ?? [];
      const missing = declared
        .filter((argument) => argument.required)
        .map((argument) => argument.name);
      if (missing.length) result.set(`${extension.name}:${command.name}`, missing);
    }
  }
  return result;
}

async function runCommand(
  page: BrowserPage,
  item: CatalogCommand,
  baseUrl: string,
  missingArguments: string[],
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
  const deep = `${baseUrl}/demo/?sweep-placeholders&ext=${encodeURIComponent(item.url)}&cmd=${encodeURIComponent(item.command)}`;
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
    const placeholders = await page.evaluate(() => {
      const form = document.querySelector<HTMLFormElement>("#preferences-form");
      if (!form) return false;
      for (const field of form.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
        "[data-preference]",
      )) {
        if (field instanceof HTMLInputElement && field.type === "checkbox") field.checked = false;
        else if (field instanceof HTMLSelectElement) field.selectedIndex = 0;
        else field.value = "blast-smoke";
        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.dispatchEvent(new Event("change", { bubbles: true }));
      }
      form.requestSubmit();
      return true;
    });
    // A fixed wait classified commands that fetch during their first render as
    // empty (or as content before their failure toast arrived). Follow the
    // command's own loading state and DOM quiet period instead.
    await settleScene(page);
    const snapshot = await page.evaluate(
      (selectors) => {
        const sceneMain = document.querySelector<SweepElement>("#app main[data-kind]");
        const kind = sceneMain?.dataset?.kind ?? "";
        return {
          scene: sceneMain
            ? {
                kind,
                rows: kind === "root" ? 0 : sceneMain.querySelectorAll(".rows li").length,
                menuRows: sceneMain.querySelectorAll(".menu-bar button[data-menu-id]").length,
                cells: sceneMain.querySelectorAll(selectors.cells).length,
                detail: Boolean(sceneMain.querySelector(".detail")?.textContent?.trim()),
                fields: sceneMain.querySelectorAll(selectors.fields).length,
                needsPreferences: document.querySelector("#preferences-form") !== null,
                hasEmptyView: Boolean(sceneMain.querySelector(".empty strong")),
                hasSearchBar: Boolean(sceneMain.querySelector("#search")),
                isLoading: sceneMain.dataset?.loading === "true",
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
      placeholders,
      status: snapshot.status,
      statusError: snapshot.statusError,
      pageErrors,
      consoleErrors,
      ...(capability ? { capability } : {}),
      network,
      bundleFallbackFailed: bundleFallbackFailed && snapshot.statusError,
      ...(missingArguments.length ? { missingArguments } : {}),
      completed:
        item.mode === "no-view" &&
        snapshot.scene?.kind === "root" &&
        !snapshot.statusError &&
        (await page.evaluate(() => document.body.dataset.commandExit === "0", undefined)),
    };
    const outcome = classifyBrowserOutcome(observation);
    return {
      ...item,
      outcome,
      ...(snapshot.status ? { status: snapshot.status } : {}),
      pageErrors,
      consoleErrors,
      ...(missingArguments.length ? { missingArguments } : {}),
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
      result.outcome === "rendered-with-placeholders" ||
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
    `Rendered / (catalog − browser-limit): ${report.totals.rendered ?? 0} + ${report.totals["rendered-with-placeholders"] ?? 0} / (${report.commands} − ${report.totals["browser-limit"] ?? 0})`,
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
    const index = parseBundleIndex(
      JSON.parse(await readFile(join(built.www, "demo/bundles.json"), "utf8")),
    );
    const required = requiredArguments(catalog, index);
    const items = commands(catalog);
    const results: SweepResult[] = [];
    let next = 0;
    const worker = async () => {
      while (true) {
        const position = next++;
        if (position >= items.length) return;
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
          results.push(
            await runCommand(
              page,
              items[position]!,
              `http://127.0.0.1:${wwwPort}`,
              required.get(`${items[position]!.extension}:${items[position]!.command}`) ?? [],
            ),
          );
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
