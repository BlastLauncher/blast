import { encodeMessage, type LogLevel } from "@blastlauncher/protocol";
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
const decoder = new TextDecoder();
let buffer = "";
const runtime = startRuntime({
  send(message) {
    writeToStdout(`${JSON.stringify(message)}\n`);
  },
  onMessage(listener) {
    const onData = (chunk: Buffer) => {
      buffer += decoder.decode(chunk, { stream: true });
      for (;;) {
        const index = buffer.indexOf("\n");
        if (index < 0) break;
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        try {
          listener(JSON.parse(line));
        } catch (error) {
          listener({ __invalid: String(error) });
        }
      }
    };
    process.stdin.on("data", onData);
    process.stdin.on("end", () => {
      if (buffer) {
        try {
          listener(JSON.parse(buffer));
        } catch (error) {
          listener({ __invalid: String(error) });
        }
      }
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
process.stdout.on("error", () => process.exit(1));
