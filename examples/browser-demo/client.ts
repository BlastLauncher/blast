import * as esbuild from "esbuild-wasm";
import { createController, type Controller } from "../../packages/client-core/src/index.ts";
import { installForBrowser } from "../../packages/host/src/browser-install.ts";
import { bundleForBrowser } from "../../packages/host/src/browser-bundle.ts";
import type { SceneMessage } from "../../packages/protocol/src/index.ts";
import { aliases } from "./bundle-config.ts";
import { bundleKey, bundleMatches, parseBundleIndex, sha256Hex } from "./bundles.ts";
import { render, renderRoot } from "../web-launcher/render.js";
import { createBrowserCapabilities, type CapabilityContext } from "./capabilities.ts";
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

type FileMap = Record<string, string>;
type BrowserFile = string | Uint8Array;
type SandboxRuntime = {
  execute(code: string, filename?: string): Promise<unknown>;
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
    if (rootOpen || !controller) drawRoot();
    else draw(controller.view());
  }
};
const draw = (view: ReturnType<Controller["view"]>) => {
  app.innerHTML = render(view, {
    status: statusState,
    ...(extensionContext ? { context: extensionContext } : {}),
  });
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
  app.innerHTML = renderRoot(rootRows, rootSelected, rootQuery, {
    open: actionOpen,
    query: actionQuery,
    actions: actions.actions,
    selected: actionSelected,
    toast: rootToast,
    status: statusState,
  });
  const search = document.querySelector<HTMLInputElement>("#root-search");
  (actionOpen ? document.querySelector<HTMLInputElement>("#root-action-search") : search)?.focus();
  search?.setSelectionRange(search.value.length, search.value.length);
  document
    .querySelector<HTMLElement>(`#root-option-${rootSelected}`)
    ?.scrollIntoView({ block: "nearest" });
};
const sendInput = (value: Parameters<Controller["input"]>[0]) => {
  const result = controller?.input(value);
  if (!result || !port) return;
  for (const event of result.events)
    port.postMessage({ type: "event", node: event.node, handler: event.handler, args: event.args });
};
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
    draw(controller.view());
    for (const effect of result.effects) if (effect.type === "quit") setStatus("Command exited");
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
  activeCapabilityContext = { extensionName: source, commandName: selectedCommand, source };
  const catalogSource = source.startsWith("https://github.com/raycast/extensions/tree/");
  const bundle = catalogSource ? await prebuiltBundle(source, selectedCommand) : undefined;
  let extension: Awaited<ReturnType<typeof fetchFiles>>;
  let command: string;
  let bundled: { code: string };
  if (bundle) {
    extension = { files: new Map(), manifest: { name: source }, root: "" };
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
    await esbuild.initialize({ wasmURL: asset("esbuild.wasm"), worker: false });
    bundled = await bundleForBrowser({
      esbuild,
      files,
      packages: installed.packages,
      command,
      runtimeEntry: "/examples/browser-demo/runtime-entry.ts",
      aliases,
    });
  }
  activeCapabilityContext = {
    extensionName: String(extension.manifest.name ?? source),
    commandName: selectedCommand,
    source,
  };
  const active = await acquireSandbox();
  const channel = new MessageChannel();
  port = channel.port1;
  port.start();
  port.addEventListener("message", (event) => handleRuntime(event.data));
  try {
    await active.runtime.execute(`${bundled.code}\nmodule.exports = null;`, "/bundle.cjs");
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
        preferences: {},
        environment: {
          extensionName: String(extension.manifest.name ?? source),
          commandName: selectedCommand,
          ownerOrAuthorName: "Browser",
          assetsPath: "",
          supportPath: "",
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
): Promise<{ code: string } | undefined> {
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
    return { code: new TextDecoder().decode(bytes) };
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
  for (const event of result.events)
    port?.postMessage({
      type: "event",
      node: event.node,
      handler: event.handler,
      args: event.args,
    });
  if (result.effects.some((effect) => effect.type === "quit")) stopSession();
  else if (controller) draw(controller.view());
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

document.addEventListener("keydown", (event) => {
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
  } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    sendInput({ type: "move", direction: event.key === "ArrowDown" ? "down" : "up" });
  } else if (event.key === "Enter") {
    event.preventDefault();
    sendInput({ type: "primary" });
  } else if (event.key === "Escape") {
    event.preventDefault();
    // The controller closes an open action panel on back before leaving the view.
    backFromExtension();
  }
});

function toggleExtensionActions() {
  sendInput({ type: controller?.view().actions.open ? "closeActions" : "openActions" });
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
document.addEventListener("input", (event) => {
  const target = event.target as HTMLInputElement;
  if (target.id === "root-search") {
    rootQuery = target.value;
    rootSelected = 0;
    drawRoot();
  } else if (target.id === "root-action-search") {
    actionQuery = target.value;
    actionSelected = 0;
    drawRoot();
  } else if (target.id === "search") sendInput({ type: "search", text: target.value });
  else if (target.id === "action-search") sendInput({ type: "actionsQuery", text: target.value });
});
document.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
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
  const rowId = target.closest<HTMLElement>("#app .rows li[data-id]")?.dataset.id;
  if (rowId !== undefined) sendInput({ type: "select", id: rowId });
});
void start();
