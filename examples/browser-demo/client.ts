import * as esbuild from "esbuild-wasm";
import { createController, type Controller } from "../../packages/client-core/src/index.ts";
import { installForBrowser } from "../../packages/host/src/browser-install.ts";
import { bundleForBrowser } from "../../packages/host/src/browser-bundle.ts";
import { render } from "../web-launcher/render.js";

type FileMap = Record<string, string>;
type SceneMessage = { type: "scene"; revision: number; root: unknown };
const app = document.querySelector<HTMLElement>("#app")!;
const status = document.querySelector<HTMLElement>("#status")!;
const input = document.querySelector<HTMLInputElement>("#extension")!;
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

async function fetchFiles(
  source: string,
): Promise<{ files: Map<string, string>; manifest: Record<string, unknown>; lockfile?: string }> {
  const files = new Map<string, string>();
  const base = source.startsWith("http")
    ? source
    : `${location.origin}/fixtures/${encodeURIComponent(source)}`;
  const fetchFile = async (path: string) => {
    const response = await fetch(`${base.replace(/\/$/, "")}/${path}`);
    if (!response.ok) throw new Error(`Unable to fetch ${path} (${response.status})`);
    const value = await response.text();
    files.set(`/${path}`, value);
    return value;
  };
  const manifest = JSON.parse(await fetchFile("package.json")) as Record<string, unknown>;
  const entry =
    typeof (manifest.commands as Array<{ name?: string }> | undefined)?.[0]?.name === "string"
      ? `src/${(manifest.commands as Array<{ name: string }>)[0]!.name}.tsx`
      : "src/index.tsx";
  await fetchFile(entry).catch(() => fetchFile(entry.replace(/\.tsx$/, ".ts")));
  const lockfile = await fetchFile("package-lock.json").catch(() => undefined);
  return { files, manifest, ...(lockfile === undefined ? {} : { lockfile }) };
}

async function launch(): Promise<void> {
  if (ready) return;
  setStatus("Fetching extension…");
  const source = input.value.trim();
  const extension = await fetchFiles(source);
  const sourceFiles = (await (await fetch("/blast-sources.json")).json()) as FileMap;
  const files = new Map(Object.entries(sourceFiles));
  for (const [path, value] of extension.files) files.set(path, value);
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
    command: "/src/index.tsx",
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
          name: "index",
          entry: "/src/index.tsx",
          mode: "view",
        },
        preferences: {},
        environment: {
          extensionName: String(extension.manifest.name ?? source),
          commandName: "index",
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
