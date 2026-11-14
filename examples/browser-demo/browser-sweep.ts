import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { buildSite } from "./site.ts";
import { depsReady, projectRoot } from "./build.ts";
import { bundleKey, parseBundleIndex } from "../../packages/web/src/bundles.ts";
import { validateCatalog, type Catalog } from "./root.ts";
import { launchInputs, type Manifest } from "../../scripts/corpus/smoke.ts";
import { markdown, type Exclusion, type Report, type SweepResult } from "./sweep-report.ts";

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
  /** A capability the browser host could not provide (`browserLimitCapability`). */
  browserLimit?: string;
  /** An HTTP 401/403/404 from a remote service (see `credentialFailure`). */
  credentials?: string;
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
  | "network"
  | `runtime-error:${string}`
  | "bundle-fallback-failed"
  | "needs-preferences"
  | "rendered-with-placeholders"
  | "browser-limit"
  | "needs-credentials"
  | "timeout";

const firstLine = (value: string) => value.split(/\r?\n/u, 1)[0]!.trim();
const compact = (value: string) => firstLine(value).replace(/\s+/gu, " ").slice(0, 240);
// Chromium's own fetch failure messages (CORS, DNS, refused connections), not
// extension text: a tab cannot reach a service that does not allow it.
const networkPattern =
  /cors|cross-origin|failed to fetch|networkerror|network error|err_(?:failed|aborted|connection|name_not_resolved)|fetch failed/iu;

/** One capability request the sandbox sent and how the browser host answered it. */
export type CapabilityCall = { name: string; params?: unknown; ok: boolean; error?: string };

const webScheme = /^(?:https?|mailto):/iu;
/**
 * The first request in a command's capability log that no browser tab can
 * serve. The browser host answers `applications.list` with an empty list (a
 * tab cannot see installed apps) and denies the rest of `applications.*`, and
 * all of `selection.*`, `window.*`, `ai.*` and `oauth.authorize`; a local path
 * or a deep link into a native app (any non-web URL scheme) has nothing to
 * open in a tab. Decided from the request and the host's answer, never from
 * the extension's own message.
 */
export function browserLimitCapability(calls: readonly CapabilityCall[]): string | undefined {
  for (const call of calls) {
    if (call.name.startsWith("applications.") || call.name === "open.path") return call.name;
    if (
      !call.ok &&
      (/^(?:selection|window|ai)\./u.test(call.name) || call.name === "oauth.authorize")
    )
      return call.name;
    if (call.name === "open.url") {
      const url = (call.params as { url?: unknown } | undefined)?.url;
      if (typeof url === "string" && !webScheme.test(url))
        return `open.url ${/^[a-z][a-z0-9+.-]*:/iu.exec(url)?.[0] ?? "(no scheme)"}`;
    }
  }
  return undefined;
}

/**
 * `HTTP <status> <host>` for the first 401/403/404 a remote service answered;
 * the sweep's own servers are local and never count.
 */
export function credentialFailure(
  responses: readonly { status: number; url: string }[],
): string | undefined {
  for (const response of responses) {
    if (![401, 403, 404].includes(response.status)) continue;
    let host: string;
    try {
      host = new URL(response.url).hostname;
    } catch {
      continue;
    }
    if (host !== "127.0.0.1" && host !== "localhost") return `HTTP ${response.status} ${host}`;
  }
  return undefined;
}

/** Outcomes a browser limit or a refused placeholder credential can explain. */
const explainable = (outcome: BrowserOutcome) =>
  outcome === "network" ||
  outcome === "empty" ||
  outcome === "timeout" ||
  outcome.startsWith("runtime-error:");

export function classifyBrowserOutcome(observation: BrowserObservation): BrowserOutcome {
  const outcome = observedOutcome(observation);
  if (observation.timedOut || !explainable(outcome)) return outcome;
  if (observation.browserLimit) return "browser-limit";
  // A service refusing an invented key is not a Blast failure: the command ran.
  if (observation.placeholders && observation.credentials) return "needs-credentials";
  return outcome === "network" ? "browser-limit" : outcome;
}

function observedOutcome(observation: BrowserObservation): BrowserOutcome {
  if (observation.timedOut) return "timeout";
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
      : "network";
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
type BrowserPage = {
  addInitScript(fn: () => void): Promise<void>;
  addInitScript<A>(fn: (arg: A) => void, arg: A): Promise<void>;
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

type Preferences = Record<string, string | number | boolean>;
/**
 * The values the Node corpus smoke launches with (`launchInputs`, task 0086):
 * manifest defaults plus a placeholder for each required preference without
 * one. The demo's preference form is answered with them during the sweep.
 */
export function placeholderPreferences(
  manifest: { preferences: unknown[]; commands: Record<string, unknown[]> } | undefined,
  command: string,
): Preferences {
  if (!manifest) return {};
  const declared = {
    preferences: manifest.preferences,
    commands: [{ name: command, preferences: manifest.commands[command] ?? [] }],
  } as Manifest;
  const values: Preferences = {};
  for (const [name, value] of Object.entries(
    launchInputs(declared, command, "/blast/support/sweep").preferences,
  ))
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
      values[name] = value;
  return values;
}

/**
 * Runs in the page before the demo: records each capability request the
 * sandbox sends over the demo's MessagePort and the host's answer, so a
 * browser limit is read from what was asked and denied, and the shipped demo
 * needs no sweep hook. Self-contained: Playwright serializes it. `scope` is
 * the page's global; tests pass their own.
 */
export function recordCapabilities(
  scope = globalThis as unknown as {
    MessagePort?: {
      prototype: {
        addEventListener(type: unknown, listener: unknown, ...rest: unknown[]): void;
        postMessage(message: unknown, ...rest: unknown[]): void;
      };
    };
    blastSweepCapabilities?: CapabilityCall[];
  },
) {
  type Message = { type?: unknown; id?: unknown; name?: unknown; params?: unknown; ok?: unknown };
  const prototype = scope.MessagePort?.prototype;
  if (!prototype) return;
  const calls: CapabilityCall[] = [];
  scope.blastSweepCapabilities = calls;
  const pending = new WeakMap<object, Map<string, { name: string; params: unknown }>>();
  const addEventListener = prototype.addEventListener;
  const postMessage = prototype.postMessage;
  prototype.addEventListener = function (this: object, type, listener, ...rest) {
    if (type !== "message" || typeof listener !== "function")
      return addEventListener.call(this, type, listener, ...rest);
    // An arrow keeps `this` (the port) for both the bookkeeping and the listener.
    return addEventListener.call(
      this,
      type,
      (event: { data?: Message }) => {
        const data = event?.data;
        if (
          data?.type === "capability.request" &&
          typeof data.id === "string" &&
          typeof data.name === "string"
        ) {
          const requests = pending.get(this) ?? new Map();
          pending.set(this, requests);
          requests.set(data.id, { name: data.name, params: data.params });
        }
        return (listener as (event: unknown) => unknown).call(this, event);
      },
      ...rest,
    );
  };
  prototype.postMessage = function (this: object, message, ...rest) {
    const data = message as Message | undefined;
    if (data?.type === "capability.result" && typeof data.id === "string") {
      const request = pending.get(this)?.get(data.id);
      if (request) {
        pending.get(this)?.delete(data.id);
        const error = (data as { error?: { message?: unknown } }).error?.message;
        calls.push({
          name: request.name,
          params: request.params,
          ok: data.ok === true,
          ...(typeof error === "string" ? { error } : {}),
        });
      }
    }
    return postMessage.call(this, message, ...rest);
  };
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
  const responses: { status: number; url: string }[] = [];
  let network = false;
  let bundleFallbackFailed = false;
  page.on("pageerror", (error) => pageErrors.push(compact(error.message)));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(compact(message.text()));
  });
  page.on("response", (response) => {
    if (response.status() >= 400)
      responses.push({ status: response.status(), url: response.url() });
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
          // Set by the demo once it answered a preference form with placeholders.
          placeholders: document.body.dataset.sweepPlaceholders === "true",
          calls:
            (globalThis as { blastSweepCapabilities?: CapabilityCall[] }).blastSweepCapabilities ??
            [],
        };
      },
      { cells: gridCellSelector, fields: formFieldSelector },
    );
    const browserLimit = browserLimitCapability(snapshot.calls);
    const credentials = credentialFailure(responses);
    const observation: BrowserObservation = {
      ...(snapshot.scene ? { scene: snapshot.scene } : {}),
      needsPreferences: snapshot.needsPreferences,
      placeholders: snapshot.placeholders,
      status: snapshot.status,
      statusError: snapshot.statusError,
      pageErrors,
      consoleErrors,
      ...(browserLimit ? { browserLimit } : {}),
      ...(credentials ? { credentials } : {}),
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
      // A CORS or connection failure is the only browser limit with no capability request.
      ...(outcome === "browser-limit" ? { limit: browserLimit ?? "network" } : {}),
      ...(outcome === "needs-credentials" && credentials ? { credentials } : {}),
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
      ...(outcome === "browser-limit" ? { limit: "network" } : {}),
      pageErrors,
      consoleErrors,
      elapsedMs: Math.round(performance.now() - started),
    };
  }
}

const sorted = (counts: Record<string, number>) =>
  Object.fromEntries(Object.entries(counts).toSorted(([a], [b]) => a.localeCompare(b)));

/**
 * Exclusions recorded by `scripts/browser-catalog.ts` for commands this
 * catalog no longer has: the sweep cannot see them again, so it keeps them.
 */
async function previousExclusions(items: readonly CatalogCommand[]): Promise<Exclusion[]> {
  const path = join(projectRoot, "compat/browser-sweep.json");
  if (!existsSync(path)) return [];
  const previous = JSON.parse(await readFile(path, "utf8")) as { excluded?: Exclusion[] };
  const swept = new Set(items.map((item) => `${item.extension}/${item.command}`));
  return (previous.excluded ?? []).filter(
    (item) => !swept.has(`${item.extension}/${item.command}`),
  );
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
          await page.addInitScript(recordCapabilities);
          const item = items[position]!;
          await page.addInitScript(
            (values) => {
              (globalThis as { blastSweepPlaceholders?: unknown }).blastSweepPlaceholders = values;
            },
            placeholderPreferences(
              index.bundles[bundleKey(item.extension, item.command)]?.manifest,
              item.command,
            ),
          );
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
    const limits: Record<string, number> = {};
    for (const result of results) {
      totals[result.outcome] = (totals[result.outcome] ?? 0) + 1;
      if (result.limit) limits[result.limit] = (limits[result.limit] ?? 0) + 1;
    }
    const report: Report = {
      schema: 2,
      commit: catalog.commit,
      date: new Date().toISOString().slice(0, 10),
      commands: results.length,
      wallTimeMs: Math.round(performance.now() - started),
      totals: sorted(totals),
      limits: sorted(limits),
      excluded: await previousExclusions(items),
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
