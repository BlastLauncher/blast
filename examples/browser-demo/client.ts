import * as esbuild from "esbuild-wasm";
import { createController, type Controller } from "../../packages/client-core/src/index.ts";
import { installForBrowser } from "../../packages/host/src/browser-install.ts";
import { bundleForBrowser } from "../../packages/host/src/browser-bundle.ts";
import type { SceneMessage } from "../../packages/protocol/src/index.ts";
import { render, renderRoot } from "../web-launcher/render.js";
import { canUseLocalFixture, isTextExtension, parseExtensionSource } from "./source.ts";
import {
  executeRootAction,
  rootActionModel,
  rootModel,
  validateCatalog,
  type Catalog,
  type RootActionId,
  type RootRow,
} from "./root.ts";

type FileMap = Record<string, string>;
type BrowserFile = string | Uint8Array;
const asset = (path: string) => new URL(path, new URL(".", location.href)).toString();
const app = document.querySelector<HTMLElement>("#app")!;
const status = document.querySelector<HTMLElement>("#status")!;
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

const setStatus = (text: string, error = false) => {
  status.textContent = text;
  status.dataset.error = error ? "true" : "false";
};
const draw = (view: ReturnType<Controller["view"]>) => {
  app.innerHTML = render(view);
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
    if (message.name === "clipboard.copy") {
      port?.postMessage({ type: "capability.result", id: message.id, ok: true, value: null });
      setStatus("Copied (clipboard handler simulated)");
    } else if (message.name === "open.url") {
      window.open(String((message.params as { url?: string })?.url ?? ""), "_blank", "noopener");
      port?.postMessage({ type: "capability.result", id: message.id, ok: true, value: null });
    } else {
      port?.postMessage({
        type: "capability.result",
        id: message.id,
        ok: false,
        error: { code: "DENIED", message: `${message.name} is unavailable in the browser demo` },
      });
      setStatus(`${message.name} is unavailable in the browser demo`, true);
    }
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
  setStatus("Fetching extension…");
  const extension = await fetchFiles(source);
  const sourceFiles = (await (await fetch(asset("blast-sources.json"))).json()) as FileMap;
  const files = new Map<string, BrowserFile>(Object.entries(sourceFiles));
  for (const [path, value] of extension.files) files.set(path, value);
  const selectedCommand = commandName || commandSelect?.value || "index";
  const command = commandEntry(extension.files, selectedCommand);
  setStatus("Installing dependencies…");
  const installed = await installForBrowser({
    fetch: (value, init) => fetch(value, init),
    manifest: extension.manifest,
    ...(extension.lockfile === undefined ? {} : { lockfile: extension.lockfile }),
  });
  setStatus("Bundling…");
  await esbuild.initialize({ wasmURL: asset("esbuild.wasm"), worker: false });
  const bundled = await bundleForBrowser({
    esbuild,
    files,
    packages: installed.packages,
    command,
    runtimeEntry: "/examples/browser-demo/runtime-entry.ts",
    aliases: {
      "@raycast/api": "/packages/runtime/src/api/index.ts",
      "@blastlauncher/protocol": "/packages/protocol/src/index.ts",
      react: "/node_modules/react/index.js",
      "react/jsx-runtime": "/node_modules/react/jsx-runtime.js",
      "react-reconciler": "/node_modules/react-reconciler/index.js",
      "react-reconciler/constants.js": "/node_modules/react-reconciler/constants.js",
      scheduler: "/node_modules/scheduler/index.js",
    },
  });
  const almost = (await import(asset("almostnode.mjs"))) as unknown as {
    VirtualFS: new () => unknown;
    createRuntime: (
      vfs: unknown,
      options: { sandbox: string },
    ) => Promise<{ execute(code: string, filename?: string): Promise<unknown> }>;
  };
  const runtime = await almost.createRuntime(new almost.VirtualFS(), {
    sandbox:
      ((globalThis as Record<string, unknown>)["__BLAST_SANDBOX__"] as string | undefined) ?? "",
  });
  runtimeFrame =
    (runtime as unknown as { iframe?: HTMLIFrameElement }).iframe?.contentWindow ??
    document.querySelector("iframe")?.contentWindow ??
    undefined;
  const channel = new MessageChannel();
  port = channel.port1;
  port.start();
  port.addEventListener("message", (event) => handleRuntime(event.data));
  try {
    await runtime.execute(`${bundled.code}\nmodule.exports = null;`, "/bundle.cjs");
  } catch (error) {
    setStatus(`Runtime failed: ${String(error)}`, true);
    return;
  }
  setTimeout(() => runtimeFrame?.postMessage({ type: "blast-port" }, "*", [channel.port2]), 100);
  controller = createController({ platform: "macOS" });
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

function stopSession() {
  port?.close();
  port = undefined;
  controller = undefined;
  runtimeFrame = undefined;
  document.querySelector("iframe")?.remove();
  rootOpen = true;
  setStatus("Ready");
  drawRoot();
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
  void launch(selected.url ?? selected.extension, selected.command).catch((error) =>
    setStatus(String(error), true),
  );
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
    const params = new URLSearchParams(location.search);
    const extension = params.get("ext");
    const command = params.get("cmd");
    if (extension && command)
      return void launch(extension, command).catch((error) => setStatus(String(error), true));
    drawRoot();
    setStatus("Ready");
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
  } else if (event.key === "Enter") {
    event.preventDefault();
    sendInput({ type: "primary" });
  } else if (event.key === "Escape") {
    event.preventDefault();
    backFromExtension();
  }
});
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
});
document.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  const index = target.closest<HTMLElement>("[data-root-index]")?.dataset.rootIndex;
  if (index !== undefined) {
    rootSelected = Number(index);
    runSelected();
  }
});
void start();
