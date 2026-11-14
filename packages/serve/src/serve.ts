import { join } from "node:path";
import {
  createEngine,
  BundleTimeoutError,
  DependenciesRequiredError,
  MissingLaunchValuesError,
  startLaunchFlow,
  type CapabilityHandler,
  type ExtensionHandle,
  type LaunchFlow,
  type Root,
} from "@blastlauncher/host";
import { createNativeHandlers } from "@blastlauncher/native";
import { createController, type ControllerResult } from "@blastlauncher/client-core";
import {
  CAPABILITIES,
  DEFAULT_MAX_LINE_BYTES,
  EMBEDDER_PROTOCOL_VERSION,
  parseEmbedderMessage,
  type EmbedderParams,
  type EmbedderRequest,
  type EmbedderViews,
  type JsonValue,
  type EmbedderServerMessage,
} from "@blastlauncher/protocol";

// One server per process: the state below is module-level and `serve` starts it.
let engine: ReturnType<typeof createEngine>;
// The hello's `views`: what a launch without its own `views` gets.
let defaultViews: EmbedderViews | undefined;
const extensionDirs = new Map<string, string>();
const extensions = new Map<string, ExtensionHandle>();
const watches = new Map<string, () => void>();
const sessions = new Map<string, { close(): Promise<void> }>();
const extensionSessions = new Map<string, Set<string>>();
const roots = new Map<string, Root>();
// Sessions still in their launch prompts: input goes to the flow, not a controller.
const flows = new Map<string, LaunchFlow>();
const controllers = new Map<string, ReturnType<typeof createController>>();
const sessionTimers = new Map<string, Set<ReturnType<typeof setTimeout>>>();
function clearTimers(key: string) {
  for (const timer of sessionTimers.get(key) ?? []) clearTimeout(timer);
  sessionTimers.delete(key);
  controllers.delete(key);
}
function apply(key: string, result: ControllerResult) {
  if (stopping || !controllers.has(key)) return;
  for (const value of result.events)
    get(liveSessions, key).sendEvent(value.node, value.handler, value.args);
  for (const effect of result.effects) {
    if (effect.type === "quit") {
      clearTimers(key);
      void get(sessions, key).close();
      break;
    }
    const timers = get(sessionTimers, key);
    const timer = setTimeout(() => {
      timers.delete(timer);
      const controller = controllers.get(key);
      if (controller) apply(key, controller.tick(effect.token));
    }, effect.ms);
    timers.add(timer);
  }
}
const pending = new Map<
  string,
  { resolve(value: JsonValue): void; reject(error: Error): void; progress(value: JsonValue): void }
>();
const operations = new Map<string, Promise<void>>();
let finish: (code: number) => void = () => {};
let sequence = 0,
  ready = false,
  stopping = false;
let capabilities: string[] = [];
const id = () => String(++sequence);
const json = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value)) as JsonValue;
const send = (message: EmbedderServerMessage) => {
  process.stdout.write(`${JSON.stringify(message)}\n`);
};
const errorInfo = (error: unknown) => ({
  code:
    error instanceof BundleTimeoutError
      ? error.code
      : error instanceof DependenciesRequiredError
        ? "missing_dependencies"
        : "failed",
  message: error instanceof Error ? error.message : String(error),
  ...(error instanceof BundleTimeoutError
    ? {
        data: json({
          extension: error.extension,
          command: error.command,
          timeoutMs: error.timeoutMs,
        }),
      }
    : error instanceof DependenciesRequiredError
      ? {
          data: json({
            unresolved: error.unresolved,
            installable: error.installable,
            pinned: error.pinned,
          }),
        }
      : {}),
});
const protocolError = (message: string, code = "invalid_message") =>
  send({ type: "error", error: { code, message } });
const event = (eventName: string, values: Record<string, JsonValue>) =>
  send({ type: "event", event: eventName, ...values });
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const key of controllers.keys()) clearTimers(key);
  for (const flow of flows.values()) flow.cancel();
  process.stdin.pause();
  for (const [key, operation] of pending) {
    send({ type: "capability.cancel", id: key });
    operation.reject(new Error("Embedder disconnected"));
  }
  pending.clear();
  await Promise.allSettled(operations.values());
  await engine.close();
  process.exitCode = code;
  process.stdin.destroy();
  finish(code);
}
function forwarding(session: string): Record<string, CapabilityHandler> {
  return Object.fromEntries(
    capabilities.map((name) => [
      name,
      (params, context) =>
        new Promise<JsonValue>((resolve, reject) => {
          if (stopping || context?.signal.aborted) {
            reject(new Error("Capability cancelled"));
            return;
          }
          const key = id();
          const cancel = () => {
            send({ type: "capability.cancel", id: key });
            pending.delete(key);
            reject(new Error("Capability cancelled"));
          };
          const clean = () => context?.signal.removeEventListener("abort", cancel);
          pending.set(key, {
            resolve: (value) => {
              clean();
              resolve(value);
            },
            reject: (error) => {
              clean();
              reject(error);
            },
            progress: (value) => context?.progress(value),
          });
          context?.signal.addEventListener("abort", cancel, { once: true });
          send({ type: "capability.request", id: key, session, name, params });
        }),
    ]),
  );
}
function get<T>(map: Map<string, T>, key: string): T {
  const value = map.get(key);
  if (!value) throw new Error(`Unknown handle: ${key}`);
  return value;
}
async function request(message: EmbedderRequest): Promise<JsonValue> {
  const p = message.params;
  if (message.method === "engine.shutdown") return null;
  if (message.method === "extension.open") {
    const extension = engine.openExtension({ extensionDir: message.params.dir });
    try {
      await extension.manifest();
    } catch (error) {
      await extension.close();
      throw error;
    }
    const key = id();
    extensions.set(key, extension);
    extensionDirs.set(key, message.params.dir);
    return { extension: key };
  }
  if (message.method === "root.open") {
    const views = message.params.views ?? defaultViews;
    if (!views) throw new Error("root.open needs views, in its params or the hello");
    const key = id();
    const root = engine.root({
      views,
      // The root only lists and picks; the session is an ordinary one (with
      // prompts), so its views and capabilities flow like extension.launch's.
      launch: async ({ extension: handle, command, configure }) => {
        const extension = [...extensions].find(([, candidate]) => candidate === handle)?.[0];
        if (!extension) throw new Error("Extension is closed");
        const { exited } = await launchSession(
          extension,
          { extension, command, views, prompts: true },
          configure ? "configure" : "launch",
          (started) => event("root.launched", { root: key, session: started }),
        );
        return { exited };
      },
    });
    roots.set(key, root);
    await root.ready();
    root.subscribe((view) => event("root.view", { root: key, view: json(view) }));
    return { root: key };
  }
  if (message.method === "root.input") {
    get(roots, message.params.root).input(message.params.input);
    return null;
  }
  if (message.method === "root.close") {
    await get(roots, message.params.root).close();
    roots.delete(message.params.root);
    return null;
  }
  if (message.method === "session.close") {
    clearTimers(message.params.session);
    await get(sessions, message.params.session).close();
    return null;
  }
  if (message.method === "session.event") {
    const { session, node, handler, args } = message.params;
    get(sessions, session);
    get(liveSessions, session).sendEvent(node, handler, args);
    return null;
  }
  if (message.method === "session.input") {
    const { session, input } = message.params;
    const flow = flows.get(session);
    if (flow) flow.input(input);
    else apply(session, get(controllers, session).input(input));
    return null;
  }
  if (!("extension" in p)) throw new Error("Missing extension");
  const extension = get(extensions, p.extension);
  switch (message.method) {
    case "extension.manifest":
      return json(await extension.manifest());
    case "extension.watch": {
      watches.get(p.extension)?.();
      watches.set(
        p.extension,
        extension.watch((update) => {
          if (update instanceof Error)
            event("manifest.error", { extension: p.extension, error: errorInfo(update) });
          else event("manifest.changed", { extension: p.extension, manifest: json(update) });
        }),
      );
      return null;
    }
    case "extension.unwatch":
      watches.get(p.extension)?.();
      watches.delete(p.extension);
      return null;
    case "extension.dependencies.check":
      return json(await extension.dependencies.check());
    case "extension.dependencies.install":
      return json(
        await extension.dependencies.install({
          onLog: (logMessage) =>
            event("dependencies.log", { extension: p.extension, message: logMessage }),
        }),
      );
    case "extension.preferences":
      return json(await extension.preferences(message.params.command));
    case "extension.savePreferences":
      await extension.savePreferences(message.params.command, message.params.values);
      return null;
    case "extension.launch":
      return { session: (await launchSession(p.extension, message.params)).session };
    case "extension.configure":
      return {
        session: (await launchSession(p.extension, message.params, "configure")).session,
      };
    case "extension.close":
      // Stop timer input before the extension begins shutting down its runtimes.
      // Sessions from other extensions retain their controllers.
      for (const key of extensionSessions.get(p.extension) ?? []) clearTimers(key);
      await extension.close();
      extensionSessions.delete(p.extension);
      extensions.delete(p.extension);
      extensionDirs.delete(p.extension);
      watches.delete(p.extension);
      return null;
  }
}
const liveSessions = new Map<string, Awaited<ReturnType<ExtensionHandle["launch"]>>["session"]>();
type LaunchParams = Omit<EmbedderParams["extension.launch"], "prompts"> & { prompts?: boolean };
/**
 * Starts a command and streams its session; `started` runs before its first
 * event. With `prompts` (or `configure`) the session starts at once and the
 * launch flow's views come first, under the same session id.
 */
async function launchSession(
  extensionKey: string,
  params: LaunchParams,
  mode: "launch" | "configure" = "launch",
  started?: (session: string) => void,
): Promise<{ session: string; exited: Promise<void> }> {
  const extension = get(extensions, extensionKey);
  const key = id();
  const views = params.views ?? defaultViews;
  const launchOptions = {
    ...params,
    ...(params.bundleTimeoutMs === undefined ? {} : { timeoutMs: params.bundleTimeoutMs }),
    onDependencyLog: (logMessage: string) =>
      event("dependencies.log", { extension: extensionKey, message: logMessage }),
    handlers: forwarding(key),
  };
  const track = (session: { close(): Promise<void> }) => {
    sessions.set(key, session);
    if (!extensionSessions.has(extensionKey)) extensionSessions.set(extensionKey, new Set());
    extensionSessions.get(extensionKey)!.add(key);
  };
  if (!params.prompts && mode === "launch") {
    const opened = await extension.launch(params.command, launchOptions);
    track(opened);
    return { session: key, exited: stream(extensionKey, key, opened, views, started) };
  }
  if (!views) throw new Error("Launch prompts need views, in the params or the hello");
  const flow = startLaunchFlow(extension, params.command, {
    views,
    launch: launchOptions,
    configure: mode === "configure",
  });
  const ended = Promise.withResolvers<void>();
  const end = (exit: { code: number; error?: unknown }) => {
    event("session.exited", {
      session: key,
      code: exit.code,
      ...(exit.error ? { error: errorInfo(exit.error) } : {}),
    });
    sessions.delete(key);
    extensionSessions.get(extensionKey)?.delete(key);
    ended.resolve();
  };
  flows.set(key, flow);
  track({ close: async () => flow.cancel() });
  started?.(key);
  // The flow's current view is an empty placeholder; the first real view is its form or toast.
  let current = true;
  const stopViews = flow.subscribe((view) => {
    if (current) current = false;
    else event("session.view", { session: key, view: json(view) });
  });
  const settled = () => {
    stopViews();
    flows.delete(key);
  };
  void flow.opened.then(
    (opened) => {
      settled();
      if (!opened) return end({ code: 0 });
      track(opened);
      void stream(extensionKey, key, opened, views, undefined, true).then(ended.resolve);
    },
    (error: unknown) => {
      settled();
      end({ code: 1, error });
    },
  );
  return { session: key, exited: ended.promise };
}
/** Streams an opened command's scenes, views and logs; resolves when its session ends. */
async function stream(
  extensionKey: string,
  key: string,
  opened: Awaited<ReturnType<ExtensionHandle["launch"]>>,
  views: EmbedderViews | undefined,
  started?: (session: string) => void,
  announce = false,
): Promise<void> {
  liveSessions.set(key, opened.session);
  started?.(key);
  const controller = views
    ? createController({
        ...views,
        assetsDir: join(extensionDirs.get(extensionKey) ?? "", "assets"),
      })
    : undefined;
  if (controller) {
    controllers.set(key, controller);
    sessionTimers.set(key, new Set());
  }
  const stopViews = controller?.subscribe((view) =>
    event("session.view", { session: key, view: json(view) }),
  );
  // After prompts the embedder is still drawing the last prompt view: replace it.
  if (announce && controller)
    event("session.view", { session: key, view: json(controller.view()) });
  const unsubscribe = opened.session.scenes((scene) => {
    event("session.scene", { session: key, scene: json(scene) });
    if (controller && controllers.has(key)) apply(key, controller.scene(scene));
  });
  // Logs that arrived during startup are replayed once, then streamed.
  for (const log of opened.session.logs) event("session.log", { session: key, log: json(log) });
  const stopLogs = opened.session.onLog((log) =>
    event("session.log", { session: key, log: json(log) }),
  );
  const exit = await opened.session.exited;
  stopLogs();
  unsubscribe();
  stopViews?.();
  clearTimers(key);
  event("session.exited", {
    session: key,
    code: exit.code,
    ...(exit.error ? { error: errorInfo(exit.error) } : {}),
  });
  await opened.close();
  sessions.delete(key);
  liveSessions.delete(key);
  extensionSessions.get(extensionKey)?.delete(key);
}
function receive(value: unknown) {
  if (stopping) return;
  const parsed = parseEmbedderMessage(value);
  if (!parsed.ok) {
    protocolError(parsed.error);
    return;
  }
  const message = parsed.message;
  if (!ready) {
    if (message.type !== "hello") {
      protocolError("Expected hello");
      return;
    }
    if (message.protocol !== EMBEDDER_PROTOCOL_VERSION) {
      protocolError("Unsupported embedder protocol version", "version_mismatch");
      void stop(2);
      return;
    }
    if (message.capabilities.some((name) => !Object.hasOwn(CAPABILITIES, name))) {
      protocolError("Unknown capability name");
      return;
    }
    capabilities = message.capabilities;
    defaultViews = message.views || undefined;
    ready = true;
    send({
      type: "welcome",
      protocol: EMBEDDER_PROTOCOL_VERSION,
      engine: { version: "0.0.0" },
      catalog: json(CAPABILITIES),
    });
    return;
  }
  if (message.type === "hello") {
    protocolError("Already initialized");
    return;
  }
  if (message.type === "capability.progress") {
    pending.get(message.id)?.progress(message.value);
    return;
  }
  if (message.type === "capability.result") {
    const operation = pending.get(message.id);
    pending.delete(message.id);
    if (message.ok) operation?.resolve(message.value);
    else operation?.reject(new Error(message.error.message));
    return;
  }
  if (operations.has(message.id)) {
    protocolError("Duplicate outstanding request id");
    return;
  }
  const operation = Promise.resolve()
    .then(async () => {
      try {
        send({ type: "response", id: message.id, ok: true, result: await request(message) });
      } catch (error) {
        const info =
          error instanceof MissingLaunchValuesError
            ? {
                code: "missing_values",
                message: error.message,
                data: json({ preferences: error.preferences, arguments: error.arguments }),
              }
            : errorInfo(error);
        send({ type: "response", id: message.id, ok: false, error: info });
      }
    })
    .finally(() => {
      operations.delete(message.id);
      if (message.method === "engine.shutdown") void stop();
    });
  operations.set(message.id, operation);
}
function dependencyPolicy(args: string[]): "manual" | "auto" {
  const flag = args.findIndex(
    (value) => value === "--dependencies" || value.startsWith("--dependencies="),
  );
  if (flag < 0) return "auto";
  const given = args[flag]!.includes("=")
    ? args[flag]!.slice(args[flag]!.indexOf("=") + 1)
    : args[flag + 1];
  if (given !== "manual" && given !== "auto")
    throw new Error(`--dependencies must be manual or auto, got ${given}`);
  return given;
}

/**
 * Run the embedder protocol on stdin/stdout until the embedder disconnects or
 * shuts the engine down; resolves with the process exit code. `args` are the
 * command-line flags: `--native` (opt-in host capabilities) and
 * `--dependencies manual|auto` (default auto).
 */
export function serve(args: string[]): Promise<number> {
  engine = createEngine({
    dependencies: dependencyPolicy(args),
    handlers: args.includes("--native") ? createNativeHandlers() : {},
  });
  const done = new Promise<number>((resolve) => {
    finish = resolve;
  });
  // Recover at newline after a bad/oversized line without retaining its bytes.
  let chunks: Buffer[] = [],
    size = 0,
    oversized = false;
  process.stdin.on("data", (chunk: Buffer) => {
    let start = 0;
    for (let i = 0; i <= chunk.length; i++) {
      if (i !== chunk.length && chunk[i] !== 10) continue;
      const part = chunk.subarray(start, i);
      size += part.length;
      if (!oversized && size > DEFAULT_MAX_LINE_BYTES) {
        oversized = true;
        chunks = [];
        protocolError("Line exceeds 8 MiB");
      }
      if (!oversized) chunks.push(part);
      if (i < chunk.length) {
        if (!oversized) {
          try {
            const line = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
            if (line.trim()) receive(JSON.parse(line));
          } catch (error) {
            protocolError(errorInfo(error).message);
          }
        }
        chunks = [];
        size = 0;
        oversized = false;
      }
      start = i + 1;
    }
  });
  process.stdin.on("end", () => {
    if (size && !oversized) protocolError("Unterminated line");
    void stop();
  });
  return done;
}
