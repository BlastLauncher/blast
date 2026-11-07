import * as esbuild from "esbuild-wasm";
import {
  activeNode,
  createController,
  type Controller,
} from "../../packages/client-core/src/index.ts";
import { installForBrowser } from "../../packages/host/src/browser-install.ts";
import { bundleForBrowser } from "../../packages/host/src/browser-bundle.ts";
import type { SceneMessage } from "../../packages/protocol/src/index.ts";
import { aliases } from "./bundle-config.ts";
import {
  bundleKey,
  bundleMatches,
  parseBundleIndex,
  sha256Hex,
  type CatalogManifest,
} from "./bundles.ts";
import { render, renderPreferences, renderRoot } from "../web-launcher/render.js";
import {
  createBrowserCapabilities,
  createBrowserPreferenceStore,
  type CapabilityContext,
} from "./capabilities.ts";
import {
  missingPreferences,
  parsePreferences,
  preferenceDefaults,
  preferenceFields,
  type Preference,
} from "../../packages/host/src/preference-fields.ts";
import { canUseLocalFixture, isTextExtension, parseExtensionSource } from "./source.ts";
import {
  catalogCommandTitle,
  executeRootAction,
  rootActionModel,
  rootModel,
  validateCatalog,
  type Catalog,
  type RootActionId,
  type RootRow,
} from "./root.ts";
import { statusError, statusForStage, statusInfo, type DemoStatus } from "./status.ts";
import { applyEarlyKey, applyEarlyPaste, keyInputFromEvent } from "./keyboard.ts";
import { escapeHtml } from "../web-launcher/render.js";

type FileMap = Record<string, string>;
type BrowserFile = string | Uint8Array;
type SandboxRuntime = {
  execute(code: string, filename?: string): Promise<unknown>;
  getVFS(): {
    mkdirSync(path: string, options?: { recursive?: boolean }): void;
    writeFileSync(path: string, data: string | Uint8Array): void;
  };
  iframe?: HTMLIFrameElement;
  terminate?: () => void;
};
type Sandbox = { runtime: SandboxRuntime; iframe?: HTMLIFrameElement };
const asset = (path: string) => new URL(path, new URL(".", location.href)).toString();
const app = document.querySelector<HTMLElement>("#app")!;
const commandSelect = document.querySelector<HTMLSelectElement>("#command");
let controller: Controller | undefined;
let port: MessagePort | undefined;
let runtimeFrame: Window | undefined;
let catalog: Catalog;
let rootQuery = "";
let rootSelected = 0;
let rootRows: RootRow[] = [];
let rootOpen = true;
let actionOpen = false;
let actionQuery = "";
let actionSelected = 0;
let rootToast = "";
let statusState: DemoStatus = statusForStage("ready");
let bundleIndex: ReturnType<typeof parseBundleIndex> | undefined;
let runtimeCode: string | undefined;
let sandbox: Sandbox | undefined;
let warming: Promise<Sandbox | undefined> | undefined;
let activeCapabilityContext: CapabilityContext | undefined;
let browserCapabilities: ReturnType<typeof createBrowserCapabilities> | undefined;
let esbuildReady = false;
let preferenceForm:
  | {
      source: string;
      command: string;
      extension: Preference[];
      commandFields: Preference[];
      scope: "extension" | "command";
      store: ReturnType<typeof createBrowserPreferenceStore>;
    }
  | undefined;
let preferenceFormVisible = false;
let sessionStarting = false;
let earlyInput = "";
const sessionTimers = new Set<ReturnType<typeof setTimeout>>();

let extensionContext:
  | {
      extensionTitle: string;
      commandTitle: string;
      icon?: string;
      iconUrl?: string;
    }
  | undefined;

const statusForText = (text: string, error: boolean): DemoStatus => {
  if (error) return statusError(text);
  if (text === "Ready") return statusForStage("ready");
  if (text === "Fetching extension…") return statusForStage("fetching");
  if (text === "Installing…") return statusForStage("installing");
  if (text === "Bundling…") return statusForStage("bundling");
  if (text === "Starting…") return statusForStage("starting");
  return statusInfo(text);
};
const setStatus = (text: string, error = false) => {
  statusState = statusForText(text, error);
  if (catalog) {
    if (rootOpen) drawRoot();
    else if (sessionStarting && !controller) drawStarting();
    else if (controller) draw(controller.view());
    else drawRoot();
  }
};
function replaceApp(markup: string) {
  const active = document.activeElement;
  const controls = new Map<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>();
  for (const control of app.querySelectorAll<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  >("input,select,textarea")) {
    const key = control.id || control.dataset.field;
    if (key) controls.set(key, control);
  }
  app.innerHTML = markup;
  for (const next of app.querySelectorAll<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  >("input,select,textarea")) {
    const key = next.id || next.dataset.field;
    const previous = key ? controls.get(key) : undefined;
    if (!previous || previous.dataset.starting === "true" || previous.tagName !== next.tagName)
      continue;
    const focused = active === previous;
    if (next instanceof HTMLSelectElement && previous instanceof HTMLSelectElement) {
      // `.value` only names the first selected option of a multi-select, so sync flags.
      const same =
        previous.multiple === next.multiple &&
        previous.options.length === next.options.length &&
        [...next.options].every((option, index) => option.value === previous.options[index]?.value);
      if (!same) continue;
      [...next.options].forEach((option, index) => {
        const kept = previous.options[index];
        if (kept) kept.selected = option.selected;
      });
    } else if (next instanceof HTMLInputElement && next.type === "checkbox") {
      if (previous instanceof HTMLInputElement && previous.checked !== next.checked)
        previous.checked = next.checked;
    } else if (
      !focused &&
      previous.value !== next.value &&
      // The scene never carries a password, so an unfocused field that still has one keeps it.
      !(next instanceof HTMLInputElement && next.type === "password" && "hasValue" in next.dataset)
    )
      previous.value = next.value;
    next.replaceWith(previous);
  }
}
const drawStarting = () => {
  app.innerHTML = `<main data-kind="list"><header>${extensionContext ? `<div class="breadcrumb"><span>${escapeHtml(extensionContext.extensionTitle)}</span><span class="breadcrumb-separator">›</span><span>${escapeHtml(extensionContext.commandTitle)}</span></div>` : ""}<h1>Starting…</h1><div class="search-line"><input id="search" data-starting="true" value="${escapeHtml(earlyInput)}" placeholder="Search…" aria-label="Search" readonly></div></header><p class="empty">Starting command…</p><footer><span id="status" role="status">${escapeHtml(statusState.text)}</span></footer></main>`;
};
const draw = (view: ReturnType<Controller["view"]>) => {
  const active = document.activeElement as HTMLInputElement | null;
  const focusKey = active?.id || active?.dataset.field;
  const selectionStart = active?.selectionStart;
  const selectionEnd = active?.selectionEnd;
  replaceApp(
    render(view, {
      status: statusState,
      ...(extensionContext ? { context: extensionContext } : {}),
    }),
  );
  const next = (
    view.form?.focusId
      ? document.querySelector<HTMLInputElement>(`[data-field="${CSS.escape(view.form.focusId)}"]`)
      : focusKey
        ? (document.getElementById(focusKey) ??
          document.querySelector<HTMLInputElement>(`[data-field="${CSS.escape(focusKey)}"]`))
        : undefined
  ) as HTMLInputElement | null | undefined;
  if (next) {
    next.focus();
    if (
      selectionStart !== null &&
      selectionStart !== undefined &&
      "setSelectionRange" in next &&
      !(next instanceof HTMLInputElement && next.type === "checkbox")
    )
      next.setSelectionRange(selectionStart, selectionEnd ?? selectionStart);
  }
  document.querySelector<HTMLElement>(".rows li.selected")?.scrollIntoView({ block: "nearest" });
  // The primary button takes focus so Enter confirms, as in the other clients.
  const alertButton = document.querySelector<HTMLButtonElement>(
    "[data-alert=confirm], [data-alert=dismiss]",
  );
  if (view.feedback.alert && alertButton && !document.querySelector(".alert :focus"))
    (document.querySelector<HTMLButtonElement>("[data-alert=confirm]") ?? alertButton).focus();
  if (view.dropdown?.open) {
    document.querySelector<HTMLInputElement>("#dropdown-search")?.focus();
    document
      .querySelector<HTMLElement>(".dropdown-panel button.selected")
      ?.scrollIntoView({ block: "nearest" });
  }
};
const drawRoot = () => {
  const model = rootModel(
    catalog,
    rootQuery,
    rootSelected,
    rootQuery.trim().startsWith("https://github.com/") ? rootQuery.trim() : undefined,
  );
  rootRows = model.rows;
  rootSelected = model.selected;
  const actions = rootActionModel(rootRows[rootSelected], actionQuery, actionSelected);
  actionSelected = actions.selected;
  replaceApp(
    renderRoot(rootRows, rootSelected, rootQuery, {
      open: actionOpen,
      query: actionQuery,
      actions: actions.actions,
      selected: actionSelected,
      toast: rootToast,
      status: statusState,
    }),
  );
  const search = document.querySelector<HTMLInputElement>("#root-search");
  (actionOpen ? document.querySelector<HTMLInputElement>("#root-action-search") : search)?.focus();
  search?.setSelectionRange(search.value.length, search.value.length);
  document
    .querySelector<HTMLElement>(`#root-option-${rootSelected}`)
    ?.scrollIntoView({ block: "nearest" });
};
function drawPreferences(scope: "extension" | "command" = "command") {
  if (!preferenceForm) return;
  const fields =
    scope === "extension"
      ? preferenceForm.extension
      : preferenceFields(preferenceForm.extension, preferenceForm.commandFields);
  const values = preferenceForm.store.values(preferenceForm.command);
  preferenceForm.scope = scope;
  const unavailable = fields
    .filter(
      (field) =>
        ["file", "directory", "appPicker"].includes(field.type) &&
        field.required &&
        field.default === undefined,
    )
    .map((field) => field.name);
  app.innerHTML = renderPreferences(
    fields,
    values,
    scope === "extension" ? "Extension preferences" : "Set up preferences",
    unavailable,
  );
  preferenceFormVisible = true;
  document.querySelector<HTMLInputElement | HTMLSelectElement>("[data-preference]")?.focus();
}
function openPreferenceForm(scope: "extension" | "command", _context: CapabilityContext) {
  drawPreferences(scope);
}
const sendInput = (value: Parameters<Controller["input"]>[0]) => {
  const result = controller?.input(value);
  if (!result || !port) return;
  processResult(result);
};
function processResult(result: ReturnType<Controller["input"]>) {
  for (const event of result.events)
    port?.postMessage({
      type: "event",
      node: event.node,
      handler: event.handler,
      args: event.args,
    });
  for (const effect of result.effects) {
    if (effect.type === "quit") stopSession();
    else {
      const timer = setTimeout(() => {
        sessionTimers.delete(timer);
        const next = controller?.tick(effect.token);
        if (next) processResult(next);
      }, effect.ms);
      sessionTimers.add(timer);
    }
  }
}
const githubApiPath = (path: string) =>
  path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");

function handleRuntime(
  message:
    | SceneMessage
    | { type: "ready" }
    | { type: "capability.request"; id: string; name: string; params: unknown }
    | { type: "error"; message: string },
) {
  if (message.type === "ready") {
    setStatus("Ready");
  } else if (message.type === "scene") {
    if (!controller || rootOpen) return;
    const result = controller.scene(message);
    const view = controller.view();
    const list = activeNode(message.root);
    const controlledSearch =
      list?.props.searchText !== undefined || list?.props.onSearchTextChange !== undefined;
    const pending = earlyInput;
    earlyInput = "";
    sessionStarting = false;
    const canFlush =
      pending.length > 0 &&
      (view.kind === "list" || view.kind === "grid") &&
      view.search.text === "" &&
      !controlledSearch;
    const searchResult = canFlush ? controller.input({ type: "search", text: pending }) : undefined;
    draw(controller.view());
    processResult(result);
    if (searchResult) {
      processResult(searchResult);
      draw(controller.view());
      const search = document.querySelector<HTMLInputElement>("#search");
      search?.focus();
      search?.setSelectionRange(search.value.length, search.value.length);
    }
  } else if (message.type === "capability.request") {
    if (!browserCapabilities || !activeCapabilityContext) return;
    void browserCapabilities(message, activeCapabilityContext)
      .then((result) => {
        port?.postMessage({ type: "capability.result", id: message.id, ...result });
        if (!result.ok) setStatus(result.error.message, true);
      })
      .catch((error) => {
        const text = error instanceof Error ? error.message : String(error);
        port?.postMessage({
          type: "capability.result",
          id: message.id,
          ok: false,
          error: { code: "DENIED", message: text },
        });
        setStatus(text, true);
      });
  } else if (message.type === "error") setStatus(message.message, true);
}

async function fetchFiles(source: string): Promise<{
  files: Map<string, BrowserFile>;
  manifest: Record<string, unknown>;
  lockfile?: string;
  root: string;
}> {
  const parsed = parseExtensionSource(source);
  const files = new Map<string, BrowserFile>();
  const read = async (path: string, url: string) => {
    const response = await fetch(url);
    if (!response.ok) {
      if (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0")
        throw new Error("GitHub API rate limit reached; try again later or use a local fixture");
      throw new Error(`Unable to fetch ${path} (${response.status})`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const value: BrowserFile = isTextExtension(path) ? new TextDecoder().decode(bytes) : bytes;
    files.set(`/${path}`, value);
    return value;
  };
  let root = parsed.path;
  let paths: string[];
  const allowFixtures =
    Object.getOwnPropertyDescriptor(globalThis, "__BLAST_FIXTURES__")?.value === true;
  if (canUseLocalFixture(parsed, allowFixtures)) {
    const localBase = asset(
      `fixtures/${encodeURIComponent(parsed.path.replace(/^extensions\//, ""))}`,
    );
    const localListing = await fetch(`${localBase}/__files`).catch(() => undefined);
    if (localListing?.ok) {
      paths = (await localListing.json()) as string[];
      root = parsed.path.replace(/^extensions\//, "");
      for (const path of paths) await read(path, `${localBase}/${path}`);
    } else paths = [];
  } else paths = [];
  if (paths.length === 0) {
    const list = async (path: string): Promise<string[]> => {
      const response = await fetch(
        `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/contents/${githubApiPath(path)}?ref=${encodeURIComponent(parsed.ref)}`,
        { headers: { Accept: "application/vnd.github+json" } },
      );
      if (!response.ok) {
        if (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0")
          throw new Error("GitHub API rate limit reached; try again later or use a local fixture");
        throw new Error(`Unable to list GitHub extension files (${response.status})`);
      }
      const entries = (await response.json()) as Array<{ path?: string; type?: string }>;
      const result: string[] = [];
      for (const entry of entries) {
        if (!entry.path || entry.path.split("/").includes("node_modules")) continue;
        if (entry.type === "dir") result.push(...(await list(entry.path)));
        else if (entry.type === "file") result.push(entry.path.slice(parsed.path.length + 1));
      }
      return result;
    };
    paths = await list(parsed.path);
    if (!paths.includes("package.json")) throw new Error("Extension package.json was not found");
    for (const path of paths)
      await read(
        path,
        `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${encodeURIComponent(parsed.ref)}/${parsed.path}/${path}`,
      );
  }
  const manifest = JSON.parse(String(files.get("/package.json"))) as Record<string, unknown>;
  const commands = (manifest.commands as Array<{ name?: string }> | undefined) ?? [];
  commandSelect?.replaceChildren();
  for (const command of commands) {
    if (typeof command.name !== "string") continue;
    const option = document.createElement("option");
    option.value = command.name;
    option.textContent = command.name;
    commandSelect?.append(option);
  }
  if (commandSelect) commandSelect.hidden = commandSelect.options.length < 2;
  const lockfile = files.get("/package-lock.json");
  return { files, manifest, root, ...(typeof lockfile === "string" ? { lockfile } : {}) };
}

function commandEntry(files: Map<string, BrowserFile>, name: string): string {
  for (const extension of ["tsx", "ts", "jsx", "js"]) {
    const path = `/src/${name}.${extension}`;
    if (files.has(path)) return path;
  }
  if (files.has("/src/index.tsx")) return "/src/index.tsx";
  throw new Error(`Command source not found for ${name}`);
}

async function launch(source: string, commandName: string): Promise<void> {
  earlyInput = "";
  sessionStarting = true;
  rootOpen = false;
  actionOpen = false;
  const selectedRow = rootRows[rootSelected];
  extensionContext = selectedRow
    ? {
        extensionTitle: selectedRow.subtitle,
        commandTitle: selectedRow.title,
        icon: selectedRow.icon,
        ...(selectedRow.iconUrl ? { iconUrl: selectedRow.iconUrl } : {}),
      }
    : undefined;
  const selectedCommand = commandName || commandSelect?.value || "index";
  const catalogSource = source.startsWith("https://github.com/raycast/extensions/tree/");
  const bundle = catalogSource ? await prebuiltBundle(source, selectedCommand) : undefined;
  let extension: Awaited<ReturnType<typeof fetchFiles>>;
  let command: string;
  let bundled: { code: string; files?: Map<string, BrowserFile> };
  if (bundle) {
    extension = { files: bundle.files, manifest: bundle.manifest, root: "" };
    command = `/src/${selectedCommand}.tsx`;
    bundled = bundle;
    setStatus("Starting prebuilt bundle…");
  } else {
    setStatus("Fetching extension…");
    extension = await fetchFiles(source);
    const sourceFiles = (await (await fetch(asset("blast-sources.json"))).json()) as FileMap;
    const files = new Map<string, BrowserFile>(Object.entries(sourceFiles));
    for (const [path, value] of extension.files) files.set(path, value);
    command = commandEntry(extension.files, selectedCommand);
    setStatus("Installing…");
    const installed = await installForBrowser({
      fetch: (value, init) => fetch(value, init),
      manifest: extension.manifest,
      ...(extension.lockfile === undefined ? {} : { lockfile: extension.lockfile }),
    });
    setStatus("Bundling…");
    if (!esbuildReady) {
      await esbuild.initialize({ wasmURL: asset("esbuild.wasm"), worker: false });
      esbuildReady = true;
    }
    bundled = await bundleForBrowser({
      esbuild,
      files,
      packages: installed.packages,
      command,
      runtimeEntry: "/examples/browser-demo/runtime-entry.ts",
      aliases,
    });
  }
  const preferenceFieldsRaw = (extension.manifest.preferences as unknown[] | undefined) ?? [];
  const commandDeclarations = extension.manifest.commands;
  const commandDeclaration = Array.isArray(commandDeclarations)
    ? commandDeclarations.find(
        (item) => item && typeof item === "object" && item.name === selectedCommand,
      )
    : undefined;
  const commandPreferenceValue = Array.isArray(commandDeclarations)
    ? commandDeclaration?.preferences
    : (commandDeclarations as Record<string, unknown> | undefined)?.[selectedCommand];
  const extensionPreferences = parsePreferences(preferenceFieldsRaw, "Extension preferences");
  const commandPreferences = parsePreferences(
    commandPreferenceValue,
    `Command ${selectedCommand} preferences`,
  );
  let preferenceStorage;
  try {
    preferenceStorage = globalThis.localStorage;
  } catch {
    preferenceStorage = undefined;
  }
  const preferenceStore = createBrowserPreferenceStore(
    String(extension.manifest.name ?? source),
    preferenceStorage,
  );
  const fields = preferenceFields(extensionPreferences, commandPreferences);
  const values = {
    ...preferenceDefaults(extensionPreferences, commandPreferences),
    ...preferenceStore.values(selectedCommand),
  };
  const missing = missingPreferences(fields, values);
  preferenceForm = {
    source,
    command: selectedCommand,
    extension: extensionPreferences,
    commandFields: commandPreferences,
    scope: "command",
    store: preferenceStore,
  };
  if (missing.length) {
    sessionStarting = false;
    earlyInput = "";
    rootOpen = false;
    drawPreferences();
    return;
  }
  preferenceFormVisible = false;
  activeCapabilityContext = {
    extensionName: String(extension.manifest.name ?? source),
    commandName: selectedCommand,
    source,
  };
  const active = await acquireSandbox();
  const extensionName = String(extension.manifest.name ?? source);
  const pathSegment = extensionName.replace(/[^A-Za-z0-9._-]/gu, "_") || "extension";
  const supportPath = `/blast/support/${pathSegment}`;
  const assetsPath = `/blast/assets/${pathSegment}`;
  const vfs = active.runtime.getVFS();
  vfs.mkdirSync(supportPath, { recursive: true });
  vfs.mkdirSync(assetsPath, { recursive: true });
  // A marker syncs directories created after a warmed sandbox was initialized.
  vfs.writeFileSync(`${supportPath}/.keep`, "");
  vfs.writeFileSync(`${assetsPath}/.keep`, "");
  for (const [path, value] of extension.files) {
    if (path.includes("/node_modules/")) continue;
    const relativePath = path.startsWith("/assets/")
      ? path.slice("/assets/".length)
      : path.startsWith("/src/")
        ? /\.(?:cjs|css|html?|js|jsx|mjs|ts|tsx)$/iu.test(path)
          ? undefined
          : path.slice("/src/".length)
        : path.replace(/^\//u, "");
    if (!relativePath) continue;
    const target = `${assetsPath}/${relativePath}`;
    vfs.mkdirSync(target.slice(0, target.lastIndexOf("/")), { recursive: true });
    vfs.writeFileSync(target, value);
    if (path === "/package.json") vfs.writeFileSync("/blast/assets/package.json", value);
  }
  const channel = new MessageChannel();
  port = channel.port1;
  port.start();
  port.addEventListener("message", (event) => handleRuntime(event.data));
  try {
    await active.runtime.execute(
      `${bundled.code}\nmodule.exports = null;`,
      `${assetsPath}/bundle.cjs`,
    );
  } catch (error) {
    setStatus(`Runtime failed: ${String(error)}`, true);
    return;
  }
  setTimeout(() => runtimeFrame?.postMessage({ type: "blast-port" }, "*", [channel.port2]), 100);
  const commandTitle =
    extensionContext?.commandTitle ?? catalogCommandTitle(catalog, source, selectedCommand);
  controller = createController({
    platform: "macOS",
    ...(commandTitle ? { fallbackTitle: commandTitle } : {}),
  });
  controller.subscribe(draw);
  setTimeout(
    () =>
      port?.postMessage({
        type: "init",
        protocol: 1,
        command: {
          extension: String(extension.manifest.name ?? source),
          name: selectedCommand,
          entry: command,
          mode: "view",
        },
        preferences: { ...values },
        environment: {
          extensionName,
          commandName: selectedCommand,
          ownerOrAuthorName: "Browser",
          assetsPath,
          supportPath,
          isDevelopment: false,
          appearance: "dark",
          textSize: "medium",
        },
      }),
    250,
  );
  setStatus("Starting…");
}

async function loadBundleIndex() {
  if (bundleIndex) return bundleIndex;
  const [indexResponse, buildResponse] = await Promise.all([
    fetch(asset("bundles.json")),
    fetch(asset("../build.json")),
  ]);
  if (!indexResponse.ok || !buildResponse.ok) return undefined;
  const index = parseBundleIndex(await indexResponse.json());
  const build = (await buildResponse.json()) as { sha?: unknown };
  if (typeof build.sha !== "string" || build.sha !== index.buildSha) return undefined;
  bundleIndex = index;
  return index;
}

async function loadRuntimeCode(): Promise<string | undefined> {
  if (runtimeCode !== undefined) return runtimeCode;
  const index = await loadBundleIndex();
  if (!index?.runtime) return undefined;
  const response = await fetch(asset(index.runtime.path));
  if (!response.ok) return undefined;
  const bytes = await response.arrayBuffer();
  if (index.runtime.bytes !== bytes.byteLength || (await sha256Hex(bytes)) !== index.runtime.sha256)
    return undefined;
  runtimeCode = new TextDecoder().decode(bytes);
  return runtimeCode;
}

async function prebuiltBundle(
  source: string,
  command: string,
): Promise<
  { code: string; files: Map<string, BrowserFile>; manifest: CatalogManifest } | undefined
> {
  try {
    const index = await loadBundleIndex();
    if (!index) return undefined;
    const parts = new URL(source).pathname.split("/").filter(Boolean);
    const treeIndex = parts.indexOf("tree");
    const extension = treeIndex >= 0 ? parts[treeIndex + 3] : undefined;
    if (!extension) return undefined;
    const key = bundleKey(extension, command);
    const entry = index.bundles[key];
    if (!entry) return undefined;
    const response = await fetch(asset(entry.path));
    if (!response.ok) return undefined;
    const bytes = await response.arrayBuffer();
    if (!(await bundleMatches(index, index.buildSha, key, bytes))) return undefined;
    const files = new Map<string, BrowserFile>();
    for (const [name, file] of Object.entries(entry.files ?? {})) {
      const assetResponse = await fetch(asset(file.path));
      if (!assetResponse.ok) return undefined;
      const assetBytes = await assetResponse.arrayBuffer();
      if (assetBytes.byteLength !== file.bytes || (await sha256Hex(assetBytes)) !== file.sha256)
        return undefined;
      files.set(
        `/${name}`,
        /\.(?:cjs|css|html?|js|jsx|json|md|mjs|ts|tsx|txt|yaml|yml)$/iu.test(name)
          ? new TextDecoder().decode(assetBytes)
          : new Uint8Array(assetBytes),
      );
    }
    // An index without manifest data predates 0133; the source path still has
    // the full package.json, so fall back to it.
    if (!entry.manifest) return undefined;
    return { code: new TextDecoder().decode(bytes), files, manifest: entry.manifest };
  } catch {
    return undefined;
  }
}

/** Create the cross-origin sandbox and load the shared runtime before any command code. */
async function createSandbox(kind: "warm" | "session"): Promise<Sandbox> {
  const almost = (await import(asset("almostnode.mjs"))) as unknown as {
    VirtualFS: new () => unknown;
    createRuntime: (
      vfs: unknown,
      options: { sandbox: string },
    ) => Promise<{
      execute(code: string, filename?: string): Promise<unknown>;
      getVFS(): {
        mkdirSync(path: string, options?: { recursive?: boolean }): void;
        writeFileSync(path: string, data: string): void;
      };
      iframe?: HTMLIFrameElement;
      terminate?: () => void;
    }>;
  };
  const runtime = await almost.createRuntime(new almost.VirtualFS(), {
    sandbox:
      ((globalThis as Record<string, unknown>)["__BLAST_SANDBOX__"] as string | undefined) ?? "",
  });
  runtime.iframe?.setAttribute("data-blast", kind);
  sandbox = { runtime, ...(runtime.iframe ? { iframe: runtime.iframe } : {}) };
  runtimeFrame = runtime.iframe?.contentWindow ?? undefined;
  const code = await loadRuntimeCode();
  if (code) await runtime.execute(`${code}\nmodule.exports = null;`, "/runtime.cjs");
  return sandbox;
}

function discardSandbox() {
  const current = sandbox;
  sandbox = undefined;
  runtimeFrame = undefined;
  try {
    current?.runtime.terminate?.();
  } catch {
    // A sandbox that never finished initializing has nothing to terminate.
  }
  document.querySelector("iframe[data-blast]")?.remove();
}

function warmIdle() {
  warmSandbox();
}

function scheduleWarm() {
  const idle = (
    globalThis as {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => void;
    }
  ).requestIdleCallback;
  if (idle) idle(warmIdle, { timeout: 1500 });
  else setTimeout(warmIdle, 200);
}

function warmSandbox() {
  if (sandbox || warming) return;
  warming = (async () => {
    const index = await loadBundleIndex();
    if (!index?.runtime) return undefined;
    try {
      return await createSandbox("warm");
    } catch {
      discardSandbox();
      return undefined;
    }
  })().finally(() => {
    warming = undefined;
  });
}

/** Reuse the idle sandbox when it is ready; otherwise start a fresh session. */
async function acquireSandbox(): Promise<Sandbox> {
  if (warming) await warming;
  const current = sandbox;
  if (current) {
    current.runtime.iframe?.setAttribute("data-blast", "session");
    return current;
  }
  return createSandbox("session");
}

function stopSession() {
  sessionStarting = false;
  earlyInput = "";
  for (const timer of sessionTimers) clearTimeout(timer);
  sessionTimers.clear();
  port?.close();
  port = undefined;
  controller = undefined;
  discardSandbox();
  rootOpen = true;
  extensionContext = undefined;
  activeCapabilityContext = undefined;
  setStatus("Ready");
  drawRoot();
  scheduleWarm();
}

function backFromExtension() {
  const result = controller?.input({ type: "back" });
  if (!result) return stopSession();
  processResult(result);
  if (controller && !result.effects.some((effect) => effect.type === "quit"))
    draw(controller.view());
}

function runSelected() {
  const selected = rootRows[rootSelected];
  if (!selected) return;
  const source =
    selected.url ??
    `https://github.com/raycast/extensions/tree/${catalog.commit}/extensions/${selected.extension}`;
  void launch(source, selected.command).catch((error) => setStatus(String(error), true));
}

function runAction() {
  const row = rootRows[rootSelected];
  const actions = rootActionModel(row, actionQuery, actionSelected).actions;
  const action = actions[actionSelected];
  if (!row || !action) return;
  const result = executeRootAction(row, action.id as RootActionId);
  if (result.type === "run") {
    actionOpen = false;
    drawRoot();
    runSelected();
  } else if (result.type === "open") {
    window.open(result.url, "_blank", "noopener");
    actionOpen = false;
    drawRoot();
  } else {
    actionOpen = false;
    actionQuery = "";
    actionSelected = 0;
    void navigator.clipboard.writeText(result.url).then(() => {
      rootToast = "Copied extension URL";
      setStatus("Copied extension URL");
      drawRoot();
    });
  }
}

async function start() {
  try {
    catalog = validateCatalog(await (await fetch(asset("catalog.json"))).json());
    let storage;
    try {
      storage = globalThis.localStorage;
    } catch {
      storage = undefined;
    }
    browserCapabilities = createBrowserCapabilities({
      catalog,
      ...(storage ? { storage } : {}),
      clipboard: {
        readText: () => navigator.clipboard.readText(),
        writeText: (text) => navigator.clipboard.writeText(text),
      },
      openUrl: (url) => window.open(url, "_blank", "noopener"),
      launchCommand: (source, command) => launch(source, command),
      status: (message) => setStatus(message),
      openPreferences: openPreferenceForm,
    });
    const params = new URLSearchParams(location.search);
    const extension = params.get("ext");
    const command = params.get("cmd");
    if (extension && command)
      return void launch(extension, command).catch((error) => setStatus(String(error), true));
    drawRoot();
    setStatus("Ready");
    scheduleWarm();
  } catch (error) {
    setStatus(String(error), true);
  }
}

/** Answer the open alert; the remember checkbox travels with either answer. */
function answerAlert(confirm: boolean) {
  const remember = document.querySelector<HTMLInputElement>("#alert-remember")?.checked;
  sendInput({
    type: "alert",
    confirm,
    ...(remember === undefined ? {} : { remember }),
  });
}
/** The alert is modal: Enter confirms, Escape dismisses, Tab stays inside it. */
function alertKey(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    answerAlert(false);
  } else if (event.key === "Enter") {
    event.preventDefault();
    const focused = document.activeElement?.closest<HTMLElement>("[data-alert]");
    answerAlert(focused?.dataset.alert !== "dismiss");
  } else if (event.key === "Tab") {
    event.preventDefault();
    const stops = [...document.querySelectorAll<HTMLElement>(".alert button, .alert input")];
    if (!stops.length) return;
    const index = stops.findIndex((stop) => stop === document.activeElement);
    const step = event.shiftKey ? -1 : 1;
    const next = index < 0 ? (event.shiftKey ? stops.length - 1 : 0) : index + step;
    stops[(next + stops.length) % stops.length]?.focus();
  }
}
/** An open search-bar dropdown owns the arrows, Enter and Escape; its filter keeps typing. */
function dropdownKey(event: KeyboardEvent) {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    sendInput({ type: "move", direction: event.key === "ArrowDown" ? "down" : "up" });
  } else if (event.key === "Enter") {
    event.preventDefault();
    sendInput({ type: "chooseDropdown" });
  } else if (event.key === "Escape") {
    event.preventDefault();
    sendInput({ type: "back" });
  } else if (event.key === "Tab") event.preventDefault();
}

document.addEventListener("keydown", (event) => {
  if (sessionStarting && !controller && !rootOpen) {
    const next = applyEarlyKey(earlyInput, event);
    if (next !== undefined) {
      event.preventDefault();
      earlyInput = next;
      drawStarting();
      return;
    }
  }
  const modalView = rootOpen ? undefined : controller?.view();
  if (modalView?.feedback.alert) return alertKey(event);
  if (modalView?.dropdown?.open) return dropdownKey(event);
  if (!rootOpen && controller) {
    const result = controller.input({ type: "key", key: keyInputFromEvent(event) });
    if (result.handled) {
      event.preventDefault();
      processResult(result);
      return;
    }
  }
  if (rootOpen) {
    if (actionOpen) {
      const actionCount = rootActionModel(rootRows[rootSelected], actionQuery, actionSelected)
        .actions.length;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        actionSelected = Math.min(actionSelected + 1, actionCount - 1);
        drawRoot();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        actionSelected = Math.max(actionSelected - 1, 0);
        drawRoot();
      } else if (event.key === "Enter") {
        event.preventDefault();
        runAction();
      } else if (event.key === "Escape") {
        event.preventDefault();
        actionOpen = false;
        actionQuery = "";
        actionSelected = 0;
        drawRoot();
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      if (rootQuery) {
        rootQuery = "";
        rootSelected = 0;
        drawRoot();
      }
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      rootSelected = Math.min(rootSelected + 1, rootRows.length - 1);
      drawRoot();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      rootSelected = Math.max(rootSelected - 1, 0);
      drawRoot();
    } else if (event.key === "Enter") {
      event.preventDefault();
      runSelected();
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      actionOpen = true;
      actionQuery = "";
      actionSelected = 0;
      drawRoot();
    }
  } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    toggleExtensionActions();
  } else if (controller?.view().kind === "form" && event.key === "Tab") {
    event.preventDefault();
    sendInput({ type: event.shiftKey ? "focusPrev" : "focusNext" });
  } else if (
    controller?.view().kind === "form" &&
    (event.metaKey || event.ctrlKey) &&
    event.key === "Enter"
  ) {
    event.preventDefault();
    sendInput({ type: "submit" });
  } else if (controller?.view().kind === "form" && event.key === " ") {
    const field = controller.view().form?.fields.find((candidate) => candidate.focused);
    if (field?.type === "Form.Checkbox") {
      event.preventDefault();
      sendInput({ type: "toggle", id: field.id });
    }
  } else if (
    controller &&
    ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(event.key)
  ) {
    const view = controller.view();
    const vertical = event.key === "ArrowDown" || event.key === "ArrowUp";
    const horizontal = event.key === "ArrowLeft" || event.key === "ArrowRight";
    // Vertical arrows select list rows; horizontal arrows are grid navigation.
    // Form fields and text inputs keep all arrow keys for caret movement.
    if ((vertical && view.kind !== "form") || (horizontal && view.kind === "grid")) {
      event.preventDefault();
      sendInput({
        type: "move",
        direction: (
          { ArrowDown: "down", ArrowUp: "up", ArrowLeft: "left", ArrowRight: "right" } as const
        )[event.key],
      });
    }
  } else if (event.key === "Enter") {
    event.preventDefault();
    sendInput({ type: "primary" });
  } else if (event.key === "Escape") {
    event.preventDefault();
    // The controller closes an open action panel on back before leaving the view.
    if (preferenceFormVisible) {
      preferenceFormVisible = false;
      rootOpen = true;
      drawRoot();
    } else if (controller?.view().actions.open || controller?.view().dropdown?.open) {
      backFromExtension();
    } else if (controller?.view().search.text) {
      sendInput({ type: "search", text: "" });
      // Keep the focused control in sync while the extension sends its next scene.
      const search = document.querySelector<HTMLInputElement>("#search");
      if (search) search.value = "";
    } else backFromExtension();
  }
});

function toggleExtensionActions() {
  if (!controller) return;
  sendInput({ type: controller.view().actions.open ? "closeActions" : "openActions" });
  draw(controller.view());
}

/** A footer button does exactly what its key does, in either view. */
function runFooter(action: string) {
  if (rootOpen) {
    if (action === "primary") runSelected();
    else if (action === "actions") {
      actionOpen = !actionOpen;
      actionQuery = "";
      actionSelected = 0;
      drawRoot();
    } else if (action === "back") stopSession();
  } else if (action === "primary") sendInput({ type: "primary" });
  else if (action === "actions") toggleExtensionActions();
  else if (action === "back") backFromExtension();
}
function preferenceFormValues(
  form: HTMLFormElement,
  fields: Preference[],
): Record<string, string | boolean> {
  const values: Record<string, string | boolean> = {};
  for (const field of fields) {
    const input = form.elements.namedItem(field.name) as
      | HTMLInputElement
      | HTMLSelectElement
      | null;
    if (input)
      values[field.name] =
        input instanceof HTMLInputElement && input.type === "checkbox"
          ? input.checked
          : input.value;
  }
  return values;
}
// Clicking into a field must move the controller's focus too, or the next redraw
// would pull the caret back to the field the controller still considers focused.
document.addEventListener("focusin", (event) => {
  const field = (event.target as HTMLElement).dataset?.field;
  if (field && controller?.view().form?.focusId !== field) sendInput({ type: "focus", id: field });
});
document.addEventListener("paste", (event) => {
  if (!sessionStarting || controller || rootOpen) return;
  const text = event.clipboardData?.getData("text") ?? "";
  if (!text) return;
  event.preventDefault();
  earlyInput = applyEarlyPaste(earlyInput, text);
  drawStarting();
});
document.addEventListener("input", (event) => {
  const target = event.target as HTMLInputElement;
  if (target.closest("#preferences-form") && preferenceForm) {
    const fields =
      preferenceForm.scope === "extension"
        ? preferenceForm.extension
        : preferenceFields(preferenceForm.extension, preferenceForm.commandFields);
    const form = document.querySelector<HTMLFormElement>("#preferences-form");
    const missing = form
      ? missingPreferences(fields, preferenceFormValues(form, fields)).length > 0
      : true;
    const submit = document.querySelector<HTMLButtonElement>(
      '#preferences-form button[type="submit"]',
    );
    if (submit) submit.disabled = missing;
    return;
  }
  if (target.id === "root-search") {
    rootQuery = target.value;
    rootSelected = 0;
    drawRoot();
  } else if (target.id === "root-action-search") {
    actionQuery = target.value;
    actionSelected = 0;
    drawRoot();
  } else if (target.id === "search") sendInput({ type: "search", text: target.value });
  else if (target.id === "dropdown-search")
    sendInput({ type: "dropdownQuery", text: target.value });
  else if (target.id === "action-search") sendInput({ type: "actionsQuery", text: target.value });
  else if (target.dataset.field && target instanceof HTMLInputElement && target.type === "checkbox")
    sendInput({ type: "toggle", id: target.dataset.field });
  else if (target.dataset.field && !(target instanceof HTMLSelectElement))
    // A select reports through "change"; a setValue would filter a Dropdown's options.
    sendInput({ type: "setValue", id: target.dataset.field, value: target.value });
});
/** Resolve once the controller publishes its next view, or after `ms`. */
function nextView(active: Controller, ms = 2000) {
  return new Promise<void>((resolve) => {
    const stop = active.subscribe(() => done());
    const timer = setTimeout(() => done(), ms);
    function done() {
      stop();
      clearTimeout(timer);
      resolve();
    }
  });
}
/**
 * Make a Dropdown or TagPicker hold exactly `wanted`. `optionChoose` toggles one
 * option and its onChange builds on the extension's current value, so toggle one
 * at a time and wait for the scene that reflects it before the next.
 */
async function syncFieldOptions(fieldId: string, wanted: Set<string>, multiple: boolean) {
  const active = controller;
  if (!active) return;
  sendInput({ type: "focus", id: fieldId });
  for (let step = 0; step < 64; step++) {
    const field = active.view().form?.fields.find((candidate) => candidate.id === fieldId);
    if (!field) return;
    const have = new Set(field.selected.map((option) => option.value));
    // A Dropdown choice replaces its value, so only a missing option needs choosing.
    const index = field.options.findIndex((option) =>
      multiple
        ? wanted.has(option.value) !== have.has(option.value)
        : wanted.has(option.value) && !have.has(option.value),
    );
    if (index < 0) return;
    const changed = nextView(active);
    sendInput({ type: "optionMove", delta: index - field.optionIndex });
    sendInput({ type: "optionChoose" });
    await changed;
  }
}
document.addEventListener("change", (event) => {
  const target = event.target as HTMLSelectElement;
  if (!(target instanceof HTMLSelectElement) || !target.dataset.field) return;
  const wanted = new Set(
    target.multiple ? [...target.selectedOptions].map((option) => option.value) : [target.value],
  );
  void syncFieldOptions(target.dataset.field, wanted, target.multiple);
});
document.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  if (target.closest("[data-preference-back]")) {
    preferenceFormVisible = false;
    rootOpen = true;
    drawRoot();
    return;
  }
  if (target.closest("#preferences-form")) return;
  if (target.closest("[data-dropdown-open]")) {
    if (!controller) return;
    sendInput({ type: "openDropdown" });
    draw(controller.view());
    return;
  }
  const dropdownValue = target.closest<HTMLElement>("[data-dropdown-value]")?.dataset.dropdownValue;
  if (dropdownValue !== undefined) {
    const view = controller?.view();
    const option =
      view?.dropdown?.options.findIndex((candidate) => candidate.value === dropdownValue) ?? -1;
    const current = view?.dropdown?.selectedIndex ?? 0;
    if (option >= 0)
      for (let index = current; index !== option; index += option > current ? 1 : -1)
        sendInput({ type: "move", direction: option > current ? "down" : "up" });
    sendInput({ type: "chooseDropdown" });
    return;
  }
  const alertAction = target.closest<HTMLElement>("[data-alert]")?.dataset.alert;
  if (alertAction) {
    answerAlert(alertAction === "confirm");
    return;
  }
  const toastAction = target.closest<HTMLElement>("[data-toast-action]")?.dataset.toastAction;
  if (toastAction !== undefined) {
    sendInput({ type: "toastAction", index: Number(toastAction) });
    return;
  }
  const footer = target.closest<HTMLElement>("[data-footer]")?.dataset.footer;
  if (footer !== undefined) {
    runFooter(footer);
    return;
  }
  const index = target.closest<HTMLElement>("[data-root-index]")?.dataset.rootIndex;
  if (index !== undefined) {
    rootSelected = Number(index);
    runSelected();
    return;
  }
  if (rootOpen) return;
  // In an extension view, clicking a row selects it; clicking an action runs it.
  const actionIndex = target.closest<HTMLElement>("[data-action-index]")?.dataset.actionIndex;
  if (actionIndex !== undefined) {
    const rows = controller?.view().actions.rows ?? [];
    const from = rows.findIndex((row) => row.selected);
    const steps = Number(actionIndex) - Math.max(from, 0);
    for (let step = 0; step < Math.abs(steps); step++)
      sendInput({ type: "move", direction: steps > 0 ? "down" : "up" });
    sendInput({ type: "primary" });
    return;
  }
  const rowId = target.closest<HTMLElement>("#app .rows li[data-id], #app .grid-cell[data-id]")
    ?.dataset.id;
  if (rowId !== undefined) sendInput({ type: "select", id: rowId });
});
document.addEventListener("submit", (event) => {
  if (
    !(event.target instanceof HTMLFormElement) ||
    event.target.id !== "preferences-form" ||
    !preferenceForm
  )
    return;
  event.preventDefault();
  const fields =
    preferenceForm.scope === "extension"
      ? preferenceForm.extension
      : preferenceFields(preferenceForm.extension, preferenceForm.commandFields);
  const values = preferenceFormValues(event.target, fields);
  const missing = missingPreferences(fields, values);
  if (missing.length) {
    const error = document.querySelector("#preference-error");
    if (error) error.textContent = `Required: ${missing.map((field) => field.title).join(", ")}`;
    return;
  }
  const extensionNames = new Set(preferenceForm.extension.map((field) => field.name));
  const extensionValues: Record<string, string | boolean> = {};
  const commandValues: Record<string, string | boolean> = {};
  for (const [name, value] of Object.entries(values))
    (extensionNames.has(name) ? extensionValues : commandValues)[name] = value;
  preferenceForm.store.update(extensionValues, preferenceForm.command, commandValues);
  const { source, command } = preferenceForm;
  preferenceFormVisible = false;
  void launch(source, command).catch((error) => setStatus(String(error), true));
});
void start();
