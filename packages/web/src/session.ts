import {
  createController,
  createRootController,
  type Controller,
  type ControllerInput,
  type ControllerResult,
  type ControllerView,
  type RootCommand,
  type RootController,
} from "@blastlauncher/client-core";
import type { CommandMode, SceneMessage } from "@blastlauncher/protocol";
import { bundleForBrowser, type BrowserBundleFile, type BrowserEsbuild } from "./browser-bundle.ts";
import { installForBrowser } from "./browser-install.ts";
import { aliases } from "./bundle-config.ts";
import type { CatalogManifest } from "./bundles.ts";
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
import { createLaunchGeneration, withLaunchTimeout } from "./launch.ts";
import {
  missingPreferences,
  parsePreferences,
  preferenceDefaults,
  preferenceFields,
  type Preference,
} from "@blastlauncher/protocol/preference-fields";
import { loadPrebuiltCommand } from "./prebuilt.ts";
import { acceptsRuntimePortRequest } from "./runtime-port.ts";
import { acquireSandbox, assetUrl, disposeSandbox, type SandboxRuntime } from "./sandbox.ts";

export type { WebHandlers, WebStatus, WebView };
type PreferenceValues = Record<string, string | number | boolean>;
export type WebMountOptions = {
  /** `raycast/extensions/<name>` or a `https://github.com/<owner>/<repo>/tree/<ref>/<path>` URL. */
  extension?: string;
  /** Alias of `extension` for a GitHub URL. */
  source?: string;
  /** Command to run; defaults to the first command in the manifest. Ignored with `root`. */
  command?: string;
  /** Navigation title until the command sets one; defaults to the manifest's command title. */
  commandTitle?: string;
  /** Origin that serves the cross-origin sandbox page (decision 0013). */
  sandboxUrl: string;
  /**
   * Where the package's `assets/` (`almostnode.mjs`, `esbuild.mjs`, `esbuild.wasm`,
   * `blast-sources.json`) are served; defaults to `assets/` beside this module.
   */
  assetsUrl?: string;
  /** Allow `<assetsUrl>/fixtures/<name>` to stand in for GitHub (tests and demos). */
  fixtures?: boolean;
  /** Show the extension's commands as the engine root view instead of running one. */
  root?: boolean;
  /** Preference values, applied over the manifest defaults and saved values. */
  preferences?: PreferenceValues;
  /** Prebuilt bundle index (usually `/bundles.json`) used before fetching GitHub sources. */
  bundlesUrl?: string;
  /** JSON `{ "sha": … }`; a bundle index with another `buildSha` is ignored. */
  buildUrl?: string;
  /**
   * Asks for preferences: missing required ones before a launch, or any when
   * the extension calls `openExtensionPreferences`/`openCommandPreferences`.
   * Submitted values are saved; returning undefined cancels.
   */
  preferenceForm?: (
    request: WebPreferenceRequest,
  ) => PreferenceValues | undefined | Promise<PreferenceValues | undefined>;
  handlers?: WebHandlers;
  /** Replaces the built-in renderer: receives every view and a callback for input. */
  render?: (
    view: WebView,
    input: (value: ControllerInput) => ControllerResult | undefined,
    frame: WebFrame,
  ) => void;
  /** Called when the command ends without an error; default: back to the root, or a status. */
  onExit?: (exit: WebExit) => void;
  theme?: Theme;
  /** esbuild-wasm, initialised (or a loader that initialises it); default: `<assetsUrl>/esbuild.mjs`. */
  esbuild?: BrowserEsbuild | (() => Promise<BrowserEsbuild>);
  onStatus?: (status: WebStatus) => void;
};
export type WebPreferenceRequest = {
  extension: string;
  command: string;
  /** `command` lists the extension's and the command's fields; `extension` only the former. */
  scope: "extension" | "command";
  fields: Preference[];
  values: PreferenceValues;
};
/** What a custom renderer may need beyond the view: the scene it came from and the status. */
export type WebFrame = { scene?: SceneMessage; status: WebStatus };
/** `quit`: the command closed its window; `exit`: its process ended with code 0. */
export type WebExit = { reason: "quit" | "exit"; view?: ControllerView };
export type WebMount = {
  close(): void;
  /** Sends input to the running command (or the root); the result says whether a key was handled. */
  input(value: ControllerInput): ControllerResult | undefined;
  /** The running command's current view. */
  view(): ControllerView | undefined;
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
/** A command's manifest declarations, from `package.json` or a prebuilt bundle's index entry. */
type Declared = {
  extensionName: string;
  commands: string[];
  extensionPreferences: Preference[];
  commandPreferences: Preference[];
  mode: CommandMode;
  title?: string;
};

const initialized = new WeakSet<object>();
const LAUNCH_TIMEOUT_MS = 30_000;
const RUNTIME_ENTRY = "/packages/web/sandbox/runtime-entry.ts";

const platformName = () => {
  const name = navigator.platform || "";
  if (/mac|iphone|ipad/i.test(name)) return "macOS";
  return /win/i.test(name) ? "Windows" : "Linux";
};
const commandMode = (value: unknown): CommandMode =>
  value === "no-view" || value === "menu-bar" || value === "model-provider" ? value : "view";

function fromManifest(manifest: Record<string, unknown>, name: string, source: string): Declared {
  const declarations = Array.isArray(manifest.commands) ? manifest.commands : [];
  const declaration = declarations.find(
    (item: { name?: unknown } | null) => item?.name === name,
  ) as Record<string, unknown> | undefined;
  return {
    extensionName: String(manifest.name ?? source),
    commands: manifestCommands(manifest),
    extensionPreferences: parsePreferences(manifest.preferences, "Extension preferences"),
    commandPreferences: parsePreferences(declaration?.preferences, `Command ${name} preferences`),
    mode: commandMode(declaration?.mode),
    ...(typeof declaration?.title === "string" ? { title: declaration.title } : {}),
  };
}
function fromCatalog(manifest: CatalogManifest, name: string): Declared {
  return {
    extensionName: manifest.name,
    commands: Object.keys(manifest.commands),
    extensionPreferences: manifest.preferences,
    commandPreferences: manifest.commands[name] ?? [],
    mode: commandMode(manifest.modes?.[name]),
  };
}

/** Runs one extension in the sandbox and draws it into `element`. */
export function startSession(element: HTMLElement, options: WebMountOptions): WebMount {
  const given = options.source ?? options.extension;
  if (!given) throw new TypeError("mount requires extension or source");
  const source: string = given;
  if (!options.sandboxUrl) throw new TypeError("mount requires sandboxUrl");
  const asset = (path: string) => assetUrl(options, path);
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
  let scene: SceneMessage | undefined;
  let mode: CommandMode = "view";
  let extensionName = source;

  const input = (value: ControllerInput): ControllerResult | undefined => {
    if (closed) return undefined;
    if (controller) {
      const result = controller.input(value);
      handle(result);
      return result;
    }
    if (!root) return undefined;
    const result = root.input(value);
    for (const effect of result.effects) if (effect.type === "launch") void run(effect.command);
    return { events: [], effects: [] };
  };
  const renderer = options.render
    ? undefined
    : createDefaultRenderer(element, ((value) => void input(value)) as ViewInput, {
        ...(options.theme === undefined ? {} : { theme: options.theme }),
        actionsKey: platform === "macOS" ? "⌘K" : "Ctrl+K",
      });
  const draw = (view: WebView) => {
    if (closed) return;
    if (options.render) options.render(view, input, { ...(scene ? { scene } : {}), status });
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
      if (effect.type === "quit") {
        // `closeMainWindow()` asks to quit, but a no-view command is done only
        // when the runtime reports its exit status.
        if (mode !== "no-view") finish("quit");
      } else {
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
    scene = undefined;
    disposeSandbox(runtime);
    runtime = undefined;
  }

  function finish(reason: WebExit["reason"]) {
    const view = controller?.view();
    stopCommand();
    if (options.onExit) options.onExit({ reason, ...(view ? { view } : {}) });
    else if (root) {
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
    if (typeof options.esbuild === "function") return options.esbuild();
    if (options.esbuild) return options.esbuild;
    esbuildModule ??= (await import(/* @vite-ignore */ asset("esbuild.mjs"))) as EsbuildModule;
    if (!initialized.has(esbuildModule)) {
      initialized.add(esbuildModule);
      await esbuildModule.initialize({ wasmURL: asset("esbuild.wasm"), worker: false });
    }
    return esbuildModule;
  };

  let fetched: Promise<Awaited<ReturnType<typeof fetchExtensionFiles>>> | undefined;
  const fetchExtension = () =>
    (fetched ??= fetchExtensionFiles(source, {
      fixturesUrl: options.fixtures ? asset("fixtures/") : undefined,
    }));

  /** Asks the embedder for preferences and saves what it submits. */
  async function askPreferences(
    declared: Declared,
    command: string,
    scope: WebPreferenceRequest["scope"],
    values: PreferenceValues,
  ) {
    if (!options.preferenceForm) return undefined;
    const store = createBrowserPreferenceStore(declared.extensionName, handlers.storage);
    const fields =
      scope === "extension"
        ? declared.extensionPreferences
        : preferenceFields(declared.extensionPreferences, declared.commandPreferences);
    const supplied = await options.preferenceForm({
      extension: declared.extensionName,
      command,
      scope,
      fields,
      values,
    });
    if (!supplied) return undefined;
    const extensionNames = new Set(declared.extensionPreferences.map((field) => field.name));
    const extensionValues: PreferenceValues = {};
    const commandValues: PreferenceValues = {};
    for (const [name, value] of Object.entries(supplied))
      (extensionNames.has(name) ? extensionValues : commandValues)[name] = value;
    store.update(extensionValues, command, commandValues);
    return supplied;
  }

  async function run(commandName: string) {
    // A command launched from the running one (`launchCommand`) replaces it.
    stopCommand();
    const generation = launches.current();
    const current = () => !closed && launches.isCurrent(generation);
    try {
      setStatus("Fetching extension…", false, true);
      draw({ type: "loading", extension: source, command: commandName });
      const built = options.bundlesUrl
        ? await loadPrebuiltCommand(
            { bundlesUrl: options.bundlesUrl, buildUrl: options.buildUrl },
            source,
            commandName,
          )
        : undefined;
      if (!current()) return;
      let files: Map<string, BrowserBundleFile>;
      let declared: Declared;
      let entry: string;
      let code: string;
      if (built) {
        files = built.files;
        declared = fromCatalog(built.manifest, commandName);
        entry = `/src/${commandName}.tsx`;
        code = built.code;
      } else {
        const extension = await fetchExtension();
        if (!current()) return;
        files = extension.files;
        declared = fromManifest(extension.manifest, commandName, source);
        entry = commandEntry(extension.files, commandName);
        setStatus("Installing…", false, true);
        const sources = (await (await fetch(asset("blast-sources.json"))).json()) as Record<
          string,
          string
        >;
        const installed = await installForBrowser({
          fetch: (value, init) => fetch(value, init),
          manifest: extension.manifest,
          ...(extension.lockfile === undefined ? {} : { lockfile: extension.lockfile }),
        });
        if (!current()) return;
        setStatus("Bundling…", false, true);
        const esbuild = await loadEsbuild();
        if (!current()) return;
        const bundleFiles = new Map<string, BrowserBundleFile>(Object.entries(sources));
        for (const [path, value] of extension.files) bundleFiles.set(path, value);
        code = (
          await bundleForBrowser({
            esbuild,
            files: bundleFiles,
            packages: installed.packages,
            command: entry,
            runtimeEntry: RUNTIME_ENTRY,
            aliases,
          })
        ).code;
        if (!current()) return;
      }
      extensionName = declared.extensionName;
      mode = declared.mode;

      const store = createBrowserPreferenceStore(extensionName, handlers.storage);
      let values: PreferenceValues = {
        ...preferenceDefaults(declared.extensionPreferences, declared.commandPreferences),
        ...store.values(commandName),
        ...options.preferences,
      } as PreferenceValues;
      const fields = preferenceFields(declared.extensionPreferences, declared.commandPreferences);
      const missing = missingPreferences(fields, values);
      if (missing.length > 0) {
        if (!options.preferenceForm)
          throw new Error(
            `Missing required preferences: ${missing.map((item) => item.title || item.name).join(", ")}`,
          );
        const supplied = await askPreferences(declared, commandName, "command", values);
        if (!current() || !supplied) return;
        values = { ...values, ...supplied };
        if (missingPreferences(fields, values).length)
          throw new Error("Required preferences are missing");
        setStatus("Fetching extension…", false, true);
        draw({ type: "loading", extension: source, command: commandName });
      }

      setStatus("Starting…", false, true);
      const active = await acquireSandbox(options);
      if (!current()) {
        disposeSandbox(active);
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
      for (const [path, value] of files) {
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
            { name: extensionName, commands: declared.commands.map((name) => ({ name })) },
          ],
        },
        ...(handlers.storage ? { storage: handlers.storage } : {}),
        ...(handlers.clipboard ? { clipboard: handlers.clipboard } : {}),
        ...(handlers.openUrl ? { openUrl: handlers.openUrl } : {}),
        status: (text, error) => setStatus(text, error === true),
        launchCommand: async (_source, command) => {
          void run(command);
        },
        openPreferences: (scope) => {
          if (!options.preferenceForm) {
            setStatus("Preferences are not available in this embed", true);
            return;
          }
          // Saved preferences reach a command when it launches, so it runs again.
          void askPreferences(declared, commandName, scope, { ...values }).then((supplied) => {
            if (supplied && current()) void run(commandName);
          });
        },
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
          scene = message;
          const result = controller.scene(message);
          if (firstScene) setStatus("Ready");
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
          if (message.code === 0) finish("exit");
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
          await active.execute(`${code}\nmodule.exports = null;`, `${assetsPath}/bundle.cjs`);
          if (current()) await portReady;
        })(),
        LAUNCH_TIMEOUT_MS,
        "waiting for runtime port",
      );
      if (!current() || !transferred) return;

      const title = options.commandTitle ?? declared.title;
      controller = createController({ platform, ...(title ? { fallbackTitle: title } : {}) });
      const launched = controller;
      launched.subscribe((view) => {
        if (current() && controller === launched) draw(view);
      });
      const shown = new Promise<void>((resolve, reject) => (firstScene = { resolve, reject }));
      port.postMessage({
        type: "init",
        protocol: 1,
        command: { extension: extensionName, name: commandName, entry, mode },
        preferences: { ...values },
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
      await withLaunchTimeout(shown, LAUNCH_TIMEOUT_MS, "waiting for first scene");
    } catch (error) {
      if (current()) fail(error);
    }
  }

  void (async () => {
    try {
      setStatus("Fetching extension…", false, true);
      draw({
        type: "loading",
        extension: source,
        ...(options.command ? { command: options.command } : {}),
      });
      if (!options.root) {
        const command = options.command ?? manifestCommands((await fetchExtension()).manifest)[0];
        if (!closed) await run(command ?? "index");
        return;
      }
      const manifest = (await fetchExtension()).manifest;
      if (closed) return;
      extensionName = String(manifest.name ?? source);
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
    } catch (error) {
      fail(error);
    }
  })();

  return {
    input,
    view: () => controller?.view(),
    close() {
      if (closed) return;
      stopCommand();
      closed = true;
      // A custom `render` owns what it drew into `element`.
      renderer?.destroy();
    },
  };
}
