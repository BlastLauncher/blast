import { createLineDecoder, encodeMessage, type LogLevel } from "@blastlauncher/protocol";
import { Console } from "node:console";
import { registerHooks } from "node:module";
import { Writable } from "node:stream";
import { pathToFileURL } from "node:url";
import { format } from "node:util";
import { startRuntime } from "./core.ts";

let stopping = false;
const protocolWrite = process.stdout.write.bind(process.stdout);
function log(level: LogLevel, args: unknown[]) {
  if (!stopping) protocolWrite(encodeMessage({ type: "log", level, message: format(...args) }));
}
function logStream(level: LogLevel) {
  return new Writable({
    write(chunk, _encoding, callback) {
      log(level, [String(chunk).replace(/\n$/, "")]);
      callback();
    },
  });
}
const writeToStdout = protocolWrite;
process.stdout.write = ((chunk: unknown, encoding?: unknown, callback?: unknown) => {
  const done = typeof encoding === "function" ? encoding : callback;
  log("info", [String(chunk).replace(/\n$/, "")]);
  if (typeof done === "function") queueMicrotask(done as () => void);
  return true;
}) as typeof process.stdout.write;
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
const modules = new Map([
  ["@raycast/api", import.meta.resolve("@blastlauncher/runtime/api")],
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
// `runtime` is only read from stdin callbacks, after this assignment.
const runtime = startRuntime({
  send(message) {
    writeToStdout(encodeMessage(message));
  },
  onMessage(listener) {
    // The protocol decoder enforces the 8 MiB line cap (0001), strict UTF-8 and
    // the malformed/unterminated-line rules; do not hand-roll framing here.
    const decoder = createLineDecoder({
      onLine: listener,
      onError: (error) => runtime.fatal(error, "PROTOCOL_ERROR"),
    });
    const onData = (chunk: Buffer) => decoder.push(chunk);
    process.stdin.on("data", onData);
    process.stdin.on("end", () => {
      decoder.end();
      runtime();
    });
    return () => process.stdin.off("data", onData);
  },
  exit(code) {
    stopping = true;
    process.stdin.pause();
    process.stdout.end(() => process.exit(code));
  },
  log,
  loadCommand: (command) => import(pathToFileURL(command.entry).href),
});
process.on("uncaughtException", (error) => runtime.fatal(error));
process.on("unhandledRejection", (error) => runtime.fatal(error));
process.stdin.on("error", (error) => runtime.fatal(error));
// EPIPE means the host closed our stdout: a normal shutdown, not a crash.
process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EPIPE") process.exit(0);
  process.exit(1);
});
