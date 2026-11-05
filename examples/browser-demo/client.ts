import * as esbuild from "esbuild-wasm";
import { createController, type Controller } from "../../packages/client-core/src/index.ts";
import { installForBrowser } from "../../packages/host/src/browser-install.ts";
import { bundleForBrowser } from "../../packages/host/src/browser-bundle.ts";
import { render } from "../web-launcher/render.js";
import { isTextExtension, parseExtensionSource } from "./source.ts";

type FileMap = Record<string, string>;
type BrowserFile = string | Uint8Array;
type SceneMessage = { type: "scene"; revision: number; root: unknown };
const app = document.querySelector<HTMLElement>("#app")!;
const status = document.querySelector<HTMLElement>("#status")!;
const input = document.querySelector<HTMLInputElement>("#extension")!;
const commandSelect = document.querySelector<HTMLSelectElement>("#command")!;
let controller: Controller | undefined;
let port: MessagePort | undefined;
let runtimeFrame: Window | undefined;
let ready = false;

const setStatus = (text: string, error = false) => {
  status.textContent = text;
  status.dataset.error = error ? "true" : "false";
};
const draw = (view: ReturnType<Controller["view"]>) => {
  app.innerHTML = render(view);
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
    ready = true;
    setStatus("Ready");
  } else if (message.type === "scene") {
    if (!controller) return;
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
  if (parsed.owner === "raycast" && parsed.repo === "extensions" && parsed.ref === "main") {
    const localBase = `${location.origin}/fixtures/${encodeURIComponent(parsed.path.replace(/^extensions\//, ""))}`;
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
  commandSelect.replaceChildren();
  for (const command of commands) {
    if (typeof command.name !== "string") continue;
    const option = document.createElement("option");
    option.value = command.name;
    option.textContent = command.name;
    commandSelect.append(option);
  }
  commandSelect.hidden = commandSelect.options.length < 2;
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

async function launch(): Promise<void> {
  if (ready) return;
  setStatus("Fetching extension…");
  const source = input.value.trim();
  const extension = await fetchFiles(source);
  const sourceFiles = (await (await fetch("/blast-sources.json")).json()) as FileMap;
  const files = new Map(Object.entries(sourceFiles));
  for (const [path, value] of extension.files) files.set(path, value);
  const commandName = commandSelect.value || "index";
  const command = commandEntry(extension.files, commandName);
  setStatus("Installing dependencies…");
  const installed = await installForBrowser({
    fetch: (value, init) => fetch(value, init),
    manifest: extension.manifest,
    lockfile: extension.lockfile,
  });
  setStatus("Bundling…");
  await esbuild.initialize({ wasmURL: "/esbuild.wasm", worker: false });
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
  const almost = (await import(`${location.origin}/almostnode.mjs`)) as unknown as {
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
  void runtime
    .execute(bundled.code, "/bundle.cjs")
    .catch((error) => setStatus(String(error), true));
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
          name: commandName,
          entry: command,
          mode: "view",
        },
        preferences: {},
        environment: {
          extensionName: String(extension.manifest.name ?? source),
          commandName,
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

document
  .querySelector("#launch")
  ?.addEventListener("click", () => void launch().catch((error) => setStatus(String(error), true)));
document.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown") sendInput({ type: "move", direction: "down" });
  else if (event.key === "ArrowUp") sendInput({ type: "move", direction: "up" });
  else if (event.key === "Enter") sendInput({ type: "primary" });
  else if (event.key === "Escape") sendInput({ type: "back" });
});
document.addEventListener("input", (event) => {
  const target = event.target as HTMLInputElement;
  if (target.id === "search") sendInput({ type: "search", text: target.value });
});
