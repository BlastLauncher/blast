import {
  createController,
  createRootController,
  type Controller,
  type ControllerInput,
  type ControllerResult,
  type RootCommand,
  type RootController,
} from "@blastlauncher/client-core";
import type { SceneMessage } from "@blastlauncher/protocol";
import { bundleForBrowser, type BrowserBundleFile, type BrowserEsbuild } from "./browser-bundle.ts";
import { installForBrowser } from "./browser-install.ts";
import { aliases } from "./bundle-config.ts";
import {
  createBrowserCapabilities,
  createBrowserPreferenceStore,
  type CapabilityContext,
} from "./capabilities.ts";
import {
  createDefaultRenderer,
  type Theme,
  type ViewInput,
  type WebStatus,
  type WebView,
} from "./default-renderer.ts";
import { commandEntry, fetchExtensionFiles, manifestCommands } from "./extension-files.ts";
import { createDefaultHandlers, type WebHandlers } from "./handlers.ts";
import { BrowserLaunchTimeoutError, createLaunchGeneration, withLaunchTimeout } from "./launch.ts";
import {
  missingPreferences,
  parsePreferences,
  preferenceDefaults,
  preferenceFields,
} from "@blastlauncher/protocol/preference-fields";
import { acceptsRuntimePortRequest } from "./runtime-port.ts";
import { bundleKey, bundleMatches, parseBundleIndex, sha256Hex } from "./bundles.ts";

export type { WebHandlers, WebStatus, WebView };
export type WebMountOptions = {
  /** `raycast/extensions/<name>` or a `https://github.com/<owner>/<repo>/tree/<ref>/<path>` URL. */
  extension?: string;
  /** Alias of `extension` for a GitHub URL. */
  source?: string;
  /** Command to run; defaults to the first command in the manifest. Ignored with `root`. */
  command?: string;
  /** Origin that serves the cross-origin sandbox page (decision 0013). */
  sandboxUrl: string;
  /** Where `almostnode.mjs`, `esbuild.mjs`, `esbuild.wasm` and `blast-sources.json` are served. */
  assetsUrl?: string;
  /** Allow `<assetsUrl>/fixtures/<name>` to stand in for GitHub (tests and demos). */
  fixtures?: boolean;
  /** Show the extension's commands as the engine root view instead of running one. */
  root?: boolean;
  /** Preference values, applied over the manifest defaults and saved values. */
  preferences?: Record<string, string | number | boolean>;
  /** Prebuilt bundle index (usually `/bundles.json`) used before fetching GitHub sources. */
  bundlesUrl?: string;
  /** Supplies missing preferences; returning undefined cancels the launch. */
  preferenceForm?: (
    request: WebPreferenceRequest,
  ) =>
    | Record<string, string | number | boolean>
    | undefined
    | Promise<Record<string, string | number | boolean> | undefined>;
  handlers?: WebHandlers;
  /** Replaces the built-in renderer: receives every view and a callback for input. */
  render?: (view: WebView, input: (value: ControllerInput) => void) => void;
  theme?: Theme;
  /** An esbuild-wasm module that is already initialised; default: `<assetsUrl>/esbuild.mjs`. */
  esbuild?: BrowserEsbuild;
  onStatus?: (status: WebStatus) => void;
};
export type WebPreferenceRequest = {
  extension: string;
  command: string;
  fields: ReturnType<typeof preferenceFields>;
  values: Record<string, string | number | boolean>;
};
export type WebMount = { close(): void; input(value: ControllerInput): void };

type SandboxRuntime = {
  execute(code: string, filename?: string): Promise<unknown>;
  getVFS(): {
    mkdirSync(path: string, options?: { recursive?: boolean }): void;
    writeFileSync(path: string, data: string | Uint8Array): void;
  };
  iframe?: HTMLIFrameElement;
  terminate?: () => void;
};
type RuntimeMessage =
  | SceneMessage
  | { type: "ready" }
  | { type: "capability.request"; id: string; name: string; params: unknown }
  | { type: "exit"; code: number }
  | { type: "error"; message: string };
type EsbuildModule = BrowserEsbuild & {
  initialize(options: { wasmURL: string; worker: boolean }): Promise<void>;
};

const initialized = new WeakSet<object>();
const LAUNCH_TIMEOUT_MS = 30_000;
const RUNTIME_ENTRY = "/packages/web/sandbox/runtime-entry.ts";

const platformName = () => {
  const name = navigator.platform || "";
  if (/mac|iphone|ipad/i.test(name)) return "macOS";
  return /win/i.test(name) ? "Windows" : "Linux";
};

/** Runs one extension in the sandbox and draws it into `element`. */
export function startSession(element: HTMLElement, options: WebMountOptions): WebMount {
  const given = options.source ?? options.extension;
  if (!given) throw new TypeError("mount requires extension or source");
  const source: string = given;
  if (!options.sandboxUrl) throw new TypeError("mount requires sandboxUrl");
  const assetBase = new URL(options.assetsUrl ?? "./", location.href);
  const asset = (path: string) => new URL(path, assetBase).toString();
  const handlers: WebHandlers = { ...createDefaultHandlers(), ...options.handlers };
  const launches = createLaunchGeneration();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const platform = platformName();
  let closed = false;
  let status: WebStatus = { text: "Loading extension…", progress: true };
  let controller: Controller | undefined;
  let root: RootController | undefined;
  let port: MessagePort | undefined;
  let runtime: SandboxRuntime | undefined;
  let removePortListener: (() => void) | undefined;
  let extensionName = source;

  const input = (value: ControllerInput) => {
    if (closed) return;
    if (controller) {
      const result = controller.input(value);
      handle(result);
    } else if (root) {
      for (const effect of root.input(value).effects)
        if (effect.type === "launch") void run(effect.command);
    }
  };
  const renderer = options.render
    ? undefined
    : createDefaultRenderer(element, input as ViewInput, {
        ...(options.theme === undefined ? {} : { theme: options.theme }),
        actionsKey: platform === "macOS" ? "⌘K" : "Ctrl+K",
      });
  const draw = (view: WebView) => {
    if (closed) return;
    if (options.render) options.render(view, input);
    else renderer?.draw(view, status);
  };
  const setStatus = (text: string, error = false, progress = false) => {
    status = { text, ...(error ? { error } : {}), ...(progress ? { progress } : {}) };
    options.onStatus?.(status);
  };

  function handle(result: ControllerResult) {
    for (const event of result.events)
      port?.postMessage({
        type: "event",
        node: event.node,
        handler: event.handler,
        args: event.args,
      });
    for (const effect of result.effects) {
      if (effect.type === "quit") finish();
      else {
        const launch = launches.current();
        const timer = setTimeout(() => {
          timers.delete(timer);
          if (!launches.isCurrent(launch) || !controller) return;
          handle(controller.tick(effect.token));
        }, effect.ms);
        timers.add(timer);
      }
    }
  }

  /** Tears down the running command; the root (if any) stays. */
  function stopCommand() {
    launches.next();
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    removePortListener?.();
    removePortListener = undefined;
    port?.close();
    port = undefined;
    controller = undefined;
    try {
      runtime?.terminate?.();
    } catch {
      // A sandbox that never finished starting has nothing to terminate.
    }
    runtime = undefined;
  }

  function finish() {
    const view = controller?.view();
    stopCommand();
    if (root) {
      root.reset();
      draw(root.view() as WebView);
      setStatus("Ready");
    } else if (view) setStatus("Command finished");
  }

  function fail(error: unknown) {
    if (closed) return;
    const message = error instanceof Error ? error.message : String(error);
    stopCommand();
    setStatus(message, true);
    if (root) {
      root.fail("Command failed", message);
      draw(root.view() as WebView);
    } else draw({ type: "error", message });
  }

  let esbuildModule: EsbuildModule | undefined;
  const loadEsbuild = async (): Promise<BrowserEsbuild> => {
    if (options.esbuild) return options.esbuild;
    esbuildModule ??= (await import(/* @vite-ignore */ asset("esbuild.mjs"))) as EsbuildModule;
    if (!initialized.has(esbuildModule)) {
      initialized.add(esbuildModule);
      await esbuildModule.initialize({ wasmURL: asset("esbuild.wasm"), worker: false });
    }
    return esbuildModule;
  };

  let fetched: Awaited<ReturnType<typeof fetchExtensionFiles>> | undefined;
  let catalogReady: Promise<void> | undefined;
  let bundleIndex: ReturnType<typeof parseBundleIndex> | undefined;
  const loadBundleIndex = async () => {
    if (bundleIndex || !options.bundlesUrl) return bundleIndex;
    const response = await fetch(new URL(options.bundlesUrl, location.href));
    if (!response.ok) return undefined;
    bundleIndex = parseBundleIndex(await response.json());
    return bundleIndex;
  };

  const prebuilt = async (commandName: string) => {
    const index = await loadBundleIndex();
    if (!index) return undefined;
    const pathParts = new URL(source).pathname.split("/").filter(Boolean);
    const treeIndex = pathParts.indexOf("tree");
    const extension = treeIndex >= 0 ? pathParts.at(-1) : undefined;
    const entry = extension ? index.bundles[bundleKey(extension, commandName)] : undefined;
    if (!entry) return undefined;
    const response = await fetch(new URL(entry.path, new URL(options.bundlesUrl!, location.href)));
    if (!response.ok) return undefined;
    const bytes = await response.arrayBuffer();
    if (!(await bundleMatches(index, index.buildSha, bundleKey(extension!, commandName), bytes)))
      return undefined;
    const manifest = entry.manifest;
    if (!manifest) return undefined;
    const files = new Map<string, BrowserBundleFile>();
    for (const [name, file] of Object.entries(entry.files ?? {})) {
      const fileResponse = await fetch(
        new URL(file.path, new URL(options.bundlesUrl!, location.href)),
      );
      if (!fileResponse.ok) continue;
      const fileBytes = await fileResponse.arrayBuffer();
      if (file.bytes !== fileBytes.byteLength || (await sha256Hex(fileBytes)) !== file.sha256)
        continue;
      files.set(name, new Uint8Array(fileBytes));
    }
    return { code: new TextDecoder().decode(bytes), manifest, files };
  };

  const ensureExtension = () =>
    (catalogReady ??= (async () => {
      setStatus("Fetching extension…", false, true);
      draw({ type: "loading", extension: source });
      fetched = await fetchExtensionFiles(source, {
        fixturesUrl: options.fixtures ? asset("fixtures/") : undefined,
      });
      extensionName = String(fetched.manifest.name ?? source);
    })());

  async function run(commandName: string) {
    const generation = launches.next();
    const current = () => !closed && launches.isCurrent(generation);
    try {
      await ensureExtension();
      if (!current() || !fetched) return;
      const extension = fetched;
      setStatus("Installing…", false, true);
      draw({ type: "loading", extension: source, command: commandName });
      const built = await prebuilt(commandName);
      const entry = commandEntry(extension.files, commandName);
      const bundled =
        built ??
        (await (async () => {
          const sources = (await (await fetch(asset("blast-sources.json"))).json()) as Record<
            string,
            string
          >;
          const files = new Map<string, BrowserBundleFile>(Object.entries(sources));
          for (const [path, value] of extension.files) files.set(path, value);
          const installed = await installForBrowser({
            fetch: (value, init) => fetch(value, init),
            manifest: extension.manifest,
            ...(extension.lockfile === undefined ? {} : { lockfile: extension.lockfile }),
          });
          if (!current()) return undefined;
          setStatus("Bundling…", false, true);
          return bundleForBrowser({
            esbuild: await loadEsbuild(),
            files,
            packages: installed.packages,
            command: entry,
            runtimeEntry: RUNTIME_ENTRY,
            aliases,
          });
        })());
      if (!current() || !bundled) return;

      const manifest = built?.manifest ?? extension.manifest;
      const declarations = manifest.commands;
      const declaration = Array.isArray(declarations)
        ? declarations.find((item) => item?.name === commandName)
        : undefined;
      const extensionPreferences = parsePreferences(manifest.preferences, "Extension preferences");
      const commandPreferences = parsePreferences(
        declaration?.preferences,
        `Command ${commandName} preferences`,
      );
      const store = createBrowserPreferenceStore(extensionName, handlers.storage);
      const values = {
        ...preferenceDefaults(extensionPreferences, commandPreferences),
        ...store.values(commandName),
        ...options.preferences,
      };
      const missing = missingPreferences(
        preferenceFields(extensionPreferences, commandPreferences),
        values,
      );
      let resolvedValues = values;
      if (missing.length > 0) {
        if (!options.preferenceForm)
          throw new Error(
            `Missing required preferences: ${missing.map((item) => item.title || item.name).join(", ")}`,
          );
        const supplied = await options.preferenceForm({
          extension: extensionName,
          command: commandName,
          fields: preferenceFields(extensionPreferences, commandPreferences),
          values: values as Record<string, string | number | boolean>,
        });
        if (!supplied) return;
        resolvedValues = { ...values, ...supplied };
        if (
          missingPreferences(
            preferenceFields(extensionPreferences, commandPreferences),
            resolvedValues,
          ).length
        )
          throw new Error("Required preferences are missing");
      }
      const mode =
        declaration?.mode === "no-view" || declaration?.mode === "menu-bar"
          ? (declaration.mode as "no-view" | "menu-bar")
          : "view";

      setStatus("Starting…", false, true);
      const almost = (await import(/* @vite-ignore */ asset("almostnode.mjs"))) as {
        VirtualFS: new () => unknown;
        createRuntime(vfs: unknown, options: { sandbox: string }): Promise<SandboxRuntime>;
      };
      const active = await almost.createRuntime(new almost.VirtualFS(), {
        sandbox: options.sandboxUrl,
      });
      if (!current()) {
        active.terminate?.();
        return;
      }
      runtime = active;
      const pathSegment = extensionName.replace(/[^A-Za-z0-9._-]/gu, "_") || "extension";
      const supportPath = `/blast/support/${pathSegment}`;
      const assetsPath = `/blast/assets/${pathSegment}`;
      const vfs = active.getVFS();
      vfs.mkdirSync(supportPath, { recursive: true });
      vfs.mkdirSync(assetsPath, { recursive: true });
      // A marker syncs directories created after the sandbox was initialised.
      vfs.writeFileSync(`${supportPath}/.keep`, "");
      vfs.writeFileSync(`${assetsPath}/.keep`, "");
      for (const [path, value] of extension.files) {
        if (path.includes("/node_modules/")) continue;
        const relative = path.startsWith("/assets/")
          ? path.slice("/assets/".length)
          : path.startsWith("/src/")
            ? /\.(?:cjs|css|html?|js|jsx|mjs|ts|tsx)$/iu.test(path)
              ? undefined
              : path.slice("/src/".length)
            : path.replace(/^\//u, "");
        if (!relative) continue;
        const target = `${assetsPath}/${relative}`;
        vfs.mkdirSync(target.slice(0, target.lastIndexOf("/")), { recursive: true });
        vfs.writeFileSync(target, value);
        if (path === "/package.json") vfs.writeFileSync("/blast/assets/package.json", value);
      }

      const context: CapabilityContext = { extensionName, commandName, source };
      const capabilities = createBrowserCapabilities({
        catalog: {
          extensions: [
            {
              name: extensionName,
              commands: manifestCommands(extension.manifest).map((name) => ({ name })),
            },
          ],
        },
        ...(handlers.storage ? { storage: handlers.storage } : {}),
        ...(handlers.clipboard ? { clipboard: handlers.clipboard } : {}),
        ...(handlers.openUrl ? { openUrl: handlers.openUrl } : {}),
        status: (text, error) => setStatus(text, error === true),
        launchCommand: async (_source, command) => {
          void run(command);
        },
        openPreferences: () => setStatus("Preferences are not available in this embed", true),
      });
      const answer = async (message: Extract<RuntimeMessage, { type: "capability.request" }>) => {
        const custom = await handlers.capability?.(message, context);
        const result = custom ?? (await capabilities(message, context));
        if (!current()) return;
        port?.postMessage({ type: "capability.result", id: message.id, ...result });
        if (!result.ok) setStatus(result.error.message, true);
      };

      const channel = new MessageChannel();
      port = channel.port1;
      port.start();
      let firstScene: { resolve(): void; reject(error: unknown): void } | undefined;
      const onMessage = (message: RuntimeMessage) => {
        if (!current()) return;
        if (message.type === "scene") {
          if (!controller) return;
          const result = controller.scene(message);
          firstScene?.resolve();
          firstScene = undefined;
          draw(controller.view());
          handle(result);
        } else if (message.type === "capability.request") {
          answer(message).catch((error: unknown) => {
            if (!current()) return;
            const text = error instanceof Error ? error.message : String(error);
            port?.postMessage({
              type: "capability.result",
              id: message.id,
              ok: false,
              error: { code: "DENIED", message: text },
            });
            setStatus(text, true);
          });
        } else if (message.type === "exit") {
          if (message.code === 0) finish();
          else fail(new Error(`Command exited with code ${message.code}`));
        } else if (message.type === "error") fail(new Error(message.message));
      };
      port.addEventListener("message", (event) => onMessage(event.data as RuntimeMessage));

      let transferred = false;
      let resolvePort!: () => void;
      const portReady = new Promise<void>((resolve) => (resolvePort = resolve));
      const transferPort = (event: MessageEvent) => {
        if (!current()) return;
        const frame = active.iframe?.contentWindow ?? undefined;
        if (!acceptsRuntimePortRequest(event.source, frame, transferred, event.data)) return;
        transferred = true;
        removePortListener?.();
        frame?.postMessage({ type: "blast-port" }, "*", [channel.port2]);
        resolvePort();
      };
      window.addEventListener("message", transferPort);
      removePortListener = () => window.removeEventListener("message", transferPort);
      await withLaunchTimeout(
        (async () => {
          await active.execute(
            `${bundled.code}\nmodule.exports = null;`,
            `${assetsPath}/bundle.cjs`,
          );
          if (current()) await portReady;
        })(),
        LAUNCH_TIMEOUT_MS,
        "waiting for runtime port",
      );
      if (!current() || !transferred) return;

      const title = manifestCommandTitle(extension.manifest, commandName);
      controller = createController({
        platform,
        ...(title ? { fallbackTitle: title } : {}),
      });
      const launched = controller;
      launched.subscribe((view) => {
        if (current() && controller === launched) draw(view);
      });
      const scene = new Promise<void>((resolve, reject) => (firstScene = { resolve, reject }));
      port.postMessage({
        type: "init",
        protocol: 1,
        command: { extension: extensionName, name: commandName, entry, mode },
        preferences: { ...resolvedValues },
        environment: {
          extensionName,
          commandName,
          ownerOrAuthorName: "Browser",
          assetsPath,
          supportPath,
          isDevelopment: false,
          appearance: options.theme === "light" ? "light" : "dark",
          textSize: "medium",
        },
      });
      await withLaunchTimeout(scene, LAUNCH_TIMEOUT_MS, "waiting for first scene");
      if (current()) setStatus("Ready");
    } catch (error) {
      if (!current()) return;
      fail(
        error instanceof BrowserLaunchTimeoutError
          ? error
          : error instanceof Error
            ? error
            : new Error(String(error)),
      );
    }
  }

  void (async () => {
    try {
      await ensureExtension();
      if (closed || !fetched) return;
      const manifest = fetched.manifest;
      if (options.root) {
        const declared = Array.isArray(manifest.commands) ? manifest.commands : [];
        const commands: RootCommand[] = declared.flatMap(
          (item: { name?: unknown; title?: unknown; subtitle?: unknown; mode?: unknown }) =>
            typeof item?.name === "string"
              ? [
                  {
                    extension: extensionName,
                    extensionTitle: String(manifest.title ?? extensionName),
                    command: item.name,
                    title: typeof item.title === "string" ? item.title : item.name,
                    ...(typeof item.subtitle === "string" ? { subtitle: item.subtitle } : {}),
                    mode: item.mode === "no-view" || item.mode === "menu-bar" ? item.mode : "view",
                  } satisfies RootCommand,
                ]
              : [],
        );
        root = createRootController(commands);
        root.subscribe((view) => {
          if (!controller) draw(view as WebView);
        });
        setStatus("Ready");
        draw(root.view() as WebView);
      } else await run(options.command ?? manifestCommands(manifest)[0] ?? "index");
    } catch (error) {
      fail(error);
    }
  })();

  return {
    input,
    close() {
      if (closed) return;
      stopCommand();
      closed = true;
      renderer?.destroy();
      if (options.render) element.replaceChildren();
    },
  };
}

function manifestCommandTitle(manifest: Record<string, unknown>, name: string): string | undefined {
  const commands = manifest.commands;
  const found = Array.isArray(commands)
    ? commands.find((item: { name?: unknown }) => item?.name === name)
    : undefined;
  return typeof found?.title === "string" ? found.title : undefined;
}
