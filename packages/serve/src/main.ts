import {
  createEngine,
  MissingLaunchValuesError,
  type CapabilityHandler,
  type ExtensionHandle,
} from "@blastlauncher/host";
import { createNativeHandlers } from "@blastlauncher/native";
import {
  CAPABILITIES,
  DEFAULT_MAX_LINE_BYTES,
  EMBEDDER_PROTOCOL_VERSION,
  parseEmbedderMessage,
  type EmbedderRequest,
  type JsonValue,
  type EmbedderServerMessage,
} from "@blastlauncher/protocol";

const engine = createEngine({
  handlers: process.argv.includes("--native") ? createNativeHandlers() : {},
});
const extensions = new Map<string, ExtensionHandle>();
const watches = new Map<string, () => void>();
const sessions = new Map<string, { close(): Promise<void> }>();
const pending = new Map<
  string,
  { resolve(value: JsonValue): void; reject(error: Error): void; progress(value: JsonValue): void }
>();
const operations = new Map<string, Promise<void>>();
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
  code: "failed",
  message: error instanceof Error ? error.message : String(error),
});
const protocolError = (message: string, code = "invalid_message") =>
  send({ type: "error", error: { code, message } });
const event = (eventName: string, values: Record<string, JsonValue>) =>
  send({ type: "event", event: eventName, ...values });
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
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
    return { extension: key };
  }
  if (message.method === "session.close") {
    await get(sessions, message.params.session).close();
    return null;
  }
  if (message.method === "session.event") {
    const { session, node, handler, args } = message.params;
    get(sessions, session);
    get(liveSessions, session).sendEvent(node, handler, args);
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
    case "extension.launch": {
      const key = id();
      const opened = await extension.launch(message.params.command, {
        ...message.params,
        handlers: forwarding(key),
      });
      sessions.set(key, opened);
      liveSessions.set(key, opened.session);
      const unsubscribe = opened.session.scenes((scene) =>
        event("session.scene", { session: key, scene: json(scene) }),
      );
      let lastLog: object | undefined;
      const logs = () => {
        const entries = opened.session.logs;
        const start = lastLog ? entries.indexOf(lastLog as (typeof entries)[number]) + 1 : 0;
        for (const log of entries.slice(start)) {
          event("session.log", { session: key, log: json(log) });
          lastLog = log;
        }
      };
      const timer = setInterval(logs, 10);
      void opened.session.exited.then(async (exit) => {
        clearInterval(timer);
        logs();
        unsubscribe();
        event("session.exited", {
          session: key,
          code: exit.code,
          ...(exit.error ? { error: errorInfo(exit.error) } : {}),
        });
        await opened.close();
        sessions.delete(key);
        liveSessions.delete(key);
      });
      return { session: key };
    }
    case "extension.close":
      await extension.close();
      extensions.delete(p.extension);
      watches.delete(p.extension);
      return null;
  }
}
const liveSessions = new Map<string, Awaited<ReturnType<ExtensionHandle["launch"]>>["session"]>();
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
