import {
  createLineDecoder,
  createScenePatchApplier,
  encodeMessage,
  parseHostMessage,
  parseRuntimeMessage,
  PROTOCOL_VERSION,
  type HostMessage,
  type ProviderRequest,
  type ProviderResponse,
  type InitEnvironment,
  type JsonValue,
  type LogMessage,
  type SceneMessage,
} from "@blastlauncher/protocol";
import { execFileSync, spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createAIRouter } from "./ai.ts";
import type { Broker } from "./broker.ts";
import type { BundledCommand } from "./bundle.ts";
import type { RuntimePool } from "./runtime-pool.ts";
import { createStorage, defaultDataDir, storageFile } from "./storage.ts";

export type StartOptions = Omit<BundledCommand, "bundleMs"> & {
  broker: Broker;
  providerResponse?: (message: ProviderResponse) => void;
  dataDir?: string;
  preferences?: Record<string, JsonValue>;
  environment?: InitEnvironment;
  availableAPIs?: InitEnvironment["availableAPIs"];
  /** Manifest argument values for this launch, keyed by argument name. */
  argumentValues?: Record<string, string>;
  /** The `launchCommand` context, when another command started this one. */
  launchContext?: Record<string, JsonValue>;
  fallbackText?: string;
  nodePath?: string;
  handshakeTimeoutMs?: number;
  /**
   * Child environment; defaults to {@link runtimeEnvironment} (an allowlist,
   * not `process.env`) plus Node's compile cache under `<dataDir>/compile-cache/`.
   */
  env?: Record<string, string>;
  /** Extra variables the embedder opted in to (ignored when `env` is given). */
  inheritEnv?: InheritEnv;
  /** Oldest log entries are dropped beyond this many. */
  maxLogs?: number;
  /** Optional engine-owned standby worker pool (still one fresh process per command). */
  runtimePool?: RuntimePool;
};

// Variables a Node program needs to behave normally. Everything else in the
// host environment (tokens, credentials) is withheld from extension code.
const INHERITED_ENV = ["PATH", "HOME", "USER", "LANG", "LC_ALL", "TZ", "TMPDIR", "TEMP", "TMP"];

/**
 * Variables an embedder opts in to beyond {@link runtimeEnvironment}'s
 * allowlist: names copied from the host environment, or explicit values.
 */
export type InheritEnv = string[] | Record<string, string>;

export function runtimeEnvironment(
  source: NodeJS.ProcessEnv = process.env,
  inherit: InheritEnv = [],
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of [...INHERITED_ENV, ...(Array.isArray(inherit) ? inherit : [])]) {
    const value = source[name];
    if (value !== undefined) env[name] = value;
  }
  return Array.isArray(inherit) ? env : { ...env, ...inherit };
}
export type Exit = { code: number | null; signal: NodeJS.Signals | null; error?: Error };
export type Session = {
  readonly latestScene: SceneMessage | undefined;
  readonly logs: readonly LogMessage[];
  /** Subscribe to log lines as they arrive (no replay); returns unsubscribe. */
  onLog(callback: (log: LogMessage) => void): () => void;
  /** Subscribe to snapshots; immediately replays the latest one if present. */
  scenes(callback: (scene: SceneMessage) => void): () => void;
  sendProvider(message: ProviderRequest): void;
  sendEvent(node: string, handler: string, args: JsonValue[]): void;
  shutdown(options?: { timeoutMs?: number }): Promise<Exit>;
  exited: Promise<Exit>;
};

let resolvedNodePath: string | undefined;
/**
 * Default Node.js executable for runtime children. Under Node, reuse
 * `process.execPath` directly; under Bun, resolve `"node"` once so version
 * manager shims (mise, nvm, volta) are not re-invoked per launch.
 */
export function defaultNodePath(): string {
  if (resolvedNodePath !== undefined) return resolvedNodePath;
  if (!process.versions.bun) return (resolvedNodePath = process.execPath);
  try {
    const out = execFileSync("node", ["-p", "process.execPath"], { encoding: "utf8" }).trim();
    if (out) return (resolvedNodePath = out);
  } catch {
    // Fall back to PATH lookup if resolution fails.
  }
  return (resolvedNodePath = "node");
}

/** Resolves after the version handshake. Startup failures reject only after child cleanup. */
export async function startCommand(options: StartOptions): Promise<Session> {
  const ai = options.mode === "model-provider" ? undefined : createAIRouter(options);
  const capabilities = new Map<string, AbortController>();
  const entry = resolve(options.entry);
  const resolvedDataDir = resolve(options.dataDir ?? defaultDataDir());
  const supportPath =
    options.environment?.supportPath ??
    join(
      resolvedDataDir,
      "support",
      basename(storageFile("", options.extensionName), ".json").replace(/^\.{1,2}$/, (name) =>
        name.replaceAll(".", "%2e"),
      ),
    );
  const childNodePath = options.nodePath ?? defaultNodePath();
  const childEnv = options.env ?? {
    ...runtimeEnvironment(process.env, options.inheritEnv),
    // Production React/reconciler bundles avoid dev-mode fiber checks (~2.8x faster commits).
    NODE_ENV: "production",
    NODE_COMPILE_CACHE: join(resolvedDataDir, "compile-cache"),
  };

  // Run support directory creation and draft recall in parallel so launch I/O
  // doesn't serialize before the runtime receives `init`.
  const draftPromise: Promise<Record<string, JsonValue> | undefined> =
    options.mode === "view"
      ? (async () => {
          const internal = createStorage({
            extensionName: options.extensionName,
            dataDir: join(options.dataDir ?? defaultDataDir(), "internal"),
          });
          const stored = await internal.get(`blast:draft:${options.commandName}`);
          if (typeof stored === "string") {
            try {
              const parsed: unknown = JSON.parse(stored);
              if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
                return parsed as Record<string, JsonValue>;
              }
            } catch {
              // A corrupt draft must not block the launch; it is best-effort recall.
            }
          }
          return undefined;
        })()
      : Promise.resolve(undefined);

  const [, draftValues] = await Promise.all([
    mkdir(supportPath, { recursive: true }),
    draftPromise,
  ]);
  const init: HostMessage = {
    type: "init",
    protocol: PROTOCOL_VERSION,
    command: {
      entry,
      extension: options.extensionName,
      name: options.commandName,
      mode: options.mode,
      ...(options.argumentValues === undefined ? {} : { arguments: options.argumentValues }),
      ...(options.fallbackText === undefined ? {} : { fallbackText: options.fallbackText }),
      ...(options.launchContext === undefined ? {} : { launchContext: options.launchContext }),
      ...(draftValues === undefined ? {} : { draftValues }),
    },
    preferences: { ...options.preferenceDefaults, ...options.preferences },
    environment: options.environment ?? {
      extensionName: options.extensionName,
      commandName: options.commandName,
      ownerOrAuthorName: options.ownerOrAuthorName ?? "",
      assetsPath: options.assetsPath ?? join(dirname(entry), "assets"),
      supportPath,
      isDevelopment: true,
      // The client can supply its UI theme.
      appearance: "dark",
      textSize: "medium",
      availableAPIs: options.availableAPIs ?? [],
    },
  };
  const checked = parseHostMessage(init);
  if (!checked.ok) throw new Error(checked.error);
  const child =
    options.runtimePool && !options.env
      ? options.runtimePool.acquire({ nodePath: childNodePath, env: childEnv })
      : spawn(childNodePath, [fileURLToPath(import.meta.resolve("@blastlauncher/runtime/main"))], {
          stdio: ["pipe", "pipe", "pipe"],
          // The runtime is TypeScript Node strips on every start; with its
          // compile cache a warm runtime loads in ~55 ms instead of ~300 ms.
          env: childEnv,
        });
  const patchApplier = createScenePatchApplier();
  let ready = false;
  let closed = false;
  let failure: Error | undefined;
  let stderr = "";
  let latestScene: SceneMessage | undefined;
  const logs: LogMessage[] = [];
  const maxLogs = options.maxLogs ?? 1000;
  const logListeners = new Set<(log: LogMessage) => void>();
  function addLog(log: LogMessage) {
    logs.push(log);
    if (logs.length > maxLogs) logs.splice(0, logs.length - maxLogs);
    for (const listener of logListeners) listener(log);
  }
  const listeners = new Set<(scene: SceneMessage) => void>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let resolveExit: (exit: Exit) => void;
  const exited = new Promise<Exit>((done) => {
    resolveExit = done;
  });
  let resolveReady: () => void;
  const handshake = new Promise<void>((done) => {
    resolveReady = done;
  });
  function fail(error: Error) {
    failure ??= error;
    child.kill("SIGKILL");
  }
  function protocolError(message: string) {
    fail(Object.assign(new Error(message), { code: "PROTOCOL_ERROR" }));
  }
  function send(message: HostMessage) {
    if (closed || child.stdin.destroyed) return;
    const parsed = parseHostMessage(message);
    if (!parsed.ok) throw new Error(parsed.error);
    child.stdin.write(encodeMessage(parsed.message));
  }
  const decoder = createLineDecoder({
    onError: protocolError,
    onLine(value) {
      if (failure) return;
      const parsed = parseRuntimeMessage(value);
      if (!parsed.ok) return protocolError(parsed.error);
      const message = parsed.message;
      if (!ready) {
        if (message.type === "error")
          return fail(Object.assign(new Error(message.message), { code: message.code }));
        if (message.type !== "ready" || message.protocol !== PROTOCOL_VERSION)
          return protocolError("Expected matching ready handshake");
        ready = true;
        clearTimeout(handshakeTimer);
        resolveReady();
        return;
      }
      switch (message.type) {
        case "provider.models":
        case "provider.part":
        case "provider.end":
        case "provider.error":
          if (options.mode !== "model-provider")
            return protocolError("Provider response in command session");
          options.providerResponse?.(message);
          break;
        case "ready":
          return protocolError("Duplicate ready handshake");
        case "scene":
          latestScene = patchApplier.reset(message);
          for (const listener of listeners) listener(latestScene);
          break;
        case "scene.patch":
          try {
            latestScene = patchApplier.apply(message);
          } catch (error) {
            return protocolError(error instanceof Error ? error.message : String(error));
          }
          for (const listener of listeners) listener(latestScene);
          break;
        case "log":
          addLog(message);
          break;
        case "error":
          addLog({ type: "log", level: "error", message: `${message.code}: ${message.message}` });
          if (message.fatal)
            failure ??= Object.assign(new Error(message.message), { code: message.code });
          break;
        case "capability.cancel":
          capabilities.get(message.id)?.abort();
          break;
        case "capability.request": {
          const controller = new AbortController();
          capabilities.set(message.id, controller);
          void (ai?.broker ?? options.broker)(message, {
            signal: controller.signal,
            progress: (chunk) => {
              if (!controller.signal.aborted)
                send({ type: "capability.progress", id: message.id, value: chunk });
            },
          })
            .then(send)
            .catch((error) => fail(error instanceof Error ? error : new Error(String(error))))
            .finally(() => capabilities.delete(message.id));
          break;
        }
      }
    },
  });
  const handshakeTimer = setTimeout(
    () => fail(new Error("Runtime handshake timed out")),
    options.handshakeTimeoutMs ?? 5000,
  );
  child.stdout.on("data", (chunk: Buffer) => decoder.push(chunk));
  child.stdout.on("end", () => decoder.end());
  child.stderr.setEncoding("utf8").on("data", (message: string) => {
    stderr += message;
    addLog({ type: "log", level: "error", message });
  });
  let shutdown: Promise<Exit> | undefined;
  child.stdin.on("error", (error: NodeJS.ErrnoException) => {
    // Once shutdown has begun (or a no-view command exits on its own right as
    // shutdown writes), EPIPE on stdin only means the child already closed it.
    if (shutdown && (error.code === "EPIPE" || error.code === "ERR_STREAM_DESTROYED")) return;
    fail(error);
  });
  child.on("error", fail);
  child.on("close", async (code, signal) => {
    closed = true;
    clearTimeout(handshakeTimer);
    for (const timer of timers) clearTimeout(timer);
    listeners.clear();
    for (const controller of capabilities.values()) controller.abort();
    await ai?.shutdown();
    const startupError =
      failure ??
      (!ready && stderr.trim() !== ""
        ? new Error(`Runtime exited before ready: ${stderr.trim().slice(-1000)}`)
        : undefined);
    resolveExit({ code, signal, ...(startupError ? { error: startupError } : {}) });
  });
  send(init);
  await Promise.race([
    handshake,
    exited.then((exit) => {
      throw exit.error ?? new Error("Runtime exited before ready");
    }),
  ]);
  return {
    get latestScene() {
      return latestScene;
    },
    get logs() {
      return logs;
    },
    onLog(callback) {
      logListeners.add(callback);
      return () => {
        logListeners.delete(callback);
      };
    },
    scenes(callback) {
      if (!closed) listeners.add(callback);
      if (latestScene) callback(latestScene);
      return () => {
        listeners.delete(callback);
      };
    },
    sendProvider: send,
    sendEvent(node, handler, args) {
      send({ type: "event", node, handler, args });
    },
    shutdown({ timeoutMs = 1000 } = {}) {
      if (shutdown || closed) return shutdown ?? exited;
      shutdown = exited;
      send({ type: "shutdown" });
      timers.add(
        setTimeout(() => {
          child.kill("SIGTERM");
          timers.add(setTimeout(() => child.kill("SIGKILL"), timeoutMs));
        }, timeoutMs),
      );
      return shutdown;
    },
    exited,
  };
}
