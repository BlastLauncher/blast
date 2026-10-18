import {
  createLineDecoder,
  encodeMessage,
  parseHostMessage,
  parseRuntimeMessage,
  PROTOCOL_VERSION,
  type HostMessage,
  type InitEnvironment,
  type JsonValue,
  type LogMessage,
  type SceneMessage,
} from "@blastlauncher/protocol";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Broker } from "./broker.ts";
import type { BundledCommand } from "./bundle.ts";
import { defaultDataDir, storageFile } from "./storage.ts";

export type StartOptions = BundledCommand & {
  broker: Broker;
  dataDir?: string;
  preferences?: Record<string, JsonValue>;
  environment?: InitEnvironment;
  /** Manifest argument values for this launch, keyed by argument name. */
  argumentValues?: Record<string, string>;
  /** The `launchCommand` context, when another command started this one. */
  launchContext?: Record<string, JsonValue>;
  nodePath?: string;
  handshakeTimeoutMs?: number;
  /** Child environment; defaults to {@link runtimeEnvironment} (an allowlist, not `process.env`). */
  env?: Record<string, string>;
  /** Oldest log entries are dropped beyond this many. */
  maxLogs?: number;
};

// Variables a Node program needs to behave normally. Everything else in the
// host environment (tokens, credentials) is withheld from extension code.
const INHERITED_ENV = ["PATH", "HOME", "USER", "LANG", "LC_ALL", "TZ", "TMPDIR", "TEMP", "TMP"];

export function runtimeEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of INHERITED_ENV) {
    const value = source[name];
    if (value !== undefined) env[name] = value;
  }
  return env;
}
export type Exit = { code: number | null; signal: NodeJS.Signals | null; error?: Error };
export type Session = {
  readonly latestScene: SceneMessage | undefined;
  readonly logs: readonly LogMessage[];
  /** Subscribe to snapshots; immediately replays the latest one if present. */
  scenes(callback: (scene: SceneMessage) => void): () => void;
  sendEvent(node: string, handler: string, args: JsonValue[]): void;
  shutdown(options?: { timeoutMs?: number }): Promise<Exit>;
  exited: Promise<Exit>;
};

/** Resolves after the version handshake. Startup failures reject only after child cleanup. */
export async function startCommand(options: StartOptions): Promise<Session> {
  const entry = resolve(options.entry);
  const supportPath =
    options.environment?.supportPath ??
    join(
      resolve(options.dataDir ?? defaultDataDir()),
      "support",
      basename(storageFile("", options.extensionName), ".json").replace(/^\.{1,2}$/, (name) =>
        name.replaceAll(".", "%2e"),
      ),
    );
  await mkdir(supportPath, { recursive: true });
  const init: HostMessage = {
    type: "init",
    protocol: PROTOCOL_VERSION,
    command: {
      entry,
      extension: options.extensionName,
      name: options.commandName,
      mode: options.mode,
      ...(options.argumentValues === undefined ? {} : { arguments: options.argumentValues }),
      ...(options.launchContext === undefined ? {} : { launchContext: options.launchContext }),
    },
    preferences: { ...options.preferenceDefaults, ...options.preferences },
    environment: options.environment ?? {
      extensionName: options.extensionName,
      commandName: options.commandName,
      ownerOrAuthorName: options.ownerOrAuthorName ?? "",
      assetsPath: options.assetsPath ?? join(dirname(entry), "assets"),
      supportPath,
      isDevelopment: true,
      // A headless host has no UI; the client can send its real theme.
      appearance: "dark",
      textSize: "medium",
    },
  };
  const checked = parseHostMessage(init);
  if (!checked.ok) throw new Error(checked.error);
  const child = spawn(
    options.nodePath ?? "node",
    [fileURLToPath(import.meta.resolve("@blastlauncher/runtime/main"))],
    { stdio: ["pipe", "pipe", "pipe"], env: options.env ?? runtimeEnvironment() },
  );
  let ready = false;
  let closed = false;
  let failure: Error | undefined;
  let latestScene: SceneMessage | undefined;
  const logs: LogMessage[] = [];
  const maxLogs = options.maxLogs ?? 1000;
  function addLog(log: LogMessage) {
    logs.push(log);
    if (logs.length > maxLogs) logs.splice(0, logs.length - maxLogs);
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
        case "ready":
          return protocolError("Duplicate ready handshake");
        case "scene":
          latestScene = message;
          for (const listener of listeners) listener(message);
          break;
        case "log":
          addLog(message);
          break;
        case "error":
          addLog({ type: "log", level: "error", message: `${message.code}: ${message.message}` });
          if (message.fatal)
            failure ??= Object.assign(new Error(message.message), { code: message.code });
          break;
        case "capability.request":
          void options
            .broker(message)
            .then(send)
            .catch((error) => fail(error instanceof Error ? error : new Error(String(error))));
      }
    },
  });
  const handshakeTimer = setTimeout(
    () => fail(new Error("Runtime handshake timed out")),
    options.handshakeTimeoutMs ?? 5000,
  );
  child.stdout.on("data", (chunk: Buffer) => decoder.push(chunk));
  child.stdout.on("end", () => decoder.end());
  child.stderr
    .setEncoding("utf8")
    .on("data", (message: string) => addLog({ type: "log", level: "error", message }));
  child.stdin.on("error", fail);
  child.on("error", fail);
  child.on("close", (code, signal) => {
    closed = true;
    clearTimeout(handshakeTimer);
    for (const timer of timers) clearTimeout(timer);
    listeners.clear();
    resolveExit({ code, signal, ...(failure ? { error: failure } : {}) });
  });
  send(init);
  await Promise.race([
    handshake,
    exited.then((exit) => {
      throw exit.error ?? new Error("Runtime exited before ready");
    }),
  ]);
  let shutdown: Promise<Exit> | undefined;
  return {
    get latestScene() {
      return latestScene;
    },
    get logs() {
      return logs;
    },
    scenes(callback) {
      if (!closed) listeners.add(callback);
      if (latestScene) callback(latestScene);
      return () => {
        listeners.delete(callback);
      };
    },
    sendEvent(node, handler, args) {
      send({ type: "event", node, handler, args });
    },
    shutdown({ timeoutMs = 1000 } = {}) {
      if (shutdown || closed) return shutdown ?? exited;
      send({ type: "shutdown" });
      timers.add(
        setTimeout(() => {
          child.kill("SIGTERM");
          timers.add(setTimeout(() => child.kill("SIGKILL"), timeoutMs));
        }, timeoutMs),
      );
      shutdown = exited;
      return shutdown;
    },
    exited,
  };
}
