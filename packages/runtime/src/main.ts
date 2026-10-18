import {
  createLineDecoder,
  encodeMessage,
  parseHostMessage,
  PROTOCOL_VERSION,
  type HostMessage,
  type JsonValue,
  type LogLevel,
  type RuntimeMessage,
} from "@blastlauncher/protocol";
import { Console } from "node:console";
import { registerHooks } from "node:module";
import { Writable } from "node:stream";
import { pathToFileURL } from "node:url";
import { format } from "node:util";
import { createElement, type ComponentType } from "react";
import { setCapabilityRequester } from "./api/capability.ts";
import { setEnvironment } from "./api/environment.ts";
import { setFeedbackMount } from "./api/feedback.ts";
import { LaunchType, type LaunchProps } from "./api/launch.ts";
import { NavigationProvider } from "./api/navigation.ts";
import { setPreferenceValues } from "./api/preferences.ts";
import { UnsupportedApiError } from "./api/unsupported.ts";
import { createSceneRoot } from "./reconciler/index.ts";

let stopping = false;
let initialized = false;
let loaded = false;
let nextRequest = 1;
const pending = new Map<string, { resolve(value: JsonValue): void; reject(error: Error): void }>();

// Protocol output owns the real stdout stream. Extension code that writes to
// `process.stdout` (or a library doing it for them) must not corrupt the NDJSON
// framing, so those writes become log messages instead. The protocol keeps its
// own reference to the original writer.
const writeToStdout = process.stdout.write.bind(process.stdout);
process.stdout.write = ((chunk: unknown, encoding?: unknown, callback?: unknown) => {
  const done = typeof encoding === "function" ? encoding : callback;
  log("info", [String(chunk).replace(/\n$/, "")]);
  if (typeof done === "function") queueMicrotask(done as () => void);
  return true;
}) as typeof process.stdout.write;

function send(message: RuntimeMessage) {
  if (!stopping) writeToStdout(encodeMessage(message));
}
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
function finish(code: number) {
  if (stopping) return;
  stopping = true;
  process.stdin.pause();
  setCapabilityRequester(undefined);
  pending.clear();
  // Explicit exit also stops extension timers; wait for protocol output to drain.
  process.stdout.end(() => process.exit(code));
}
function fatal(error: unknown, code = "RUNTIME_ERROR") {
  send({
    type: "error",
    code: error instanceof UnsupportedApiError ? error.code : code,
    message: errorMessage(error),
    fatal: true,
  });
  finish(1);
}
function log(level: LogLevel, args: unknown[]) {
  send({ type: "log", level, message: format(...args) });
}
function logStream(level: LogLevel) {
  return new Writable({
    write(chunk, _encoding, callback) {
      log(level, [String(chunk).replace(/\n$/, "")]);
      callback();
    },
  });
}
// Console's remaining methods (trace, table, time, assert, …) also stay off stdout.
Object.assign(console, new Console({ stdout: logStream("info"), stderr: logStream("error") }));
console.timeStamp = () => {};
for (const [method, level] of [
  ["log", "info"],
  ["info", "info"],
  ["debug", "debug"],
  ["warn", "warn"],
  ["error", "error"],
] as const) {
  console[method] = (...args: unknown[]) => log(level, args);
}
process.on("uncaughtException", (error) => fatal(error));
process.on("unhandledRejection", (error) => fatal(error));
process.stdout.on("error", () => process.exit(1));
process.stdin.on("error", fatal);

const modules = new Map([
  ["@raycast/api", new URL("./api/index.ts", import.meta.url).href],
  ...["react", "react/jsx-runtime", "react/jsx-dev-runtime"].map((name): [string, string] => [
    name,
    import.meta.resolve(name),
  ]),
]);
registerHooks({
  resolve(specifier, context, nextResolve) {
    const url = modules.get(specifier);
    return url ? { url, shortCircuit: true } : nextResolve(specifier, context);
  },
});
const root = createSceneRoot({
  publish: (scene) => send({ type: "scene", ...scene }),
  onWarning: (message) => log("warn", [message]),
  onError: fatal,
});
setCapabilityRequester((name, params) => {
  const id = String(nextRequest++);
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    send({ type: "capability.request", id, name, params });
  });
});

/**
 * Launch props for this command: the manifest arguments the host resolved and,
 * when another command started it, the `launchCommand` context. Blast only
 * launches user initiated commands (background launch is out of scope).
 */
function launchProps(command: Extract<HostMessage, { type: "init" }>["command"]): LaunchProps {
  return {
    arguments: command.arguments ?? {},
    launchType: LaunchType.UserInitiated,
    ...(command.launchContext === undefined ? {} : { launchContext: command.launchContext }),
  };
}

async function load(message: Extract<HostMessage, { type: "init" }>) {
  setEnvironment(message.environment);
  setPreferenceValues(message.preferences);
  const props = launchProps(message.command);
  const command = await import(pathToFileURL(message.command.entry).href);
  if (stopping) return;
  if (message.command.mode === "no-view") {
    setFeedbackMount(() => {
      if (!loaded) {
        loaded = true;
        root.render(createElement(NavigationProvider, { children: null }));
      }
    });
    // A no-view command runs until it settles, with a scene only for feedback.
    // A rejection is a fatal error through the caller's `.catch`.
    await (command.default as (props: LaunchProps) => unknown)(props);
    if (stopping) return;
    finish(0);
    return;
  }
  const element = createElement(command.default as ComponentType<LaunchProps>, props);
  root.render(
    message.command.mode === "menu-bar"
      ? element
      : createElement(NavigationProvider, { children: element }),
  );
  loaded = true;
}
function shutdown() {
  if (stopping) return;
  try {
    root.unmount();
    finish(0);
  } catch (error) {
    fatal(error);
  }
}
function handle(value: unknown) {
  if (stopping) return;
  const parsed = parseHostMessage(value);
  if (!parsed.ok) return fatal(parsed.error, "PROTOCOL_ERROR");
  const message = parsed.message;
  if (!initialized) {
    if (message.type !== "init" || message.protocol !== PROTOCOL_VERSION) {
      return fatal(`Expected init with protocol ${PROTOCOL_VERSION}`, "PROTOCOL_ERROR");
    }
    initialized = true;
    send({ type: "ready", protocol: PROTOCOL_VERSION });
    void load(message).catch(fatal);
    return;
  }
  switch (message.type) {
    case "init":
      return fatal("Duplicate init", "PROTOCOL_ERROR");
    case "shutdown":
      return shutdown();
    case "capability.result": {
      const request = pending.get(message.id);
      if (!request) return fatal(`Unknown capability id: ${message.id}`, "PROTOCOL_ERROR");
      pending.delete(message.id);
      if (message.ok) request.resolve(message.value);
      else
        request.reject(
          Object.assign(new Error(message.error.message), { code: message.error.code }),
        );
      return;
    }
    case "event": {
      if (!loaded) return fatal("Event before command loaded", "PROTOCOL_ERROR");
      const failed = (error: unknown) => {
        if (error instanceof UnsupportedApiError) fatal(error);
        else
          send({ type: "error", code: "EVENT_ERROR", message: errorMessage(error), fatal: false });
      };
      try {
        // Do not await: a handler can be waiting for a capability.result on stdin.
        void Promise.resolve(root.dispatch(message.node, message.handler, message.args)).catch(
          failed,
        );
      } catch (error) {
        failed(error);
      }
      try {
        root.flush();
      } catch (error) {
        fatal(error);
      }
    }
  }
}
const decoder = createLineDecoder({
  onLine: handle,
  onError: (error) => fatal(error, "PROTOCOL_ERROR"),
});
process.stdin.on("data", (chunk: Buffer) => decoder.push(chunk));
process.stdin.on("end", () => {
  decoder.end();
  shutdown();
});
